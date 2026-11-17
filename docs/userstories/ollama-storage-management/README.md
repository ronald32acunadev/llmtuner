# Backlog: Ollama Storage Path Management & Detection Fix

## Overview
Resolve issues where changing the Ollama models directory appears to do nothing, and where existing Ollama model directories are reported as `null` due to Linux permission and systemd drop-in handling.

## Execution Summary
- **Execution Mode**: All stories at once (approved by user).
- **Status**: Complete.
- **Verification**: 535/535 tests passing (`npm test`).

## User Stories

### US-01: Robust Ollama Models Directory Detection
**As a** developer using LLM Tuner with Ollama on Linux,  
**I want** LLM Tuner to detect Ollama's active model storage path even when owned by the `ollama` system user,  
**So that** the current storage path is accurately displayed in the UI and CLI instead of appearing blank or `null`.

#### Status: Complete

#### Acceptance Criteria
- `US-01 / AC-01`: `modelsDir()` in `src/core/engines/ollama.js` detects existing directories with read access (`fs.constants.R_OK`), without failing due to lacking write permissions (`fs.constants.W_OK`) for the unprivileged user.
- `US-01 / AC-02`: When `systemctl show ollama.service --property=Environment` contains `OLLAMA_MODELS`, that path is prioritized and resolved if it exists.
- `US-01 / AC-03`: `ollama.detect()` returns the valid detected path (e.g., `/usr/share/ollama/.ollama/models`) instead of `null` when standard Linux systemd service is active.

---

### US-02: Accurate Storage Feedback in Web UI and CLI
**As a** user updating the models directory in the Web UI or CLI,  
**I want** unambiguous feedback indicating whether the change was applied automatically or requires elevated/manual commands,  
**So that** I am not misled by false success notices when system-level permissions prevent automated writes.

#### Status: Complete

#### Acceptance Criteria
- `US-02 / AC-01`: In `src/web/public/engine-management.js`, the success notice `web.pathUpdatedRestartNotice` is rendered ONLY when `res.ok === true`.
- `US-02 / AC-02`: When `res.ok === false` and `res.manualCommand` is returned, a warning/action banner is shown instructing the user to run the privileged command with `sudo` and explaining required permissions.
- `US-02 / AC-03`: In `src/cli/commands/engines.js`, if `res.ok === false`, `cli.storagePrivilegedNotice` and the command are shown clearly without claiming the path was already updated.

---

### US-03: Permission-Aware Ollama Storage Updates
**As a** system administrator or local developer,  
**I want** `ollama.setModelsDir()` to validate directory accessibility for the `ollama` service user and provide complete configuration instructions,  
**So that** Ollama does not fail to boot or silently ignore the new path after restarting.

#### Status: Complete

#### Acceptance Criteria
- `US-03 / AC-01`: `ollama.setModelsDir(ctx, newPath)` creates the target directory if writable, and verifies that the directory exists.
- `US-03 / AC-02`: If writing to `/etc/systemd/system/ollama.service.d/` fails due to permissions (`EACCES`), the returned `manualCommand` includes both the drop-in creation, directory ownership/permission guidance for user `ollama` (`sudo chown -R ollama:ollama <path>`), `systemctl daemon-reload`, and `systemctl restart ollama`.
- `US-03 / AC-03`: If the directory is located inside a private user home directory (e.g., `/home/<user>`), a warning (`cli.storagePermissionWarning`) is returned notifying that the `ollama` system user may lack traversal permissions.

---

## QA Traceability & Verification Matrix

| Story / Criterion | Test File & Procedure | Observed Result |
| --- | --- | --- |
| `US-01 / AC-01` | `test/engine-storage.test.js`: verify `modelsDir()` resolves path when user has `R_OK` | Passed (`node --test test/engine-storage.test.js`) |
| `US-01 / AC-02` | `test/engine-storage.test.js`: verify explicit systemd / env `OLLAMA_MODELS` resolution | Passed (`node --test test/engine-storage.test.js`) |
| `US-01 / AC-03` | `test/engine-storage.test.js`: verify `ollama.detect()` returns detected `/usr/share/ollama/.ollama/models` | Passed (`node --test test/engine-storage.test.js`) |
| `US-02 / AC-01` | `test/web-engine-panels.test.js`: verify success notice is omitted when `res.ok` is false | Passed (`node --test test/web-engine-panels.test.js`) |
| `US-02 / AC-02` | `test/web-engine-panels.test.js`: verify `web.storagePrivilegedNotice` and manual command rendered when `res.ok` is false | Passed (`node --test test/web-engine-panels.test.js`) |
| `US-02 / AC-03` | `test/cli-engines.test.js`: verify `cli.storagePrivilegedNotice` and manual command printed without false update notice | Passed (`node --test test/cli-engines.test.js`) |
| `US-03 / AC-01` | `test/engine-storage.test.js`: verify directory creation and path validation | Passed (`node --test test/engine-storage.test.js`) |
| `US-03 / AC-02` | `test/engine-storage.test.js`: verify `manualCommand` includes drop-in, `chown`, `daemon-reload`, and `restart` | Passed (`node --test test/engine-storage.test.js`) |
| `US-03 / AC-03` | `test/engine-storage.test.js`: verify warning when path is under `/home` | Passed (`node --test test/engine-storage.test.js`) |
