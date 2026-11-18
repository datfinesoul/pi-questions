// Adapted from amosblomqvist/pi-config. See README.md, Attribution.
export function normalizeOptions(options) {
  return (options || [])
    .map((option) => ({
      label: option.label.trim(),
      value: option.value?.trim() || option.label.trim(),
      description: option.description?.trim() || undefined,
    }))
    .filter((option) => option.label.length > 0);
}

export function getOtherLabel(options) {
  return options.some((option) => option.label.toLowerCase() === "other") ? "Other (custom)" : "Other";
}

function formatSelectionForModel(mode, answers) {
  const labels = answers.map((answer) => `${answer.index}. ${answer.label}`);
  return mode === "single-select"
    ? `User selected: ${labels[0]}`
    : `User selected:\n${labels.map((label) => `- ${label}`).join("\n")}`;
}

const CLARIFICATION_GUIDANCE = [
  "A reply in the user's own words can be a valid answer.",
  "If the reply asks a question or requests clarification, answer it in prose and end the turn.",
  "For clarification replies, do not repeat or rephrase the pending decision in that turn, and wait for the user's next message.",
  "You may briefly state that the decision remains open in prose.",
].join(" ");

function answerSortRank(answer) {
  switch (answer.type) {
    case "option": return answer.index;
    case "other": return Number.MAX_SAFE_INTEGER - 1;
    case "text": return Number.MAX_SAFE_INTEGER;
  }
}

export function sortAnswers(answers) {
  return [...answers].sort((a, b) => answerSortRank(a) - answerSortRank(b));
}

export function buildStructuredResult(status, question, mode, answers, context, message) {
  return { status, question, context, mode, answers, message };
}

export function cancelledResult(question, mode, context) {
  const message = "User cancelled the question";
  return {
    content: [{ type: "text", text: `${message}. Do not repeat or rephrase this question unless the user requests it. You may briefly state that the decision remains open in prose.` }],
    details: buildStructuredResult("cancelled", question, mode, [], context, message),
  };
}

export function unavailableResult(question, mode, message, context) {
  return {
    content: [{ type: "text", text: message }],
    details: buildStructuredResult("unavailable", question, mode, [], context, message),
  };
}

export function buildResult(question, context, mode, answers) {
  let text;
  if (mode === "text") {
    const answer = answers[0];
    text = answer.label.trim().length > 0
      ? `User replied: ${answer.label}\n\n${CLARIFICATION_GUIDANCE}`
      : "User submitted an empty response";
  } else {
    const selected = answers.filter((answer) => answer.type === "option");
    const custom = answers.filter((answer) => answer.type === "other");
    if (custom.length > 0) {
      text = [
        selected.length > 0 ? formatSelectionForModel(mode, selected) : "No listed option was selected.",
        ...custom.map((answer) => `User supplied a custom reply: ${JSON.stringify(answer.label)}`),
        CLARIFICATION_GUIDANCE,
      ].join("\n\n");
    } else {
      text = formatSelectionForModel(mode, selected);
    }
  }
  return {
    content: [{ type: "text", text }],
    details: buildStructuredResult("answered", question, mode, answers, context),
  };
}

// Cooperating extensions share this process-level mutex to serialize custom UI.
const SHARED_UI_LOCK_KEY = "__piSharedUiLock";
function getSharedUiLock() {
  if (!globalThis[SHARED_UI_LOCK_KEY]) {
    let chain = Promise.resolve();
    globalThis[SHARED_UI_LOCK_KEY] = {
      withLock(fn) {
        const previous = chain;
        let release;
        chain = new Promise((resolve) => { release = resolve; });
        return previous.then(fn).finally(() => release());
      },
    };
  }
  return globalThis[SHARED_UI_LOCK_KEY];
}
const sharedUiLock = getSharedUiLock();

export function withUILock(fn) {
  return sharedUiLock.withLock(fn);
}
