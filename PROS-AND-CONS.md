# Pi questions: pros and cons

This local extension copies `extensions/ask-user-question.ts` from `amosblomqvist/pi-config`. It retains the `ask_user_question` tool name. The project loads the package manifest through `.pi/settings.json`. This repository is an official ACP submodule with shared layout and checks. The README documents the license and initial CI exceptions.

## Pros

- The tool collects decisions through a keyboard-controlled interface.
- It supports text, single-select, and multi-select answers.
- Choice lists always include Other for a custom answer.
- Results include answer values and an explicit status.
- A shared UI lock prevents overlapping dialogs from tools that use the same lock.
- Choice rendering handles terminal width changes.
- Model guidance now reserves questions for decisions that materially affect the work.

## Abort fixes

- A queued question checks its abort signal before it opens.
- An active question closes when its abort signal fires.
- Closing an active question releases the shared UI lock.
- Dialog disposal removes the abort listener.
- Text input uses a custom editor because the standard editor API does not accept an abort signal.

## Cons and remaining limitations

- The tool requires an interactive Pi session. It has no headless fallback.
- Each call collects one question. Related decisions still require separate calls. A multi-question form remains deferred.
- An aborted queued call waits for earlier dialogs to finish before it returns cancellation. It does not open a dialog.
- Large choice lists have no explicit scrolling, filtering, or number shortcuts.
- Multi-select supports only one custom answer.
- The UI lock protects only tools that use the same global lock convention.
- Several internal UI types use `any`.
- Empty text answers are permitted. Empty Other answers are not permitted.
- Cancellation is a tool result, not an enforced approval policy.
- Model guidance does not validate question count or recommended option placement.

## Validation

Run the regression checks with `npm --prefix pi-questions test` from the control plane. Run `/reload` to load the extension in this project. Interactive terminal behavior still needs a manual check.
