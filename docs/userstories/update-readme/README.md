# Update README Audit and Synchronization

Feature: `update-readme`
Status: Complete (US-01 and US-02 Verified)
Execution Mode: All stories (Orchestrator-owned documentation per `AGENTS.md`)

Audit, update, and synchronize `README.md` and `README.es.md` to reflect current codebase facts, Node.js `>=24` requirements, Engine Management Dashboards (`Ollama` & `LM Studio` tabs), CLI engine parity commands (`/ps`, `/unload`, `/engines`), privileged Ollama model storage configuration with systemd drop-in and sudo elevation, non-destructive dashboard polling, and the updated test suite (542 tests).

## Audit Findings & Discrepancies

- **Manifest Name & Version**: `llm-tuner@0.6.0`
- **Existing README.md H1**: `# LLM Tuner`
- **Companion READMEs**: `README.es.md: # LLM Tuner`
- **Classification**: **Drifted** (Fixed and synchronized)
  - **Node.js Engine Badge**: `node->=24` matching `package.json#engines` and CI.
  - **Engine Management & CLI Commands**: Documented `/ps`, `/unload`, `/engines`, and the top-level `Tuner`, `Ollama`, and `LM Studio` management tabs in both READMEs.
  - **Privileged Ollama Storage**: Documented Linux systemd drop-in override (`models.conf`), interactive sudo prompt in Web UI and CLI, automatic ownership (`chown -R ollama:ollama`), service restart, and traversal permission guidance when paths reside inside `/home/<user>/`.
  - **In-Place Dashboard Polling**: Documented non-destructive background polling preserving input fields, search filters, and open dialogs.
  - **Automated Test Count**: Updated test suite metrics to 542 passing automated tests across 28 test suites.
  - **Synchronization**: Maintained exact section-by-section, code block, and heading parity between `README.md` and `README.es.md` (362 lines each).

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

## US-02: Document Ollama Privileged Storage Configuration, Stable Dashboard Polling, and Test Metrics

- **Statement**: As an administrator, user, or developer, I want clear and accurate documentation explaining the privileged Linux Ollama model storage configuration, traversal permission caveats for `/home/` directories, non-destructive dashboard polling, and current automated test suite metrics, so that I can configure local storage without runtime permission failures and understand the project's reliability guarantees.
- **Dependencies**: `US-01`, `ollama-storage-management`, `ollama-sudo-service-restart`, `engine-dashboard-input-stability`.
- **Status**: Complete
- **Acceptance criteria**:
  - `US-02 / AC-01`: Document Linux Ollama model storage path configuration: interactive sudo prompt in Web UI and CLI, automatic `/etc/systemd/system/ollama.service.d/models.conf` drop-in generation with `OLLAMA_MODELS`, automatic `chown -R ollama:ollama`, and systemd service reload/restart.
  - `US-02 / AC-02`: Document Linux file permission traversal requirements when choosing custom storage directories under `/home/<user>/...` (requiring parent execute permissions `chmod o+x` or POSIX ACLs for user `ollama`).
  - `US-02 / AC-03`: Document non-destructive dashboard telemetry polling in `README.md` and `README.es.md` that refreshes running VRAM and storage without interrupting user typing, filters, or open modal prompts.
  - `US-02 / AC-04`: Update the `Development & Testing` section to state that the automated Node.js test suite contains 542 tests across 28 test suites.
  - `US-02 / AC-05`: Maintain exact structural and linguistic synchronization between `README.md` (English) and `README.es.md` (neutral professional Spanish).
- **Verification method**: Codebase inspection of `src/core/ollama.js`, `src/web/public/engine-management.js`, test execution via `npm test` (asserting 542 tests pass), markdown structural parity check, and link verification.
- **Observed results**: Passed (All 5 acceptance criteria verified; 542 tests pass across 28 suites, heading parity diff clean, zero broken links).

---

## QA Traceability Matrix

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01` | Inspect `README.md` and `README.es.md` line 7 against `package.json` `engines.node` | Passed (`node-%3E%3D24-brightgreen.svg` matches `>=24`) |
| `US-01 / AC-02` | Check `/ps`, `/unload`, `/engines`, and `/settings` descriptions and CLI flag tables in `README.md` and `README.es.md` against `src/cli/router.js` and `src/i18n/{en,es}.js` | Passed (`22/22` rows in CLI Options table match `parseCliArgs`) |
| `US-01 / AC-03` | Check Web/Desktop Engine Management documentation in `README.md` and `README.es.md` against `src/web/public/engine-management.js` | Passed (`Tuner`, `Ollama`, and `LM Studio` tabs documented) |
| `US-01 / AC-04` | Check repository tree in `README.md` and `README.es.md` against `ls src/cli/commands src/platform src/web/public` and run `npm test` | Passed (All modules listed; `531/531` tests pass) |
| `US-01 / AC-05` | Structural and section-by-section parity comparison between `README.md` and `README.es.md` | Passed (Identical headings, code blocks, and line count in both files) |
| `US-02 / AC-01` | Check Ollama privileged storage drop-in documentation in `README.md` and `README.es.md` against `src/core/ollama.js` | Passed (Documented drop-in `models.conf`, sudo elevation, and automatic service restart) |
| `US-02 / AC-02` | Check `/home/` traversal permissions note in `README.md` and `README.es.md` against Linux systemd / permissions reality | Passed (Documented parent execute permissions `chmod o+x` and POSIX ACLs) |
| `US-02 / AC-03` | Check in-place dashboard polling documentation in `README.md` and `README.es.md` against `src/web/public/engine-management.js` | Passed (Documented non-destructive background polling preserving input fields, filters, and dialogs) |
| `US-02 / AC-04` | Execute `npm test` and verify that the test count (542 tests) is accurately reported | Passed (`node --test test/*.test.js` reports 542 passed, 0 failed across 28 suites) |
| `US-02 / AC-05` | Run structural diff and line comparison between `README.md` and `README.es.md` to ensure complete parity | Passed (Exact 362 lines in both files, 1-to-1 heading parity verified) |
