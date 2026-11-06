import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const entry = process.env.PI_CODING_AGENT_ENTRY;
test("installed Pi: tool registration, all answers, cancellation, and resize", {
  skip: !entry && "Set PI_CODING_AGENT_ENTRY to installed Pi dist/index.js",
}, async () => {
  const require = createRequire(entry);
  const { createJiti } = await import(require.resolve("jiti"));
  const tuiPath = require.resolve("@earendil-works/pi-tui");
  const jiti = createJiti(import.meta.url, { alias: {
    "@earendil-works/pi-coding-agent": entry,
    "@earendil-works/pi-tui": tuiPath,
    "typebox": require.resolve("typebox"),
  } });
  const { visibleWidth } = await import(tuiPath);
  const { default: extension } = await jiti.import("../extensions/questions/index.ts");
  let tool;
  extension({ registerTool(value) { tool = value; } });
  assert.equal(tool.name, "ask_user_question");
  assert.equal(tool.exposure, "model-only");
  const options = [{ label: "First", value: "first", description: "A longer description that wraps on narrow terminals." }];
  const cases = [
    [{ question: "Text?" }, ["answer", "\r"], "answered", "text"],
    [{ question: "Single?", options }, ["\r"], "answered", "option"],
    [{ question: "Other?", options }, ["\x1b[B", "\r", "custom", "\r"], "answered", "other"],
    [{ question: "Multi?", options, multiSelect: true }, [" ", "\x1b[B", "\x1b[B", "\r"], "answered", "option"],
    [{ question: "Cancel?", options }, ["\x1b"], "cancelled", undefined],
  ];
  for (const [params, keys, status, answerType] of cases) {
    const result = await tool.execute("test", params, undefined, undefined, {
      mode: "tui", hasUI: true,
      ui: { custom(factory) {
        return new Promise(resolve => {
          let component;
          const done = value => { component?.dispose?.(); resolve(value); };
          component = factory({ requestRender() {}, terminal: { rows: 24 } }, {
            fg: (_color, text) => text, bold: text => text,
          }, {}, done);
          for (const width of [80, 20, 1, 40]) {
            assert.ok(component.render(width).every(line => visibleWidth(line) <= width));
          }
          component.invalidate();
          for (const key of keys) component.handleInput(key);
        });
      } },
    });
    assert.equal(result.details.status, status);
    assert.equal(result.details.answers[0]?.type, answerType);
  }
});
