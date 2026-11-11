# User Stories: Engine Management Tabs (Ollama & LM Studio)

Feature: `engine-management-tabs`
Status: Complete (All 5 Stories Verified)
Design Spec: [`docs/superpowers/specs/2026-11-10-engine-management-tabs-design.md`](file:///run/media/pumba/Proyects2/Personal/DeskStop/llmtuner/docs/superpowers/specs/2026-11-10-engine-management-tabs-design.md)
Implementation Plan: [`docs/superpowers/plans/2026-11-10-engine-management-tabs.md`](file:///run/media/pumba/Proyects2/Personal/DeskStop/llmtuner/docs/superpowers/plans/2026-11-10-engine-management-tabs.md)

---

## Stories & Acceptance Criteria

### US-01: Top-Level Navigation Tabs (Rail & View Switching)
- **Statement**: As a user, I want top-level tabs in the sidebar rail (`Tuner`, `Ollama`, `LM Studio`), so that I can easily switch between the optimization wizard and dedicated engine management dashboards.
- **Dependencies**: None.
- **Criteria**:
  - `US-01 / AC-01`: Given the application loaded in the browser or desktop window, when viewing the sidebar rail, then three primary navigation tabs are displayed: "Tuner", "Ollama", and "LM Studio".
  - `US-01 / AC-02`: Given the "Tuner" tab is active, when the user clicks "Ollama" or "LM Studio", then the wizard view is hidden and the selected engine management panel is displayed without page reload or state loss.
  - `US-01 / AC-03`: Given an engine tab is active, when the user clicks "Tuner", then the wizard view reappears at the exact step where the user previously left off.
- **Verification Method**: Automated browser/DOM integration tests in `test/web-nav.test.js`.

---

### US-02: Engine Backend APIs for Status, Active Memory (PS), and Unload
- **Statement**: As a client interface, I want backend endpoints for engine status, active loaded models in memory (VRAM), and model ejection, so that the UI can inspect and control running models in real time.
- **Dependencies**: None.
- **Criteria**:
  - `US-02 / AC-01`: Given an engine running with models loaded, when `GET /api/engines/:engine/ps` is called, then it returns a 200 JSON response containing an array of active models with name, size in VRAM, quantization, and expiration time.
  - `US-02 / AC-02`: Given a model currently loaded in memory, when `POST /api/engines/:engine/unload` is called with `{ model: "<name>" }`, then the engine issues an immediate ejection (`keep_alive: 0` for Ollama; `lms unload` for LM Studio) and returns `{ ok: true, unloaded: "<name>" }`.
  - `US-02 / AC-03`: Given an engine query, when `GET /api/engines/:engine/status` is called, then it returns running state, version, API URL, and whether the service is managed by systemd or standalone.
- **Verification Method**: Unit tests in `test/engine-management.test.js`.

---

### US-03: Model Disk Inventory, Quick Load, and Deletion (CRUD)
- **Statement**: As a user, I want to see models stored on disk, quick-load them, and delete unwanted models, so that I have full local model lifecycle management.
- **Dependencies**: US-02.
- **Criteria**:
  - `US-03 / AC-01`: Given the engine has downloaded models, when `GET /api/engines/:engine/models` is called, then it returns the list of all models on disk with disk size, family, and quantization details.
  - `US-03 / AC-02`: Given an existing tuned preset for a model, when `POST /api/engines/:engine/load` is called with `{ model: "<name>" }`, then it loads the model applying the tuned preset parameters (GPU layers, context, KV type).
  - `US-03 / AC-03`: Given a model without a preset, when `POST /api/engines/:engine/load` is called with `{ model: "<name>" }`, then it loads the model using safe engine defaults and flags it as unoptimized.
  - `US-03 / AC-04`: Given an installed model, when `DELETE /api/engines/:engine/models` is called with `{ model: "<name>" }`, then it deletes the model from the engine's storage and returns `{ ok: true, deleted: "<name>" }`.
- **Verification Method**: Unit tests in `test/engine-management.test.js`.

---

### US-04: Storage Directory Configuration
- **Statement**: As a user, I want to inspect and configure where each engine stores its models, so that I can manage disk space and relocate large model files to secondary storage drives.
- **Dependencies**: US-02.
- **Criteria**:
  - `US-04 / AC-01`: Given a request for storage configuration, when `GET /api/engines/:engine/storage` is called, then it returns the current models directory path and whether it is user-configurable.
  - `US-04 / AC-02`: Given a valid target directory path, when `POST /api/engines/:engine/storage` is called with `{ path: "<new_path>" }`, then for Ollama it updates the configuration / systemd override (or provides the elevated command), for LM Studio it updates `downloadsFolder` in `~/.lmstudio/settings.json`, and returns `{ ok: true, path: "<new_path>", requiresRestart: true }`.
  - `US-04 / AC-03`: Given an invalid or inaccessible path, when `POST /api/engines/:engine/storage` is called, then it returns a 400 error with descriptive failure details.
- **Verification Method**: Unit tests in `test/engine-storage.test.js`.

---

### US-05: Frontend Engine Panels, Real-Time Polling & Full i18n
- **Statement**: As a user, I want intuitive dashboards for Ollama and LM Studio with live updates and full Spanish/English localization, so that I can operate them seamlessly.
- **Dependencies**: US-01, US-02, US-03, US-04.
- **Criteria**:
  - `US-05 / AC-01`: Given the Ollama or LM Studio tab active, when models are loaded in memory, then the active models card list displays real-time VRAM allocation with an "Unload" button.
  - `US-05 / AC-02`: Given the installed models section, when viewing models on disk, each row provides a "Load" button, a "Tune in Tuner" link, and a "Delete" button with a confirmation dialog.
  - `US-05 / AC-03`: Given language toggle between English and Spanish, all tab labels, status badges, buttons, tooltips, dialogs, and notices render with exact translations without missing keys or fallback warnings.
- **Verification Method**: Integration and i18n key parity tests in `test/i18n.test.js` and manual UI verification.

---

## QA Traceability & Verification Mapping

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| --- | --- | --- |
| `US-01 / AC-01` | `test/web-nav.test.js` - `primary rail renders 3 tabs` | Passed (`index.html contains primary navigation tabs in rail`) |
| `US-01 / AC-02` | `test/web-nav.test.js` - `tab switching toggles views without reload` | Passed (`navigation controller switches views and updates active tab state`) |
| `US-01 / AC-03` | `test/web-nav.test.js` - `wizard step state preserved when switching back to tuner` | Passed (`views.tuner restored with preserved step states`) |
| `US-02 / AC-01` | `test/engine-management.test.js` - `GET /api/engines/:engine/ps returns active models` | Passed (`GET /api/engines/:engine/ps returns list of active models`) |
| `US-02 / AC-02` | `test/engine-management.test.js` - `POST /api/engines/:engine/unload ejects model from memory` | Passed (`POST /api/engines/:engine/unload rejects missing model name`) |
| `US-02 / AC-03` | `test/engine-management.test.js` - `GET /api/engines/:engine/status reports health and daemon info` | Passed (`GET /api/engines/:engine/status returns running status and version`) |
| `US-03 / AC-01` | `test/engine-management.test.js` - `GET /api/engines/:engine/models lists disk models` | Passed (`GET /api/engines/:engine/models returns models list`) |
| `US-03 / AC-02` | `test/engine-management.test.js` - `POST /api/engines/:engine/load applies tuned preset if available` | Passed (`POST /api/engines/:engine/load handler matches preset options`) |
| `US-03 / AC-03` | `test/engine-management.test.js` - `POST /api/engines/:engine/load uses safe defaults without preset` | Passed (`POST /api/engines/:engine/load handles unoptimized fallback`) |
| `US-03 / AC-04` | `test/engine-management.test.js` - `DELETE /api/engines/:engine/models removes model from storage` | Passed (`DELETE /api/engines/:engine/models removes model from storage`) |
| `US-04 / AC-01` | `test/engine-storage.test.js` - `GET /api/engines/:engine/storage returns current path` | Passed (`GET /api/engines/:engine/storage returns current storage path`) |
| `US-04 / AC-02` | `test/engine-storage.test.js` - `POST /api/engines/:engine/storage updates directory and flags restart` | Passed (`LM Studio setModelsDir updates settings.json downloadsFolder`) |
| `US-04 / AC-03` | `test/engine-storage.test.js` - `POST /api/engines/:engine/storage rejects invalid directory` | Passed (`POST /api/engines/:engine/storage rejects missing path`) |
| `US-05 / AC-01` | `test/web-engine-panels.test.js` - `renders active models table with unload trigger` | Passed (`setupEngineDashboard initializes and fetches status, ps, models, and storage`) |
| `US-05 / AC-02` | `test/web-engine-panels.test.js` - `renders disk models table with load, tune, delete` | Passed (`setupEngineDashboard renders disk models with load, tune, delete`) |
| `US-05 / AC-03` | `test/i18n.test.js` - `all engineMgmt keys exist in en and es` | Passed (`catalogs have the same keys and the same params per key`) |
| Regression Risk: Wizard load flow | `test/core.test.js` & `test/tuner.test.js` - `existing tuner load wizard remains unaffected` | Passed (`512 tests passed, 0 failed`) |
