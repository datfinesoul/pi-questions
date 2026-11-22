# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-11-22

### Added

- Return custom text together with one listed option in a single-select question. The user can select one option, add feedback, or combine both.
- Number the custom row after the last option and show it in square brackets. Its number opens the text editor, because custom text has no value until the user types one.

### Changed

- Put the option number before the selection circle in choice rows. Show the Submit row in bold without a selection marker, because it acts on the selection and is not one.
- Label the custom row `[Feedback]` in single-select and `[Other]` in multi-select. Single-select custom text can add to one option or stand alone, so the word Other reads wrong there.
- Fill the custom row circle when its editor opens. Leaving the editor empty with Enter or Esc clears the row.
- Draw the accent rule above and below a text question, so every dialog has the same frame.
- Use one choice dialog for both choice modes. Up and Down move the cursor. SPACE selects or toggles the option under the cursor, keys 1–9 select or toggle their numbered option, and a second press clears the selection. A single-select question allows one listed option, and a new option replaces the previous one.
- Show the Submit row and the empty-selection warning in both choice modes. Enter acts on two rows only: it opens the text editor on the custom row, and it submits on the Submit row. Enter on an option row does nothing, so a selection can be checked before it is sent.
- Save the custom text with Enter and return to the choice list in both modes. Pressing Enter on the custom row no longer submits the answer.

## [0.5.1] - 2026-11-19

### Fixed

- Add clarification and cancellation exceptions to the decision rule and tool guidance. Tell the model to answer clarification in prose and end its turn without repeating or rephrasing the pending decision.
- Report Other text as a custom reply, separate from listed selections. Preserve valid custom answers, mixed selections, and structured result details. Quote non-empty text replies and add conditional clarification guidance to them.
- Tell the model not to repeat or rephrase a cancelled question unless the user requests it.
- Save the decision-rule answer only when the user selects Yes or No. When the user presses Escape, the extension does not create `.pi/questions.json` and asks again at the next session start.

## [0.5.0] - 2026-11-18

### Changed

- Use the text-only editor's full width and Your answer label for Other answers in single-select and multi-select questions. Keep choices visible and preserve keyboard behavior.
- Remove the shortcut placeholder dot before Other in multi-select questions. Keep the selection circle.

### Fixed

- Keep answer editors within the terminal width after text entry, including at a one-column width.

## [0.4.0] - 2026-11-16

### Added

- Use keys 1–9 to highlight a single answer, then press Enter to confirm. In multi-select, number keys toggle answers. Number keys still enter text in custom answers and text questions.
- Submit multi-select answers with Enter from any regular option or Submit. Enter on Other still opens custom text entry. Show SPACE in bold in the toggle instructions.
- Match the shared multi-select row style: dim ○ for unselected answers, green ● for selected answers, and an accented focus arrow. Show plain shortcut numbers 1–9 and a dot for rows without a number shortcut.

## [0.3.0] - 2026-11-14

### Added

- Offer a decision-question rule on the first interactive session in a project. The offer needs no model turn and states that it is one-time and how to change the answer later.
- Write and update the rule block in `AGENTS.md` between two markers. An update replaces only the block and leaves other text intact.
- Record the decision in `.pi/questions.json`. The file is the only record, so a decline stops later offers in that project and deleting the file brings the offer back.
- Show a notification and a footer hint after the extension writes the block, so the user can run `/reload`. The footer hint lasts until the next session start, because Pi overwrites the chat status line during a reload.

### Changed

- Read a project configuration layer. Installation scope and the configuration layer are independent.
## [0.2.0] - 2026-11-14

### Changed

- Remove recommendation guidance from `ask_user_question`. Options are now neutral: the tool guidance tells the model not to mark or order options by preference and to state only facts in details, such as project rules, constraints, and what each option changes.
- Rework multi-select guidance. Use multi-select when options are independent and any combination can be valid. Express related decisions as separate options or separate questions instead of pre-combining decision dimensions into options.

## [0.1.2] - 2026-11-12

### Changed

- Add spacing and a “Your answer” heading to separate text questions from the normal editor.

## [0.1.1] - 2026-11-10

### Changed

- Guide the model to ask self-contained questions with clear references to earlier proposals.
- Clarify that approach selection alone does not authorize execution. Cancellation, unavailable UI, and empty text do not imply approval.

### Fixed

- Use TypeScript runtime helpers so `/reload` refreshes imported logic instead of retaining cached JavaScript helpers.

## [0.1.0] - 2026-11-06

### Added

- Add a Pi package manifest, shared repository files, CI, and package checks.
- Add portable tests for answers, cancellation, serialization, and optional installed-Pi integration.
- Document installation, interaction, upstream attribution, and license scope.

### Changed

- Move the entry point to `extensions/questions/index.ts` and pure logic to `src/questions.js`.
- Use current Pi host package names and declare peer dependencies.
- Identify `ask_user_question` in each prompt guideline and expose it only to the model.

### Fixed

- Return `unavailable` for RPC sessions instead of attempting unsupported custom UI.
