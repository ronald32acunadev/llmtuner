# Update README Audit and Synchronization

Feature: `update-readme`
Status: Complete (US-01 Verified)
Execution Mode: All stories (Orchestrator-owned documentation per `AGENTS.md`)

Audit, update, and synchronize `README.md` and `README.es.md` to reflect current codebase facts, Node.js `>=24` requirements, Engine Management Dashboards (`Ollama` & `LM Studio` tabs), CLI engine parity commands (`/ps`, `/unload`, `/engines`), and platform capabilities.

## Audit Findings & Discrepancies

- **Manifest Name & Version**: `llm-tuner@0.6.0`
- **Existing README.md H1**: `# LLM Tuner`
- **Companion READMEs**: `README.es.md: # LLM Tuner`
- **Classification**: **Drifted** (Fixed and synchronized)
  - **Node.js Engine Badge**: Updated `README.md` and `README.es.md` badges from `node->=22` to `node->=24` matching `package.json#engines` and CI.
  - **Engine Management & CLI Commands**: Documented `/ps`, `/unload`, `/engines` (including `engines storage --engine <id> --path <dir>` and `--path <dir>`), and the top-level `Tuner`, `Ollama`, and `LM Studio` management tabs in both READMEs.
  - **Settings Scope**: Updated `/settings` documentation in both files to include automatic server startup after login and managed remote computers/servers.
  - **Repository Structure Map**: Updated architecture tree in both READMEs to list `chat.js`, `ps.js`, `unload.js`, `engines.js`, `servers.js` under `src/cli/commands/`, `navigation.js` and `engine-management.js` under `src/web/public/`, and all `src/platform/` modules (`ollama-authorize.js`, `server-autostart.js`, `shared-server.js`).
  - **Synchronization**: Verified section-by-section parity between `README.md` and `README.es.md`.

---

## US-01: Audit, Modernize, and Synchronize English and Spanish READMEs

- **Statement**: As a developer or user visiting the repository, I want accurate, verified, and synchronized documentation in English and Spanish matching `llm-tuner@0.6.0` and Node.js `>=24`, so that I have reliable setup instructions, complete CLI command/flag tables, and accurate architecture paths.
- **Dependencies**: `engine-management-tabs`, `cli-engine-parity`.
- **Status**: Complete
- **Acceptance criteria**:
  - `US-01 / AC-01`: Update Node.js version badges in both `README.md` and `README.es.md` to `>=24` matching `package.json#engines.node`.
  - `US-01 / AC-02`: Document `/ps`, `/unload`, `/engines` (including `engines storage --engine <id> --path <dir>`), and the updated `/settings` capabilities (autostart after login, remote servers) in both READMEs.
  - `US-01 / AC-03`: Document the Web/Desktop Engine Management tabs (`Tuner`, `Ollama`, `LM Studio`) for monitoring active VRAM, quick-loading, deleting models, and configuring model storage paths.
  - `US-01 / AC-04`: Update the repository tree in both READMEs to include all current `src/cli/commands/`, `src/web/public/`, and `src/platform/` modules, and verify every command, script, flag, and relative link against codebase files.
  - `US-01 / AC-05`: Maintain exact structural and linguistic synchronization between `README.md` (English) and `README.es.md` (Spanish).
- **Verification method**: Automated test suite (`npm test`), manifest verification (`package.json`), CLI parser audit (`src/cli/router.js`), and link/path checks.
- **Observed results**: Passed (all 5 acceptance criteria verified against codebase and `npm test` `531/531` passing).

---

## QA Traceability Matrix

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| :--- | :--- | :--- |
| `US-01 / AC-01` | Inspect `README.md` and `README.es.md` line 7 against `package.json` `engines.node` | Passed (`node-%3E%3D24-brightgreen.svg` matches `>=24`) |
| `US-01 / AC-02` | Check `/ps`, `/unload`, `/engines`, and `/settings` descriptions and CLI flag tables in `README.md` and `README.es.md` against `src/cli/router.js` and `src/i18n/{en,es}.js` | Passed (`22/22` rows in CLI Options table match `parseCliArgs`) |
| `US-01 / AC-03` | Check Web/Desktop Engine Management documentation in `README.md` and `README.es.md` against `src/web/public/engine-management.js` | Passed (`Tuner`, `Ollama`, and `LM Studio` tabs documented) |
| `US-01 / AC-04` | Check repository tree in `README.md` and `README.es.md` against `ls src/cli/commands src/platform src/web/public` and run `npm test` | Passed (All modules listed; `531/531` tests pass) |
| `US-01 / AC-05` | Structural and section-by-section parity comparison between `README.md` and `README.es.md` | Passed (Identical headings, code blocks, and 354 lines in both files) |
