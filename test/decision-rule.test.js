import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RULE_END, RULE_START, buildRuleBlock, parseConfig, upsertRuleBlock } from "../src/decision-rule.ts";
import { loadExtension } from "./helpers/extension.js";

async function project(seed = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "pi-questions-"));
  for (const [name, content] of Object.entries(seed)) {
    await mkdir(join(cwd, name, ".."), { recursive: true });
    await writeFile(join(cwd, name), content, "utf8");
  }
  return cwd;
}

function host(cwd, overrides = {}) {
  const notes = [];
  const prompts = [];
  const statuses = [];
  return {
    hasUI: true,
    mode: "tui",
    cwd,
    isProjectTrusted: () => true,
    ui: {
      notify: (message, level) => notes.push({ message, level }),
      setStatus: (key, text) => statuses.push({ key, text }),
      confirm: async (title, details) => {
        prompts.push({ title, details });
        return true;
      },
    },
    notes,
    prompts,
    statuses,
    ...overrides,
  };
}

const { handlers } = await loadExtension();
const sessionStart = handlers.get("session_start")[0];
const start = (ctx) => sessionStart({ type: "session_start", reason: "startup" }, ctx);
const readConfigFile = async (cwd) => JSON.parse(await readFile(join(cwd, ".pi", "questions.json"), "utf8"));

test("rule block is created, appended, replaced, and left alone when current", () => {
  const block = buildRuleBlock();
  assert.deepEqual(upsertRuleBlock(""), { content: `${block}\n`, action: "created" });
  assert.deepEqual(upsertRuleBlock("\n\n"), { content: `${block}\n`, action: "created" });
  assert.deepEqual(upsertRuleBlock("# Project\n"), { content: `# Project\n\n${block}\n`, action: "appended" });
  assert.deepEqual(upsertRuleBlock("# Project"), { content: `# Project\n\n${block}\n`, action: "appended" });
  assert.deepEqual(upsertRuleBlock(`# Project\n\n${block}\n\n## After\n`), {
    content: `# Project\n\n${block}\n\n## After\n`,
    action: "unchanged",
  });
  const stale = `# Project\n\n${RULE_START}\nold text\n${RULE_END}\n\n## After\n`;
  assert.deepEqual(upsertRuleBlock(stale), {
    content: `# Project\n\n${block}\n\n## After\n`,
    action: "replaced",
  });
});

test("a damaged marker pair is never rewritten", () => {
  for (const text of [`# Project\n${RULE_START}\n`, `# Project\n${RULE_END}\n`]) {
    assert.deepEqual(upsertRuleBlock(text), { content: text, action: "invalid" });
  }
});

test("configuration parsing keeps unknown keys and reports invalid values", () => {
  assert.deepEqual(parseConfig(null), { settings: {}, raw: {} });
  assert.deepEqual(parseConfig('{"decisionRule":"on","other":1}'), {
    settings: { decisionRule: "on" },
    raw: { decisionRule: "on", other: 1 },
  });
  assert.equal(parseConfig("").error, undefined);
  assert.match(parseConfig("{oops").error, /not valid JSON/);
  assert.match(parseConfig("[]").error, /JSON object/);
  assert.match(parseConfig('{"decisionRule":"maybe"}').error, /"on" or "off"/);
});

test("an accepted offer writes the block and records the decision", async () => {
  const cwd = await project({ "AGENTS.md": "# Project\n" });
  const ctx = host(cwd);
  await start(ctx);

  assert.equal(ctx.prompts.length, 1);
  assert.match(ctx.prompts[0].details, /asks this once for this project/);
  assert.match(ctx.prompts[0].details, /edit decisionRule in \.pi\/questions\.json/);
  assert.match(ctx.prompts[0].details, /delete that file to see this prompt again/);
  assert.equal((await readFile(join(cwd, "AGENTS.md"), "utf8")).startsWith("# Project\n\n"), true);
  assert.match(await readFile(join(cwd, "AGENTS.md"), "utf8"), /ask_user_question/);
  assert.deepEqual(await readConfigFile(cwd), { decisionRule: "on" });
  assert.deepEqual(ctx.notes.map((note) => note.level), ["info"]);
  assert.match(ctx.notes[0].message, /Run \/reload/);
  // The footer keeps the hint after Pi overwrites the chat status line on reload.
  assert.deepEqual(ctx.statuses.at(-1), { key: "pi-questions", text: "Run /reload to load the decision rule" });

  const again = host(cwd);
  await start(again);
  assert.equal(again.prompts.length, 0);
  assert.deepEqual(again.notes, []);
  assert.deepEqual(again.statuses, [{ key: "pi-questions", text: undefined }]);
});

