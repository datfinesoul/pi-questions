import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from '/Users/philip.hadviger/.pi/agent/install/releases/1.5.0/node_modules/jiti/lib/jiti.mjs';
const root = '/Users/philip.hadviger/.pi/agent/install/releases/1.5.0/node_modules/';
const jiti = createJiti(import.meta.url, { alias: {
  '@mariozechner/pi-tui': `${root}@earendil-works/pi-tui/dist/index.js`,
  '@sinclair/typebox': `${root}typebox/build/index.mjs`,
}});
const extension = await jiti.import('./pi-questions.ts', { default: true });
let tool;
extension({ registerTool(value) { tool = value; } });
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
const tick = () => new Promise(resolve => setImmediate(resolve));
function ui() {
  let opens = 0, closes = 0;
  return {
    get opens() { return opens; }, get closes() { return closes; },
    hasUI: true,
    ui: { custom(factory) {
      opens++;
      return new Promise(resolve => {
        let component;
        const done = value => { closes++; component?.dispose?.(); resolve(value); };
        component = factory({ requestRender() {} }, { fg: (_color, text) => text }, {}, done);
      });
    } },
  };
}
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
test('no UI returns unavailable', async () => {
  assert.equal((await tool.execute('id', { question: '?' }, undefined, undefined, { hasUI: false })).details.status, 'unavailable');
});
