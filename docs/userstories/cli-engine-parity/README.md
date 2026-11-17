# User Stories: CLI Engine Parity (`ps`, `unload`, `engines`)

Feature: `cli-engine-parity`
Status: Complete (All 4 Stories Verified)
Execution Mode: All stories (`Model: "flash"` lightweight hosted implementer fallback)

---

## Scope & Re-Implementation Goals

Re-implement the CLI engine management commands (`/ps`, `/unload`, `/engines`) and router parsing to fix defects from the initial commit:
- `/ps` must localize table column headers (`Engine`, `Model`, `VRAM`, `Quant`, `Expires / TTL`) via `src/i18n/{en,es}.js`, include expiration/TTL information (`expiresAt`), and never auto-start a stopped engine daemon.
- `/unload` must support both `llm-tuner unload <model> [--engine <engine>]` and interactive `/unload` selection, handling errors and non-TTY invocations cleanly.
- `/engines` must support `llm-tuner engines`, `llm-tuner engines storage --engine <engine> --path <new_path>`, `--json` output, and full interactive sub-menus (inspect status, list models on disk, change storage path, back navigation) when invoked interactively.
- Restore `100644` file permissions on non-executable Markdown files in `.agents/` and `.opencode/`.

---

## Stories & Acceptance Criteria

### US-01: CLI `/ps` Command (Active Models in Memory)
- **Statement**: As a terminal user, I want a `/ps` command in the CLI (`llm-tuner ps` or `/ps`), so that I can inspect which models are currently loaded in RAM/VRAM across Ollama and LM Studio with localized columns and TTL without opening the web interface.
- **Dependencies**: `engine-management-tabs / US-02`.
- **Status**: Complete
- **Criteria**:
  - `US-01 / AC-01`: Given one or more engines running with loaded models, when running `llm-tuner ps` or selecting `/ps` in the CLI menu, then it prints a formatted table with localized headers displaying engine, model name, VRAM allocation, quantization, and expiration/TTL.
  - `US-01 / AC-02`: Given no models loaded in memory, when running `llm-tuner ps`, then it prints a localized notice indicating that no models are currently active in VRAM.
  - `US-01 / AC-03`: Given the `--json` flag, when running `llm-tuner ps --json`, then it outputs a single valid JSON object `{ ok: true, active: [...] }` without ANSI escape codes or extra headers.
- **Verification Method**: Unit tests in `test/cli-ps.test.js`.

---

### US-02: CLI `/unload` Command (Eject Model from Memory)
- **Statement**: As a terminal user, I want an `/unload` command in the CLI (`llm-tuner unload [model]`), so that I can immediately free GPU VRAM without stopping the engine daemon.
- **Dependencies**: US-01.
- **Status**: Complete
- **Criteria**:
  - `US-02 / AC-01`: Given a model name provided as an argument (`llm-tuner unload <model>` or `--model <model>`), when executed, then it unloads the model from the matching active engine (or specified `--engine`), prints a localized confirmation message, and returns `{ ok: true, unloaded: "<model>" }`.
  - `US-02 / AC-02`: Given no model argument in an interactive terminal, when running `/unload`, then it queries active models via `ps()` and displays an interactive selection prompt (with Back navigation) to choose which model to eject.
  - `US-02 / AC-03`: Given no models currently running, when executing `/unload`, then it informs the user that there are no active models to unload and exits cleanly with code 0.
- **Verification Method**: Unit tests in `test/cli-unload.test.js`.

---

### US-03: CLI `/engines` Command (Engine Status, Disk Models & Storage Configuration)
- **Statement**: As a terminal user, I want an `/engines` command in the CLI, so that I can inspect engine status, browse models on disk, and configure the model storage path both non-interactively and interactively.
- **Dependencies**: `engine-management-tabs / US-04`.
- **Status**: Complete
- **Criteria**:
  - `US-03 / AC-01`: Given `llm-tuner engines` in non-interactive mode (or with `--json`), when executed, then it prints a summary of Ollama and LM Studio (installed, running, version, API URL, and resolved models directory) or `{ ok: true, engines: [...] }` in JSON mode.
  - `US-03 / AC-02`: Given `llm-tuner engines storage --engine <engine> --path <new_path>` (or `llm-tuner engines --engine <engine> --path <new_path>`), when executed, then it validates and updates the storage directory and reports whether a restart is required or prints the elevated command.
  - `US-03 / AC-03`: Given interactive mode (`llm-tuner` menu -> `/engines`), when selected, then it displays an interactive sub-menu allowing the user to view engine status, list installed models on disk per engine, or change the storage path, with Back navigation to the main menu.
