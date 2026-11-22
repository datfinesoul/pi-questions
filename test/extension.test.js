import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTool, ui, tick } from "./helpers/extension.js";
const tool = await loadTool();

test('tool guidance requests concise wording without losing decision-critical information', () => {
  const guidance = tool.promptGuidelines.join('\n');
  assert.match(guidance, /STE100-inspired/);
  assert.match(guidance, /Omit details unless/);
  assert.match(guidance, /at most 40 words/);
  assert.match(guidance, /Preserve essential risks, conditions, uncertainty/);
  assert.match(guidance, /Never truncate text/);
  const fields = tool.parameters.properties;
  assert.match(fields.question.description, /20 words or fewer/);
  assert.match(fields.details.description, /1–2 short sentences/);
  assert.match(fields.details.description, /Preserve essential risks and conditions/);
  assert.match(fields.options.items.properties.label.description, /2–6 words/);
  assert.match(fields.options.items.properties.description.description, /one short sentence/);
});
test('tool guidance keeps references clear and separates answers from execution approval', () => {
  const guidance = tool.promptGuidelines.join('\n');
  assert.match(guidance, /Make each question self-contained/);
  assert.match(guidance, /use a clear reference and briefly name the proposal/);
  assert.match(guidance, /Do not rely only on positions/);
  assert.match(guidance, /authorization only for the action explicitly asked about/);
  assert.match(guidance, /Selecting an approach does not by itself authorize its execution/);
  assert.match(guidance, /Cancellation, unavailable UI, and empty text do not imply approval/);
});
test('tool guidance allows clarification without another decision question', () => {
  const guidance = tool.promptGuidelines.join('\n');
  assert.match(guidance, /If the user replies with a question or asks for clarification, answer it in prose and end the turn\./);
  assert.match(guidance, /For clarification replies, do not repeat or rephrase the pending decision in that turn, and wait for the user's next message\./);
  assert.match(guidance, /If the user cancels a question, do not repeat or rephrase it unless the user requests it\./);
  assert.match(guidance, /decision remains open in prose/);
});
test('clarification replies reach the model in every input mode without losing selections', async () => {
  const reply = 'what did the alb guide say?';
  const options = [{ label: 'Fix the links', value: 'links' }];
  const cases = [
    [{ question: 'Which findings should I fix?' }, [reply, 'enter'], ['text']],
    [{ question: 'Which findings should I fix?', options }, ['down', 'enter', reply, 'enter', 'down', 'enter'], ['other']],
    [{ question: 'Which findings should I fix?', options, multiSelect: true }, ['down', 'enter', reply, 'enter', 'down', 'enter'], ['other']],
    [{ question: 'Which findings should I fix?', options, multiSelect: true }, ['space', 'down', 'enter', reply, 'enter', 'down', 'enter'], ['option', 'other']],
  ];
  for (const [params, keys, types] of cases) {
    const ctx = ui();
    const pending = tool.execute('clarify', params, undefined, undefined, ctx);
    await tick();
    for (const key of keys) ctx.component.handleInput(key);
    const result = await pending;
    assert.equal(result.details.status, 'answered');
    assert.deepEqual(result.details.answers.map(answer => answer.type), types);
    assert.equal(result.details.answers.at(-1).value, reply);
    assert.ok(result.content[0].text.includes(reply));
    assert.match(result.content[0].text, /answer it in prose and end the turn/);
    assert.match(result.content[0].text, /For clarification replies, do not repeat or rephrase the pending decision/);
    if (types.includes('option')) {
      assert.equal(result.details.answers[0].value, 'links');
      assert.match(result.content[0].text, /User selected:\n- 1\. Fix the links/);
      assert.doesNotMatch(result.content[0].text, /No listed option was selected/);
    }
    assert.equal(ctx.opens, 1);
    assert.equal(ctx.closes, 1);
    assert.equal(result.terminate, undefined);
  }
});
test('text questions separate context and label the answer area', async () => {
  for (const details of [undefined, 'Choose the profile you manage.']) {
    const ctx = ui();
    const controller = new AbortController();
    const pending = tool.execute('text-layout', { question: 'Which profile?', details }, controller.signal, undefined, ctx);
    await tick();
    const lines = ctx.component.render(80);
    assert.equal(lines[0], "─".repeat(80));
    assert.equal(lines.at(-1), "─".repeat(80));
    const expected = details
      ? [' Which profile?', '', ` ${details}`, '', 'Your answer']
      : [' Which profile?', '', 'Your answer'];
    assert.deepEqual(lines.slice(1, 1 + expected.length), expected);
    controller.abort();
    await pending;
  }
});
test('active abort closes every mode and releases the lock', async () => {
  for (const params of [{ question: 'Text?' }, { question: 'Single?', options: [{ label: 'A' }] }, { question: 'Multi?', options: [{ label: 'A' }], multiSelect: true }]) {
    const ctx = ui(); const controller = new AbortController();
    const pending = tool.execute('id', params, controller.signal, undefined, ctx);
    await tick(); assert.equal(ctx.opens, 1);
    controller.abort();
    assert.equal((await pending).details.status, 'cancelled');
    assert.equal(ctx.closes, 1);
  }
});
test('aborted queued question never opens', async () => {
  const first = ui(), second = ui();
  const a = new AbortController(), b = new AbortController();
  const one = tool.execute('one', { question: 'First?' }, a.signal, undefined, first);
  const two = tool.execute('two', { question: 'Second?' }, b.signal, undefined, second);
  await tick(); b.abort(); a.abort();
  await one;
  assert.equal((await two).details.status, 'cancelled');
  assert.equal(second.opens, 0);
});
test('non-TUI modes return unavailable without opening a custom component', async () => {
  for (const mode of ['rpc', 'print', 'json']) {
    const ctx = ui(mode);
    assert.equal((await tool.execute('id', { question: '?' }, undefined, undefined, ctx)).details.status, 'unavailable');
    assert.equal(ctx.opens, 0);
  }
});
test('already-aborted calls never open', async () => {
  const ctx = ui();
  const controller = new AbortController();
  controller.abort();
  assert.equal((await tool.execute('id', { question: '?' }, controller.signal, undefined, ctx)).details.status, 'cancelled');
  assert.equal(ctx.opens, 0);
});
test('number shortcuts toggle answers in both choice modes', async () => {
  const options = Array.from({ length: 10 }, (_, i) => ({ label: `Choice ${i + 1}`, value: String(i + 1) }));
  for (const multiSelect of [false, true]) {
    const ctx = ui();
    const pending = tool.execute('numbers', { question: 'Choose?', options, multiSelect }, undefined, undefined, ctx);
    await tick();
    let rendered = ctx.component.render(120).join('\n');
    assert.match(rendered, /1-9/);
    assert.match(rendered, /> 1 ○ Choice 1/);
    assert.match(rendered, /· ○ Choice 10/);
    assert.match(rendered, /· ○ \[Other\]/);
    assert.doesNotMatch(rendered, /11 ○/);
    assert.doesNotMatch(rendered, /\[ \]/);
    for (const key of ['0', 'x', '12']) ctx.component.handleInput(key);
    assert.equal(ctx.closes, 0);
    ctx.component.handleInput('9');
    assert.match(ctx.component.render(120).join('\n'), /9 ● Choice 9/);
    ctx.component.handleInput('9');
    assert.match(ctx.component.render(120).join('\n'), /9 ○ Choice 9/);
    ctx.component.handleInput('9');
    ctx.component.handleInput('1');
    rendered = ctx.component.render(120).join('\n');
    assert.match(rendered, /1 ● Choice 1/);
    assert.equal(/9 ● Choice 9/.test(rendered), multiSelect);
    assert.equal(ctx.closes, 0);
    ctx.component.handleInput('enter');
    const result = await pending;
    assert.deepEqual(result.details.answers.map(answer => answer.value), multiSelect ? ['1', '9'] : ['1']);
  }
});
test('Enter submits from any row only when an answer is selected', async () => {
  for (const multiSelect of [false, true]) {
    const ctx = ui();
    const pending = tool.execute('enter-submit', { question: 'Choose?', options: [{ label: 'A' }, { label: 'B' }], multiSelect }, undefined, undefined, ctx);
    await tick();
    ctx.component.handleInput('enter');
    assert.equal(ctx.closes, 0);
    let rendered = ctx.component.render(120).join('\n');
    assert.match(rendered, /Select at least one answer before submitting/);
    assert.match(rendered, /^ *Submit$/m);
    assert.doesNotMatch(rendered, /[○●✓] Submit/);
    ctx.component.handleInput('space');
    assert.match(ctx.component.render(120).join('\n'), /Submit \(1 selected\)/);
    ctx.component.handleInput('down');
    ctx.component.handleInput('enter');
    assert.deepEqual((await pending).details.answers.map(answer => answer.value), ['A']);
  }
});
test('number keys preserve custom and free-form text and ignore missing choices', async () => {
  const options = [{ label: 'A', value: 'a' }];
  for (const multiSelect of [false, true]) {
    const ctx = ui();
    const pending = tool.execute('custom-number', { question: 'Choose?', options, multiSelect }, undefined, undefined, ctx);
    await tick();
    for (const key of ['3', '9']) ctx.component.handleInput(key);
    assert.equal(ctx.closes, 0);
    for (const key of ['down', 'enter', '1', '9', 'enter', 'down', 'enter']) ctx.component.handleInput(key);
    assert.deepEqual((await pending).details.answers.map(answer => answer.value), ['19']);
  }
  const ctx = ui();
  const pending = tool.execute('text-number', { question: 'Number?' }, undefined, undefined, ctx);
  await tick();
  for (const key of ['1', '9', 'enter']) ctx.component.handleInput(key);
  assert.deepEqual((await pending).details.answers.map(answer => answer.value), ['19']);
});
test('every flat prompt guideline identifies its tool', () => {
  assert.ok(tool.promptGuidelines.every(line => line.includes('ask_user_question')));
});
test('text, choices, custom answers, and multi-select preserve values', async () => {
  const options = [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }];
  const cases = [
    [{ question: 'Text?' }, [' typed ', 'enter'], ['typed']],
    [{ question: 'Single?', options }, ['2', 'enter'], ['b']],
    [{ question: 'Other?', options }, ['down', 'down', 'enter', ' custom ', 'enter', 'down', 'enter'], ['custom']],
    [{ question: 'Multi?', options, multiSelect: true }, ['down', 'space', 'up', 'space', 'down', 'down', 'down', 'enter'], ['a', 'b']],
  ];
  for (const [params, keys, values] of cases) {
    const ctx = ui();
    const pending = tool.execute('id', params, undefined, undefined, ctx);
    await tick();
    for (const width of [80, 20, 1, 40]) assert.ok(ctx.component.render(width).every(line => Array.from(line).length <= width));
    for (const key of keys) ctx.component.handleInput(key);
    const result = await pending;
    assert.equal(result.details.status, 'answered');
    assert.deepEqual(result.details.answers.map(answer => answer.value), values);
  }
});
test('single-select answers can combine one option with Other text', async () => {
  const options = [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }];
  let ctx = ui();
  let pending = tool.execute('single-mixed', { question: 'Choose?', options }, undefined, undefined, ctx);
  await tick();
  for (const key of ['1', 'down', 'down', 'enter', ' plus a note', 'enter', 'down', 'enter']) ctx.component.handleInput(key);
  let result = await pending;
  assert.equal(result.details.status, 'answered');
  assert.equal(result.details.mode, 'single-select');
  assert.deepEqual(result.details.answers.map(answer => answer.value), ['a', 'plus a note']);
  assert.match(result.content[0].text, /User selected: 1\. A/);
  assert.match(result.content[0].text, /User supplied a custom reply: "plus a note"/);
  assert.doesNotMatch(result.content[0].text, /No listed option was selected/);

  ctx = ui();
  pending = tool.execute('single-other-only', { question: 'Choose?', options }, undefined, undefined, ctx);
  await tick();
  for (const key of ['down', 'down', 'enter', 'custom', 'enter', 'down', 'enter']) ctx.component.handleInput(key);
  result = await pending;
  assert.deepEqual(result.details.answers.map(answer => answer.value), ['custom']);
  assert.match(result.content[0].text, /No listed option was selected\./);

  ctx = ui();
  pending = tool.execute('single-replace', { question: 'Choose?', options }, undefined, undefined, ctx);
  await tick();
  for (const key of ['1', '2', 'enter']) ctx.component.handleInput(key);
  assert.deepEqual((await pending).details.answers.map(answer => answer.value), ['b']);
});
test('ctrl+enter submits the selection from any row and from the Other editor', async () => {
  const options = [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }];
  for (const multiSelect of [false, true]) {
    const ctx = ui();
    const pending = tool.execute('ctrl-enter', { question: 'Choose?', options, multiSelect }, undefined, undefined, ctx);
    await tick();
    ctx.component.handleInput('ctrl+enter');
    assert.equal(ctx.closes, 0);
    for (const key of ['2', 'down', 'ctrl+enter']) ctx.component.handleInput(key);
    assert.deepEqual((await pending).details.answers.map(answer => answer.value), ['b']);
  }

  const ctx = ui();
  const pending = tool.execute('ctrl-enter-editor', { question: 'Choose?', options }, undefined, undefined, ctx);
  await tick();
  for (const key of ['1', 'down', 'down', 'enter', 'note', 'ctrl+enter']) ctx.component.handleInput(key);
  assert.deepEqual((await pending).details.answers.map(answer => answer.value), ['a', 'note']);
});
test('Other takes the next number and its number opens the editor', async () => {
  const options = [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }];
  const ctx = ui();
  const pending = tool.execute('other-number', { question: 'Choose?', options }, undefined, undefined, ctx);
  await tick();
  assert.match(ctx.component.render(80).join('\n'), /3 ○ \[Other\]/);
  for (const key of ['3', 'note', 'enter', '1', 'enter']) ctx.component.handleInput(key);
  const result = await pending;
  assert.deepEqual(result.details.answers.map(answer => answer.value), ['a', 'note']);

  const labelled = ui();
  const second = tool.execute('other-labelled', { question: 'Pick?', options: [{ label: 'Other' }] }, undefined, undefined, labelled);
  await tick();
  assert.match(labelled.component.render(80).join('\n'), /2 ○ \[Other \(custom\)\]/);
  labelled.component.handleInput('escape');
  assert.equal((await second).details.status, 'cancelled');
});
