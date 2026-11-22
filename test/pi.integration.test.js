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
  const events = [];
  extension({
    registerTool(value) { tool = value; },
    on(event) { events.push(event); return () => {}; },
  });
  assert.equal(tool.name, "ask_user_question");
  assert.deepEqual(events, ["session_start"]);
  assert.equal(tool.exposure, "model-only");
  assert.ok(tool.promptGuidelines.some(line => line.includes("answer it in prose and end the turn")));
  const options = [{ label: "First", value: "first", description: "A longer description that wraps on narrow terminals." }];
  const clarification = "what did the alb guide say?";
  const cases = [
    [{ question: "Text?" }, ["answer", "\r"], "answered", "text"],
    [{ question: "Single?", options }, ["1", "\x1b[B", "\x1b[B", "\r"], "answered", "option"],
    [{ question: "Other?", options }, ["\x1b[B", "\r", "custom", "\r", "\x1b[B", "\r"], "answered", "custom", "custom"],
    [{ question: "Multi other?", options, multiSelect: true }, ["\x1b[B", "\r", "custom", "\r", "\x1b[B", "\r"], "answered", "custom", "custom"],
    [{ question: "Multi?", options, multiSelect: true }, [" ", "\x1b[B", "\x1b[B", "\r"], "answered", "option"],
    [{ question: "Cancel?", options }, ["\x1b"], "cancelled", undefined],
    [{ question: "Clarify text?" }, [clarification, "\r"], "answered", "text"],
    [{ question: "Clarify other?", options }, ["\x1b[B", "\r", clarification, "\r", "\x1b[B", "\r"], "answered", "custom", clarification],
    [{ question: "Clarify multi?", options, multiSelect: true }, ["\x1b[B", "\r", clarification, "\r", "\x1b[B", "\r"], "answered", "custom", clarification],
    [{ question: "Clarify mixed?", options, multiSelect: true }, [" ", "\x1b[B", "\r", clarification, "\r", "\x1b[B", "\r"], "answered", "option", clarification],
    [{ question: "Clarify single mixed?", options }, ["1", "\x1b[B", "\r", clarification, "\r", "\x1b[B", "\r"], "answered", "option", clarification],
    [{ question: "Ctrl enter?", options }, ["1", "\x1b[13;5u"], "answered", "option"],
    [{ question: "Ctrl enter note?", options }, ["1", "\x1b[B", "\x1b[B", "\r", "note", "\x1b[13;5u"], "answered", "option", "note"],
  ];
  for (const [params, keys, status, answerType, customText] of cases) {
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
          for (const key of keys) {
            component.handleInput(key);
            for (const width of [80, 20, 1, 40]) {
              const lines = component.render(width);
              assert.ok(lines.every(line => visibleWidth(line) <= width));
              const labelIndex = lines.indexOf("Your answer");
              if (labelIndex >= 0) {
                assert.equal(visibleWidth(lines[labelIndex + 1]), width);
                assert.doesNotMatch(lines[labelIndex + 1], /^ /);
                if (params.options) assert.ok(lines.some(line => line.includes("First")));
              }
            }
          }
        });
      } },
    });
    assert.equal(result.details.status, status);
    assert.equal(result.details.answers[0]?.type, answerType);
    const text = result.content[0].text;
    const custom = result.details.answers.find(answer => answer.type === "custom");
    if (answerType === "text" || custom) {
      assert.match(text, /If the reply asks a question or requests clarification, answer it in prose and end the turn\./);
      assert.match(text, /For clarification replies, do not repeat or rephrase the pending decision in that turn, and wait for the user's next message\./);
    }
    if (custom) {
      assert.match(text, /User supplied a custom reply:/);
      assert.equal(custom.value, customText);
      if (result.details.answers.some(answer => answer.type === "option")) {
        assert.match(text, params.multiSelect ? /User selected:\n- 1\. First/ : /User selected: 1\. First/);
        assert.doesNotMatch(text, /No listed option was selected/);
      } else {
        assert.match(text, /No listed option was selected\./);
      }
    }
    if (status === "cancelled") assert.match(text, /unless the user requests it/);
    assert.equal(result.terminate, undefined);
  }
});
