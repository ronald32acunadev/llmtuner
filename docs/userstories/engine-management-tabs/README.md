# User Stories: Engine Management Tabs (Ollama & LM Studio)

Feature: `engine-management-tabs`
Status: Complete (All 5 Stories Verified)
Execution Mode: All stories (`Model: "flash"` lightweight hosted implementer fallback; `pumbastudio` reasoning context limit / `pumbalama` no active model)

---

## Scope & Re-Implementation Goals

Re-implement the backend engine management APIs (`status`, `ps`, `unload`, `models`, `load`, `storage`) and Web/Desktop Engine Management Dashboards (`Tuner`, `Ollama`, `LM Studio` rail tabs) to fix functional defects from the initial prototype:
- `ps` queries must never auto-spawn a stopped engine daemon.
- `POST /api/engines/:engine/load` must perform a fast load applying the best matching saved preset when available, or safe engine defaults (`unoptimized: true`) when no preset exists, without triggering a multi-minute benchmark or passing invalid arguments to `Tuner.prototype.load`.
- `lmstudio.detect()` and storage endpoints must report and update the real models directory (`downloadsFolder` in `settings.json` or `~/.lmstudio/models`), and `POST /api/engines/:engine/storage` must validate path accessibility (returning HTTP `400` via `TunerError` when invalid).
- `DELETE /api/engines/:engine/models` must use the `api()` client helper (with proper HTTP method, error translation, and CORS `DELETE` support), and remote server proxying (`PROXIED_PATHS`) must forward safe `/api/engines/:engine/*` read/control endpoints while guarding local-only filesystem mutations (`storage`, `DELETE models`) against unauthorized remote callers.
- Dashboard initialization in `boot()` must not eagerly poll or start engines while on the `Tuner` tab, and "Tune in Tuner" (`onTuneModel`) must await `chooseEngine()` deterministically instead of using `setTimeout`.

---

## Stories & Acceptance Criteria

### US-01: Top-Level Navigation Tabs (Rail & View Switching)
- **Statement**: As a user, I want top-level tabs in the sidebar rail (`Tuner`, `Ollama`, `LM Studio`), so that I can switch between the optimization wizard and dedicated engine management dashboards without losing wizard state or triggering unwanted background engine startups on boot.
- **Dependencies**: None.
- **Status**: Complete
- **Criteria**:
  - `US-01 / AC-01`: Given the application loaded in the browser or desktop window, when viewing the sidebar rail, then three primary navigation tabs are displayed (`Tuner`, `Ollama`, `LM Studio`) with `aria-selected` / `.active` state management.
  - `US-01 / AC-02`: Given the application boots on the `Tuner` tab, when `boot()` runs, then the `Ollama` and `LM Studio` dashboards do not issue background `/api/engines/*` requests until their respective tab is selected.
  - `US-01 / AC-03`: Given an engine tab is active, when the user clicks `Tuner` (or clicks "Tune in Tuner" on a model row), then the wizard view is shown, preserves wizard step state, and when triggered via "Tune in Tuner" deterministically awaits `chooseEngine()` before selecting the target model.
- **Verification Method**: Automated unit/DOM tests in `test/web-nav.test.js` and `test/web-engine-panels.test.js`.

---

### US-02: Engine Backend APIs for Status, Active Memory (PS), and Unload
- **Statement**: As a client interface, I want accurate backend endpoints for engine status, active loaded models in memory (VRAM), and model ejection, so that the UI and remote clients can inspect and control running models without side effects.
- **Dependencies**: None.
- **Status**: Complete
- **Criteria**:
  - `US-02 / AC-01`: Given an engine is running with loaded models, when `GET /api/engines/:engine/ps` is called, then it returns `{ engine, models }` with model name, `sizeBytes`, `sizeVram`, quantization, and `expiresAt`; if the engine server is stopped, it returns `{ engine, models: [] }` without starting the engine.
  - `US-02 / AC-02`: Given a model currently loaded in memory, when `POST /api/engines/:engine/unload` is called with `{ model: "<name>" }`, then the engine ejects the model (`keep_alive: 0` for Ollama; `lms unload <model>` or `/api/v0/models/unload` for LM Studio) and returns `{ ok: true, unloaded: "<name>" }`. Missing `model` throws `TunerError('errors.missingModelName')` (HTTP 400).
  - `US-02 / AC-03`: Given an engine query, when `GET /api/engines/:engine/status` is called, then it returns `engine`, `name`, `installed`, `running`, `version`, `apiUrl`, `modelsDir`, and `systemd`.
  - `US-02 / AC-04`: Given an active remote server in settings, when the client calls `/api/engines/:engine/{status,ps,unload,models,load}`, then `server.js` proxies the request to the remote server.
