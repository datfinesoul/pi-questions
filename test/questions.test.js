import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeOptions, getOtherLabel, sortAnswers, buildResult, cancelledResult, unavailableResult, withUILock } from "../src/questions.ts";

test("options trim fields, default values, and omit blank labels", () => {
  assert.deepEqual(normalizeOptions(undefined), []);
  assert.deepEqual(normalizeOptions([{ label: "  A ", value: " ", description: " help " }, { label: " " }]), [
    { label: "A", value: "A", description: "help" },
  ]);
  assert.equal(getOtherLabel([{ label: "OTHER" }]), "Other (custom)");
  assert.equal(getOtherLabel([]), "Other");
});
test("multi-select sorts by original index without mutating input", () => {
  const answers = [{ type: "other", label: "custom", value: "custom" }, { type: "option", label: "B", value: "b", index: 2 }, { type: "option", label: "A", value: "a", index: 1 }];
  assert.deepEqual(sortAnswers(answers).map(a => a.label), ["A", "B", "custom"]);
  assert.equal(answers[0].type, "other");
});
test("results retain question, context, values, and explicit status", () => {
  const answer = { type: "option", label: "A", value: "a", index: 1 };
  const result = buildResult("Which?", "Context", "single-select", [answer]);
  assert.equal(result.content[0].text, "User selected: 1. A");
  assert.deepEqual(result.details, { status: "answered", question: "Which?", context: "Context", mode: "single-select", answers: [answer], message: undefined });
  assert.equal(cancelledResult("?", "text").details.status, "cancelled");
  assert.equal(unavailableResult("?", "text", "No UI").details.message, "No UI");
  assert.match(buildResult("?", undefined, "text", [{ type: "text", label: "", value: "" }]).content[0].text, /empty response/);
});
test("custom replies are distinct from listed selections without guessing intent", () => {
  for (const mode of ["single-select", "multi-select"]) {
    for (const label of ["what did the alb guide say?", "explain the ALB finding", "Use a different guide", 'Use the "why?" label']) {
      const answer = { type: "other", label, value: label };
      const result = buildResult("Which findings should I fix?", "Context", mode, [answer]);
      const text = result.content[0].text;
      assert.match(text, /No listed option was selected\./);
      assert.ok(text.includes(`User supplied a custom reply: ${JSON.stringify(label)}`));
      assert.doesNotMatch(text, /User selected:|User answered:/);
      assert.match(text, /If the reply asks a question or requests clarification, answer it in prose and end the turn\./);
      assert.match(text, /For clarification replies, do not repeat or rephrase the pending decision in that turn, and wait for the user's next message\./);
      assert.match(text, /decision remains open in prose/);
      assert.match(text, /can be a valid answer/);
      assert.deepEqual(result.details, { status: "answered", question: "Which findings should I fix?", context: "Context", mode, answers: [answer], message: undefined });
      assert.equal(result.terminate, undefined);
    }
  }
});
test("mixed multi-select results keep listed selections separate from custom replies", () => {
  const answers = [
    { type: "option", label: "Fix the links", value: "links", index: 1 },
    { type: "option", label: "Fix the examples", value: "examples", index: 3 },
    { type: "other", label: "what did the alb guide say?", value: "what did the alb guide say?" },
  ];
  const original = structuredClone(answers);
  const result = buildResult("Which findings should I fix?", undefined, "multi-select", answers);
  const text = result.content[0].text;
  assert.ok(text.startsWith('User selected:\n- 1. Fix the links\n- 3. Fix the examples\n\nUser supplied a custom reply: "what did the alb guide say?"'));
  assert.doesNotMatch(text, /No listed option was selected|\n- Other:/);
  assert.match(text, /If the reply asks a question or requests clarification/);
  assert.deepEqual(result.details.answers, original);
  assert.deepEqual(answers, original);
});
test("free-text replies use neutral wording and conditional clarification guidance", () => {
  for (const label of ["what did the alb guide say?", "explain the ALB finding", "Use the revised guide"]) {
    const answer = { type: "text", label, value: label };
    const result = buildResult("Which guide?", undefined, "text", [answer]);
    assert.ok(result.content[0].text.startsWith(`User replied: ${label}\n\n`));
    assert.match(result.content[0].text, /If the reply asks a question or requests clarification, answer it in prose and end the turn\./);
    assert.match(result.content[0].text, /For clarification replies, do not repeat or rephrase the pending decision in that turn, and wait for the user's next message\./);
    assert.deepEqual(result.details.answers, [answer]);
    assert.equal(result.details.status, "answered");
    assert.equal(result.terminate, undefined);
  }
  assert.equal(buildResult("?", undefined, "text", [{ type: "text", label: "  ", value: "  " }]).content[0].text, "User submitted an empty response");
});
test("listed selections retain their result text without clarification instructions", () => {
  const answers = [
    { type: "option", label: "A", value: "a", index: 1 },
    { type: "option", label: "B", value: "b", index: 2 },
  ];
  assert.equal(buildResult("?", undefined, "single-select", [answers[0]]).content[0].text, "User selected: 1. A");
  assert.equal(buildResult("?", undefined, "multi-select", answers).content[0].text, "User selected:\n- 1. A\n- 2. B");
});
test("cancellation discourages retries without changing structured details", () => {
  for (const mode of ["text", "single-select", "multi-select"]) {
    const result = cancelledResult("Which?", mode, "Context");
    assert.match(result.content[0].text, /^User cancelled the question\./);
    assert.match(result.content[0].text, /Do not repeat or rephrase this question unless the user requests it\./);
    assert.match(result.content[0].text, /decision remains open in prose/);
    assert.deepEqual(result.details, { status: "cancelled", question: "Which?", context: "Context", mode, answers: [], message: "User cancelled the question" });
  }
});
test("shared UI lock releases after failure", async () => {
  await assert.rejects(withUILock(async () => { throw new Error("failed"); }), /failed/);
  assert.equal(await withUILock(async () => "next"), "next");
});
