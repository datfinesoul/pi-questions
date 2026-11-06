import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeOptions, getOtherLabel, sortAnswers, buildResult, cancelledResult, unavailableResult, withUILock } from "../src/questions.js";

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
  assert.match(buildResult("?", undefined, "multi-select", [{ type: "other", label: "custom", value: "custom" }]).content[0].text, /Other: custom/);
});
test("shared UI lock releases after failure", async () => {
  await assert.rejects(withUILock(async () => { throw new Error("failed"); }), /failed/);
  assert.equal(await withUILock(async () => "next"), "next");
});