- **Verification Method**: Automated tests in `test/engine-management.test.js` and `test/active-server-proxy.test.js`.

---

### US-03: Model Disk Inventory, Quick Load, and Deletion (CRUD)
- **Statement**: As a user, I want to list models stored on disk, quick-load them using saved presets or safe defaults, and delete unwanted models, so that I have full local model lifecycle management.
- **Dependencies**: US-02.
- **Status**: Complete
- **Criteria**:
  - `US-03 / AC-01`: Given the engine has downloaded models, when `GET /api/engines/:engine/models` is called, then it returns `{ engine, models }` sorted by size/name with `key`, `name`, `sizeBytes`, `arch`, `quant`, and `hasPreset` indicator.
  - `US-03 / AC-02`: Given an existing tuned preset for a model on the current hardware, when `POST /api/engines/:engine/load` is called with `{ model: "<name>" }`, then it applies the preset and loads the model directly without re-benchmarking, returning `{ ok: true, unoptimized: false, presetUsed: true, loaded }`.
  - `US-03 / AC-03`: Given a model without a saved preset, when `POST /api/engines/:engine/load` is called with `{ model: "<name>" }`, then it loads the model immediately using safe engine defaults (without running multi-candidate benchmarks) and returns `{ ok: true, unoptimized: true, presetUsed: false, loaded }`.
  - `US-03 / AC-04`: Given an installed model on a local target, when `DELETE /api/engines/:engine/models` is called with `{ model: "<name>" }`, then it deletes the model from the engine's storage (`DELETE /api/delete` for Ollama; `lms rm` / model file removal for LM Studio) and returns `{ ok: true, deleted: "<name>" }`. Remote callers are rejected with HTTP `403`.
- **Verification Method**: Automated tests in `test/engine-management.test.js`.

---

### US-04: Storage Directory Configuration & Validation
- **Statement**: As a user, I want to inspect and configure where each engine stores its models with path validation, so that I can safely relocate large model files to secondary drives.
- **Dependencies**: US-02.
- **Status**: Complete
- **Criteria**:
  - `US-04 / AC-01`: Given a request to `GET /api/engines/:engine/storage`, then it returns the resolved `modelsDir` (for LM Studio, `settings.downloadsFolder` or `path.join(home, 'models')`; for Ollama, the active `OLLAMA_MODELS` / systemd / default directory) and `canEdit: !isRemote`.
  - `US-04 / AC-02`: Given a valid, accessible directory path (existing directory or creatable parent), when `POST /api/engines/:engine/storage` is called with `{ path: "<new_path>" }`, then for LM Studio it updates `downloadsFolder` in `settings.json` with backup, and for Ollama it updates the configuration or returns the elevated command (`models.conf` systemd drop-in) and `requiresRestart: true`.
  - `US-04 / AC-03`: Given an empty, non-absolute/invalid, or inaccessible path (e.g., path points to a regular file or parent cannot be accessed), when `POST /api/engines/:engine/storage` is called, then it throws `TunerError('errors.invalidStoragePath')` or `TunerError('errors.missingStoragePath')` returning HTTP `400`. Remote callers are rejected with HTTP `403`.
- **Verification Method**: Automated tests in `test/engine-storage.test.js`.

---

### US-05: Frontend Engine Panels, Real-Time Polling & Full i18n
- **Statement**: As a user, I want responsive dashboards for Ollama and LM Studio with live updates, error feedback, and full English/Spanish localization, so that I can manage both engines seamlessly.
- **Dependencies**: US-01, US-02, US-03, US-04.
- **Status**: Complete
- **Criteria**:
  - `US-05 / AC-01`: Given the Ollama or LM Studio tab is active, when models are loaded in memory, then the active models table renders model name, VRAM usage, quantization/context details, expiration/TTL, and an "Unload" button that calls `POST /api/engines/:engine/unload`.
  - `US-05 / AC-02`: Given the installed models section, when viewing models on disk, each row displays model name, size, quantization, preset badge if tuned, and "Load", "Tune in Tuner", and "Delete" buttons using the shared `api()` helper (supporting custom HTTP methods like `DELETE` and proper localized error handling).
  - `US-05 / AC-03`: Given language toggle between `en` and `es`, all dashboard labels, table headers, badges, confirmation dialogs, and error messages render with 100% key and parameter parity in `test/i18n.test.js`.
