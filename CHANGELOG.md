# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-11-14

### Added

- Offer a decision-question rule on the first interactive session in a project. The offer needs no model turn.
- Write and update the rule block in `AGENTS.md` between two markers. An update replaces only the block and leaves other text intact.
- Record the decision in `.pi/questions.json`. A decline stops later offers in that project.
- Show a notification after the extension writes the block, so the user can run `/reload`.

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
