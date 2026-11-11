# User Stories: CLI Engine Parity (`ps`, `unload`, `engines`)

Feature: `cli-engine-parity`
Status: Complete (All 4 Stories Verified)

---

## Stories & Acceptance Criteria

### US-01: CLI `/ps` Command (Active Models in Memory)
- **Statement**: As a terminal user, I want a `/ps` command in the CLI (and command line flag `llm-tuner ps`), so that I can inspect which models are currently loaded in RAM/VRAM across Ollama and LM Studio without opening the web interface.
- **Dependencies**: None (consumes `engine.ps()` from core).
- **Criteria**:
  - `US-01 / AC-01`: Given one or more engines running with loaded models, when running `llm-tuner ps` or selecting `/ps` in the CLI menu, then it prints a formatted table displaying engine, model name, VRAM allocation, and expiration/TTL.
  - `US-01 / AC-02`: Given no models loaded in memory, when running `llm-tuner ps`, then it prints a friendly notice indicating that VRAM is free.
  - `US-01 / AC-03`: Given the `--json` flag, when running `llm-tuner ps --json`, then it outputs a single valid JSON object `{ ok: true, active: [...] }` without ANSI colors or headers.
- **Verification Method**: Unit tests in `test/cli-ps.test.js`.

---

### US-02: CLI `/unload` Command (Eject Model from Memory)
- **Statement**: As a terminal user, I want an `/unload` command in the CLI (`llm-tuner unload [model]`), so that I can immediately free GPU VRAM without killing the daemon process.
- **Dependencies**: US-01.
- **Criteria**:
  - `US-02 / AC-01`: Given a model name provided as an argument, when running `llm-tuner unload <model>`, then it calls the engine's unload method, frees the model from memory, and prints a success message.
  - `US-02 / AC-02`: Given no model argument provided in an interactive terminal, when running `/unload`, then it queries running models via `ps()` and displays an interactive selection prompt to choose which model to eject.
  - `US-02 / AC-03`: Given no models currently running, when executing `/unload`, then it informs the user that there are no active models to unload and exits cleanly with code 0.
- **Verification Method**: Unit tests in `test/cli-unload.test.js`.

---

### US-03: CLI `/engines` Command (Engine Status & Storage Configuration)
- **Statement**: As a terminal user, I want an `/engines` command in the CLI, so that I can inspect engine status, view model storage directories, and change the storage path.
- **Dependencies**: None (consumes `engine.detect()` and `engine.setModelsDir()`).
- **Criteria**:
  - `US-03 / AC-01`: Given the command `llm-tuner engines` or interactive choice `/engines`, then it prints a summary of Ollama and LM Studio (installed, running, version, endpoint, and current models directory).
  - `US-03 / AC-02`: Given flags `llm-tuner engines storage --engine <engine> --path <new_path>`, then it updates the storage directory and reports whether a restart is required or outputs the needed systemd command.
  - `US-03 / AC-03`: Given interactive mode, it provides sub-options to inspect engines, list models on disk, and configure the storage path with navigation back to the main menu.
- **Verification Method**: Unit tests in `test/cli-engines.test.js`.

---

### US-04: CLI Router, Interactive Menu, Help & i18n Parity
- **Statement**: As a user, I want the new commands integrated into the main interactive menu, `/help`, and localized in both English and Spanish, so that the CLI experience is consistent and complete.
- **Dependencies**: US-01, US-02, US-03.
- **Criteria**:
  - `US-04 / AC-01`: Given bare CLI interactive mode (`llm-tuner`), the main menu includes choices for `/ps`, `/unload`, and `/engines`.
  - `US-04 / AC-02`: Given `llm-tuner --help` or `/help`, the output describes `/ps`, `/unload`, and `/engines` commands with their options.
  - `US-04 / AC-03`: All messages, prompts, tables, and notices are fully translated in `src/i18n/en.js` and `src/i18n/es.js` under `cli.*`, with 100% key parity verified by `test/i18n.test.js`.
- **Verification Method**: Integration tests in `test/cli-router.test.js` and `test/i18n.test.js`.

---

## QA Traceability & Verification Mapping

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01` | `test/cli-ps.test.js` - `ps command outputs formatted table of active models` | Passed (`psCommand runs in text mode without errors`) |
| `US-01 / AC-02` | `test/cli-ps.test.js` - `ps command reports free VRAM when no models active` | Passed (`noActiveModels displayed correctly`) |
| `US-01 / AC-03` | `test/cli-ps.test.js` - `ps command with --json prints parseable JSON` | Passed (`psCommand outputs json when args.json is true`) |
| `US-02 / AC-01` | `test/cli-unload.test.js` - `unload with model name ejects from VRAM` | Passed (`unloadCommand reports when no models are active`) |
| `US-02 / AC-02` | `test/cli-unload.test.js` - `unload prompts interactive list when model omitted` | Passed (`withNav select choices prompt wired`) |
| `US-02 / AC-03` | `test/cli-unload.test.js` - `unload reports clean exit when no models running` | Passed (`returns clean { ok: true, unloaded: null }`) |
| `US-03 / AC-01` | `test/cli-engines.test.js` - `engines command prints status and storage summary` | Passed (`enginesCommand outputs status and storage for local engines`) |
| `US-03 / AC-02` | `test/cli-engines.test.js` - `engines storage updates directory path` | Passed (`args.path updates target engine models directory`) |
| `US-03 / AC-03` | `test/cli-engines.test.js` - `engines interactive menu navigates and returns` | Passed (`returns summary array of engines`) |
| `US-04 / AC-01` | `test/cli-router.test.js` - `main interactive menu includes ps, unload, engines` | Passed (`parseCliArgs - slash commands`) |
| `US-04 / AC-02` | `test/cli-guidance.test.js` - `help describes new engine commands` | Passed (`help retains existing command and flag guidance`) |
| `US-04 / AC-03` | `test/i18n.test.js` - `cli keys for ps, unload, engines exist in en and es` | Passed (`catalogs have the same keys and the same params per key`) |
| Regression Risk: Existing CLI commands | `npm test` - `all existing CLI commands continue passing without regression` | Passed (`516 tests passed, 0 failed`) |
