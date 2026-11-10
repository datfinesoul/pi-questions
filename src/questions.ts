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

function formatAnswerForModel(answer) {
  switch (answer.type) {
    case "text": return answer.label;
    case "other": return `Other: ${answer.label}`;
    case "option": return `${answer.index}. ${answer.label}`;
  }
}

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
    content: [{ type: "text", text: message }],
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
    text = answer.label.trim().length > 0 ? `User answered: ${answer.label}` : "User submitted an empty response";
  } else if (mode === "single-select") {
    text = `User selected: ${formatAnswerForModel(answers[0])}`;
  } else {
    text = `User selected:\n${answers.map((answer) => `- ${formatAnswerForModel(answer)}`).join("\n")}`;
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
