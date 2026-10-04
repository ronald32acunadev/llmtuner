# Feature: Settings Drawer (Web) and Slash Command /settings (CLI)

## Objective
Unify user settings (Language and Theme) across Web, Desktop (Electron), and CLI. In the Web/Desktop UI, replace inline sidebar switches with an off-canvas slide-out drawer triggered by a dedicated Settings button. In the CLI, introduce an interactive `/settings` command (similar to Claude Code and Antigravity CLI) allowing users to inspect and toggle settings with arrow keys.

## Scope
- Core & i18n: Add i18n entries for drawer controls and CLI interactive settings menu in both `en.js` and `es.js`.
- CLI (`src/cli/index.js`):
  - Handle `/settings` and `/setting` command arguments.
  - Implement interactive settings assistant using `@inquirer/prompts` to inspect and change `lang` and `theme`.
  - Add test coverage in `test/cli.test.js`.
- Web UI (`src/web/public/`):
  - Update `index.html`: remove inline switches from rail; add Settings button and off-canvas drawer structure.
  - Update `style.css`: smooth sliding animations, backdrop blur/overlay, theme-adaptive drawer styling.
  - Update `app.js`: drawer toggle, backdrop click, Escape key listener, focus management.
  - Update `test/server.test.js` or UI assertions if needed.
- Full Verification: Run all test suites, ensure zero regressions.

## Route & Delegation
- Route: Delegated Direct for multi-file components, direct inline for single-file/verification.
- Delivery strategy: `ask-on-risk`.
- TDD mode: TDD enabled where tests exist (`node --test`).

## Tasks

- [x] `T-1`: i18n Catalog Entries for Settings Drawer & CLI
  - Scope: `src/i18n/en.js`, `src/i18n/es.js`, `test/i18n.test.js`
  - Route: Direct inline (single concern across catalogs)
  - Commit: `64cf408`
  - Checks: `node --test test/i18n.test.js` passed 14/14 tests.

- [x] `T-2`: CLI `/settings` Interactive Command
  - Scope: `src/cli/index.js`, `test/cli.test.js`
  - Route: Delegated direct (subagent)
  - Commit: `3dbd049`
  - Checks: `node --test test/cli.test.js` passed 10/10 tests; `npm test` passed 52/52 tests.

- [x] `T-3`: Web & Desktop Settings Drawer
  - Scope: `src/web/public/index.html`, `src/web/public/style.css`, `src/web/public/app.js`, `test/server.test.js`
  - Route: Delegated direct (subagent)
  - Commit: `c03a5bd`
  - Checks: `node --test test/server.test.js` passed 10/10 tests; `npm test` passed 52/52 tests.

- [x] `T-4`: Full Verification & Regression Gate
  - Scope: Full test suite (`npm test`) and smoke checks.
  - Route: Direct inline
  - Checks: `npm test` 52/52 tests passing across all suites, zero regressions, CLI `--help` and `/settings` smoke verified in English and Spanish.
