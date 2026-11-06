# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