- **Verification Method**: Unit tests in `test/cli-engines.test.js`.

---

### US-04: CLI Router, Interactive Menu, Help & i18n Parity
- **Statement**: As a user, I want `/ps`, `/unload`, and `/engines` integrated into the CLI router, interactive menu, `/help`, and localized in both English and Spanish, so that the CLI experience is consistent and complete.
- **Dependencies**: US-01, US-02, US-03.
- **Status**: Complete
- **Criteria**:
  - `US-04 / AC-01`: Given `parseCliArgs()`, it parses `/ps`/`ps`, `/unload [model]`/`unload [model]`, and `/engines [storage]`/`engines [storage]` along with `--engine`, `--model`, `--path`, and `--json`.
  - `US-04 / AC-02`: Given `llm-tuner --help` or `/help`, the output documents `/ps`, `/unload`, and `/engines` commands and `--path` in both English and Spanish.
  - `US-04 / AC-03`: All CLI strings, table headers, prompts, and notices exist in `src/i18n/en.js` and `src/i18n/es.js` with 100% key and parameter parity verified by `test/i18n.test.js`.
- **Verification Method**: Automated tests in `test/cli-router.test.js`, `test/cli-guidance.test.js`, and `test/i18n.test.js`.

---

## QA Traceability & Verification Mapping

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01` | `test/cli-ps.test.js` - `psCommand (US-01 / AC-01) outputs formatted table with localized headers and TTL` & `formatTtl formats seconds, minutes, expired, and empty values` | Passed (`node --test test/cli-ps.test.js`) |
| `US-01 / AC-02` | `test/cli-ps.test.js` - `psCommand (US-01 / AC-02) prints cli.noActiveModels when no models are loaded` | Passed (`node --test test/cli-ps.test.js`) |
| `US-01 / AC-03` | `test/cli-ps.test.js` - `psCommand (US-01 / AC-03) outputs json when args.json is true` | Passed (`node --test test/cli-ps.test.js`) |
| `US-02 / AC-01` | `test/cli-unload.test.js` - `unloadCommand (US-02 / AC-01) with args.model unloads target model` & `reports error when specified model is not found` | Passed (`node --test test/cli-unload.test.js`) |
| `US-02 / AC-02` | `test/cli-unload.test.js` - `unloadCommand (US-02 / AC-02) prompts and unloads chosen model` & `returns cancelled on NAV_BACK` | Passed (`node --test test/cli-unload.test.js`) |
| `US-02 / AC-03` | `test/cli-unload.test.js` - `unloadCommand (US-02 / AC-03) prints cli.noActiveModels when no models are active` | Passed (`node --test test/cli-unload.test.js`) |
| `US-03 / AC-01` | `test/cli-engines.test.js` - `enginesCommand (US-03 / AC-01) prints status and storage summary` & `outputs JSON with json: true` | Passed (`node --test test/cli-engines.test.js`) |
| `US-03 / AC-02` | `test/cli-engines.test.js` - `enginesCommand (US-03 / AC-02) updates storage path via setModelsDir` | Passed (`node --test test/cli-engines.test.js`) |
| `US-03 / AC-03` | `test/cli-engines.test.js` - `enginesCommand (US-03 / AC-03) interactive sub-menu executes inspect, models, storage, and back` | Passed (`node --test test/cli-engines.test.js`) |
| `US-04 / AC-01` | `test/cli-router.test.js` - `parseCliArgs (US-04 / AC-01) parses ps, unload, engines and engines storage` | Passed (`node --test test/cli-router.test.js`) |
| `US-04 / AC-02` | `test/cli-guidance.test.js` - `help retains existing command and flag guidance and explains remote computer responsibilities` | Passed (`node --test test/cli-guidance.test.js`) |
| `US-04 / AC-03` | `test/i18n.test.js` - `catalogs have the same keys and the same params per key` | Passed (`14/14` tests in `test/i18n.test.js`) |
| Regression Risk: Existing CLI commands | `npm test` - `all existing CLI commands continue passing without regression` | Passed (`531 tests passed, 0 failed`) |