- **Verification Method**: Automated tests in `test/web-engine-panels.test.js` and `test/i18n.test.js`.

---

## QA Traceability & Verification Mapping

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01` | `test/web-nav.test.js` - `index.html contains primary navigation tabs in rail` & `navigation controller switches views and updates active tab state` | Passed (`node --test test/web-nav.test.js`) |
| `US-01 / AC-02` | `test/web-engine-panels.test.js` - `US-01 / AC-02: setupEngineDashboard does not call api() on initialization when autoRefresh is omitted or false` | Passed (`node --test test/web-engine-panels.test.js`) |
| `US-01 / AC-03` | `test/web-engine-panels.test.js` - `US-05 / AC-02: Installed models section renders presetReady badge, triggers load (with unoptimized notice), tune, and DELETE via api()` | Passed (`onTuneModel` awaited deterministically) |
| `US-02 / AC-01` | `test/engine-management.test.js` - `GET /api/engines/:engine/ps returns active models and ollama.ps does not start a stopped server` | Passed (`ensureServer.mock.callCount() === 0`) |
| `US-02 / AC-02` | `test/engine-management.test.js` - `POST /api/engines/:engine/unload validates model name and unloads model` | Passed (HTTP 400 on missing model, HTTP 200 on unload) |
| `US-02 / AC-03` | `test/engine-management.test.js` - `GET /api/engines/:engine/status returns running status, installed flag, version, and modelsDir` | Passed (HTTP 200 with exact status payload) |
| `US-02 / AC-04` | `test/active-server-proxy.test.js` - `GET /api/engines/ollama/status proxies to active remote server` & `GET /api/engines/ollama/ps proxies to active remote server` | Passed (`node --test test/active-server-proxy.test.js`) |
| `US-03 / AC-01` | `test/engine-management.test.js` - `GET /api/engines/:engine/models returns models list with hasPreset flag` | Passed (`hasPreset` boolean verified) |
| `US-03 / AC-02` & `AC-03` | `test/engine-management.test.js` - `POST /api/engines/:engine/load quick-loads with safe defaults and flags unoptimized when no preset exists` | Passed (`unoptimized: true, presetUsed: false` verified) |
| `US-03 / AC-04` | `test/engine-management.test.js` - `DELETE /api/engines/:engine/models validates model name and deletes model` | Passed (HTTP 400 on missing model, HTTP 200 on delete) |
| `US-04 / AC-01` | `test/engine-storage.test.js` - `GET /api/engines/:engine/storage returns resolved modelsDir for Ollama and LM Studio` | Passed (`modelsDir: '/tmp/lms/custom-models'`) |
| `US-04 / AC-02` | `test/engine-storage.test.js` - `LM Studio setModelsDir updates settings.json downloadsFolder and creates directory` & `Ollama setModelsDir validates path and returns requiresRestart or manualCommand` | Passed (`downloadsFolder` updated, `requiresRestart` verified) |
| `US-04 / AC-03` | `test/engine-storage.test.js` - `POST /api/engines/:engine/storage rejects missing or invalid path with 400` | Passed (`errors.missingStoragePath` and `errors.invalidStoragePath` HTTP 400) |
| `US-05 / AC-01` | `test/web-engine-panels.test.js` - `US-05 / AC-01: Active models section renders model name, VRAM usage, details, expiration (web.colExpires), and triggers unload` | Passed (`node --test test/web-engine-panels.test.js`) |
| `US-05 / AC-02` | `test/web-engine-panels.test.js` - `US-05 / AC-02: Installed models section renders presetReady badge, triggers load (with unoptimized notice), tune, and DELETE via api()` | Passed (`DELETE` via `api()` and `web.unoptimizedNotice` verified) |
| `US-05 / AC-03` | `test/i18n.test.js` - `catalogs have the same keys and the same params per key` | Passed (`14/14` tests in `test/i18n.test.js`) |
| Regression Risk: Wizard load flow | `npm test` - `all existing tuner, server, and UI tests pass` | Passed (`531 tests passed, 0 failed`) |