test("the offer creates AGENTS.md when the project has none", async () => {
  const cwd = await project();
  await start(host(cwd));
  assert.equal(existsSync(join(cwd, "AGENTS.md")), true);
  assert.equal((await readFile(join(cwd, "AGENTS.md"), "utf8")), `${buildRuleBlock()}\n`);
});

test("a declined offer is remembered and touches no rule file", async () => {
  const cwd = await project();
  const ctx = host(cwd, { ui: { notify: () => {}, confirm: async () => false } });
  await start(ctx);

  assert.deepEqual(await readConfigFile(cwd), { decisionRule: "off" });
  assert.equal(existsSync(join(cwd, "AGENTS.md")), false);
  assert.deepEqual(ctx.notes, []);

  const again = host(cwd, { ui: { notify: () => {}, confirm: async () => { throw new Error("must not ask"); } } });
  await start(again);
});

test("an existing block does not skip the offer and is not duplicated", async () => {
  const original = `# Project\n\n${buildRuleBlock()}\n`;
  const cwd = await project({ "AGENTS.md": original });
  const ctx = host(cwd);
  await start(ctx);

  assert.equal(ctx.prompts.length, 1);
  assert.equal(await readFile(join(cwd, "AGENTS.md"), "utf8"), original);
  assert.deepEqual(await readConfigFile(cwd), { decisionRule: "on" });
  assert.deepEqual(ctx.notes.map((note) => note.level), ["info"]);
  assert.match(ctx.notes[0].message, /already in .*AGENTS\.md\. No reload is needed/);
  // Nothing was written, so nothing needs a reload.
  assert.deepEqual(ctx.statuses, [{ key: "pi-questions", text: undefined }]);
});

test("declining leaves an existing block in place", async () => {
  const original = `# Project\n\n${buildRuleBlock()}\n`;
  const cwd = await project({ "AGENTS.md": original });
  await start(host(cwd, { ui: { notify: () => {}, setStatus: () => {}, confirm: async () => false } }));

  assert.equal(await readFile(join(cwd, "AGENTS.md"), "utf8"), original);
  assert.deepEqual(await readConfigFile(cwd), { decisionRule: "off" });
});

test("a recorded decision keeps the owned block current", async () => {
  const cwd = await project({
    ".pi/questions.json": '{"decisionRule":"on"}',
    "AGENTS.md": `# Project\n\n${RULE_START}\nold text\n${RULE_END}\n`,
  });
  const ctx = host(cwd);
  await start(ctx);

  assert.equal(ctx.prompts.length, 0);
  assert.equal(await readFile(join(cwd, "AGENTS.md"), "utf8"), `# Project\n\n${buildRuleBlock()}\n`);
  assert.match(ctx.notes[0].message, /Run \/reload/);
});

test("a recorded decision restores a deleted block", async () => {
  const cwd = await project({ ".pi/questions.json": '{"decisionRule":"on"}', "AGENTS.md": "# Project\n" });
  const ctx = host(cwd);
  await start(ctx);
  assert.equal((await readFile(join(cwd, "AGENTS.md"), "utf8")).includes(RULE_START), true);
  assert.equal(ctx.prompts.length, 0);
});

test("headless sessions write nothing and record nothing", async () => {
  const cwd = await project();
  const ctx = host(cwd, { hasUI: false });
  await start(ctx);
  assert.equal(ctx.prompts.length, 0);
  assert.equal(existsSync(join(cwd, "AGENTS.md")), false);
  assert.equal(existsSync(join(cwd, ".pi", "questions.json")), false);
});

test("an untrusted project is left alone", async () => {
  const cwd = await project();
  const ctx = host(cwd, { isProjectTrusted: () => false });
  await start(ctx);
  assert.equal(ctx.prompts.length, 0);
  assert.equal(existsSync(join(cwd, "AGENTS.md")), false);
});

test("an invalid configuration is reported before the offer", async () => {
  const cwd = await project({ ".pi/questions.json": '{"decisionRule":"maybe"}' });
  const ctx = host(cwd);
  await start(ctx);

  assert.match(ctx.notes[0].message, /decisionRule must be "on" or "off"/);
  assert.equal(ctx.notes[0].level, "warning");
  assert.equal(ctx.prompts.length, 1);
  assert.deepEqual(await readConfigFile(cwd), { decisionRule: "on" });
});

test("a damaged marker pair reports a warning and records nothing", async () => {
  const cwd = await project({ "AGENTS.md": `# Project\n${RULE_START}\n` });
  const ctx = host(cwd);
  await start(ctx);

  assert.equal(ctx.prompts.length, 1);
  assert.equal(ctx.notes[0].level, "warning");
  assert.match(ctx.notes[0].message, /one decision-rule marker but not the other/);
  assert.equal(existsSync(join(cwd, ".pi", "questions.json")), false);
  assert.equal(await readFile(join(cwd, "AGENTS.md"), "utf8"), `# Project\n${RULE_START}\n`);
});
