# Feature: Theme and Visual Identity (Logo Alignment)

## Objective
Harmonize the application visual design across Web, Desktop (Electron), and CLI with the application logo (`icon.png`: deep cyber-slate/navy surfaces with electric cyan accents). Provide a theme switcher supporting `system`, `light`, and `dark` modes, persisted in user settings.

## Problem & Motivation
The current web styles in `style.css` use an amber accent (`#c8741f`), which diverges from the brand identity established by the application logo (cybernetic chip with electric cyan circuits). Furthermore, there is no UI control or persistence for light/dark themes, and the CLI does not accept or synchronize theme preferences.

## Scope
- Core: Extend `settings.js` to normalize, read, and write `theme` (`'system' | 'light' | 'dark'`).
- Web Server & API: Expose `theme` in `GET /api/settings` and validate updates in `POST /api/settings`.
- Web UI & Electron:
  - Update `style.css` tokens based on logo colors (cyan accent `#00c2cb` / `#00e5ff`, dark navy/slate base, clean high-contrast light mode).
  - Add theme switcher UI component in `index.html` alongside the language selector.
  - Update `app.js` to handle theme selection, sync with `prefers-color-scheme` when set to `system`, and persist changes.
  - Add i18n strings for theme labels in `en.js` and `es.js`.
- CLI:
  - Add `--theme <system|light|dark>` flag.
  - Read `theme` from `readSettings()`.
  - Adjust ANSI palette contrast appropriately for light/dark modes.
- Tests: Add unit tests for settings, API, CLI flags, and i18n consistency.

## Route & Delegation
- Route: Delegated Direct / Direct Tasks with unit test coverage per step.
- Delivery strategy: `ask-on-risk`.
- TDD mode: TDD enabled where tests exist (`node --test`).

## Tasks

- [x] `T-1`: Core & Server Settings Theme Support
  - Scope: `src/core/settings.js`, `src/web/server.js`, `test/settings.test.js`, `test/server.test.js`
  - Route: Delegated direct (subagent `3d958175-4eef-48f9-88e3-e22d14aaa09f`)
  - Commit: `db99ccd`
  - Checks: `npm test` 44 passing tests.
  - Review assessment: unavailable (runtime `antigravity` not eligible for immutable receipt review).

- [x] `T-2`: Web & Electron Visual Design & Theme Switcher
  - Scope: `src/web/public/style.css`, `src/web/public/index.html`, `src/web/public/app.js`, `src/i18n/en.js`, `src/i18n/es.js`
  - Route: Delegated direct (subagent `9ca8678b-483f-4da9-b11f-94723d96ea0f`)
  - Commit: `80f277d`
  - Checks: `npm test` 45 passing tests (including `test/i18n.test.js` and `test/server.test.js`).
  - Review assessment: unavailable (runtime `antigravity` not eligible for immutable receipt review).

- [x] `T-3`: CLI Theme Integration
  - Scope: `src/cli/index.js`, `test/cli.test.js`, `src/i18n/en.js`, `src/i18n/es.js`
  - Route: Delegated direct (subagent `8fdeb2c3-30b9-4585-b91c-2f7e3dbbbb9f`)
  - Commit: `2298603`
  - Checks: `node --test test/cli.test.js test/i18n.test.js` passes (19/19 tests).
  - Review assessment: unavailable (runtime `antigravity` not eligible for immutable receipt review).

- [x] `T-4`: Full Verification & Regression Gate
  - Scope: Full test suite (`npm test`), CLI smoke test (`--help`, `--lang es`).
  - Route: Direct inline
  - Checks: `npm test` 47/47 passing tests across all test suites, zero regressions.
  - Review assessment: unavailable (runtime `antigravity` not eligible for immutable receipt review).
