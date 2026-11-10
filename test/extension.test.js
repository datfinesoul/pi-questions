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
test('every flat prompt guideline identifies its tool', () => {
  assert.ok(tool.promptGuidelines.every(line => line.includes('ask_user_question')));
});
test('text, choices, custom answers, and multi-select preserve values', async () => {
  const options = [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }];
  const cases = [
    [{ question: 'Text?' }, [' typed ', 'enter'], ['typed']],
    [{ question: 'Single?', options }, ['down', 'enter'], ['b']],
    [{ question: 'Other?', options }, ['down', 'down', 'enter', ' custom ', 'enter'], ['custom']],
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
