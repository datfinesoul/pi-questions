# pi-questions

[![License scope](https://img.shields.io/badge/license-see_LICENSE-lightgrey.svg)](LICENSE)

A [Pi](https://github.com/earendil-works/pi) extension that provides `ask_user_question` for focused decisions. It supports free-form text, single-select choices, and multi-select choices with a custom answer.

## Installation

### Global installation

```sh
pi install git:github.com/datfinesoul/pi-questions
```

Pi records the package in `~/.pi/agent/settings.json`.

### Project installation

```sh
pi install --local git:github.com/datfinesoul/pi-questions
```

Pi records the package in `.pi/settings.json`. Project packages load only after Pi grants project trust. Run `/reload` or start a new session after installation.

> [!NOTE]
> Pi identifies a package by where it was installed from. Installing pi-questions globally and for a project from the same source is fine: the project installation replaces the global one. Installing it from different locations, such as GitHub globally and a local checkout for a project, loads both copies, and Pi does not reconcile them.

<details>
<summary>Install from a local checkout</summary>

Install globally:

```sh
pi install /path/to/pi-questions
```

Install for the current project:

```sh
pi install --local /path/to/pi-questions
```

Try the checkout without changing settings:

```sh
pi --no-extensions --extension ./extensions/questions/index.ts
```

> The former entry point was `pi-questions.ts`. Replace direct extension entries with the package directory. Remove other copies of `ask_user_question` to prevent duplicate registration.

</details>

## Usage

The model calls `ask_user_question` when missing information or a decision materially affects the work. The extension adds no slash command or global shortcut.

- **Text:** Type an answer. Press Enter to submit or Esc to cancel. Empty text answers are permitted.
- **Single-select:** Use Up and Down to move. Press Enter to select an option.
- **Other:** Select Other to enter custom text. Press Enter to submit or Esc to return to the choices. Custom text must not be empty.
- **Multi-select:** Use Space or Enter to toggle an option. Select Submit and press Enter to submit at least one answer. Other supports one custom answer.
- **Cancel:** Press Esc from the choice list to cancel.

Tool arguments:

| Field | Meaning |
| --- | --- |
| `question` | One direct question. |
| `details` | Optional context needed for the decision. |
| `options` | Optional list of `{ label, value?, description? }` objects. Omit it or use an empty list for text input. |
| `multiSelect` | Set to `true` to permit multiple choices. It has no effect without options. |

Option labels, values, and descriptions lose surrounding whitespace. A missing or blank value defaults to its label. Blank labels are omitted. Choice lists always include Other. If a supplied option is named Other, the custom entry becomes Other (custom).

## How it works

The extension registers one model-only tool and opens a custom component in interactive terminal sessions. RPC, JSON, and print sessions return `unavailable` without opening a dialog. There are no configuration files, background processes, or network requests.

Results contain model-facing text and structured `details`: `status`, `question`, `context`, `mode`, `answers`, and an optional `message`. Status is `answered`, `cancelled`, or `unavailable`. Answers contain a type, label, and value. Listed options also include a one-based index. Multi-select answers retain option order, followed by custom text.

A shared process-level lock serializes dialogs with other extensions that use `__piSharedUiLock`. An active abort closes the dialog and releases its listener and lock. An aborted queued call waits for earlier dialogs before it returns cancellation. It does not open a dialog.

The extension returns answers to the model through ordinary tool results, which Pi can store in the session. Do not enter secrets. Cancellation is not an authorization policy. This extension is not a security boundary.

Choice rendering caches by terminal width. Large choice lists have no explicit scrolling, filtering, or number shortcuts. The extension collects one question per call. Prompt guidance does not enforce question count or recommendation order.

### Attribution

This module adapts `extensions/ask-user-question.ts` from [amosblomqvist/pi-config](https://github.com/amosblomqvist/pi-config), by [amosblomqvist](https://github.com/amosblomqvist). The initial local import did not record its upstream commit. The [upstream README](https://github.com/amosblomqvist/pi-config/blob/f82da563ab05d66729492d64c7ed4e96db3663f3/README.md) explicitly invites users to copy individual extensions, including this file.

The upstream repository had no license file or declared SPDX license when checked on 2026-11-06. This module preserves attribution and that copying invitation. It does not claim that upstream code uses MIT. [LICENSE](LICENSE) applies MIT only to original contributions by Philip Hadviger.

This license scope is an explicit exception to the ACP module standard. The initial CI version gate also accepts a missing base manifest because adoption adds the first `package.json`. Later comparisons require a higher version as usual.

## Development

The package needs no runtime dependencies beyond the Pi host. It has no build step. Runtime helpers use `.ts` files so `/reload` can refresh imported logic. Node.js imports these helpers directly in unit tests. Tests and package checks work with npm or pnpm:

```sh
npm test
npm run pack:check
```

Use `pnpm test` and `pnpm run pack:check` with pnpm. The deterministic tests use dependency-free host doubles and Node.js type stripping. Set `PI_CODING_AGENT_ENTRY` to an installed Pi `dist/index.js` to enable tests with real host modules. Without that variable, the installed-Pi test reports a skip.

Each feature branch that triggers CI gets one version update relative to its base. Keep that version unchanged throughout the branch. Record subsequent user-visible changes under the same matching `## [<version>] - <date>` changelog heading. Do not increment the patch version for each edit, fix, or conversation turn. CI requires the branch version to exceed its base version, with exactly one matching versioned changelog heading above it. Pull requests that change only Markdown skipped by CI are exempt. After merge and successful CI, the Release workflow tags the tested commit `v<version>`. Merges that do not change the version are not tagged.

Manual checks remain necessary. Run `/reload`, then test text, both choice modes, Other, cancellation, terminal resizing, and focus with your terminal and theme. Check regular and fullscreen modes. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT for original contributions](LICENSE) © Philip Hadviger. Upstream-derived code retains the attribution and permission scope described above.
