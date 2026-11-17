# Backlog: Ollama Sudo Password Elevation & Service Restart

## Overview
Enable LLM Tuner to prompt for the administrator (`sudo`) password in both Web UI and CLI, write the systemd drop-in configuration, adjust directory ownership for the `ollama` daemon user, and restart the `ollama.service` automatically.

## Execution Summary
- **Execution Mode**: All stories at once (approved by user).
- **Status**: Complete.
- **Verification**: 540/540 tests passing (`npm test`).

## User Stories

### US-01: Privileged Sudo Execution for Ollama Service Configuration
**As a** user configuring Ollama on Linux,  
**I want** LLM Tuner to accept a sudo password and securely execute systemd drop-in configuration, permissions, and service restart,  
**So that** Ollama's model storage path is updated without requiring manual terminal commands.

#### Status: Complete

#### Acceptance Criteria
- `US-01 / AC-01`: `ollama.setModelsDir(ctx, newPath, { password })` validates `newPath`, rejects unsafe characters, and uses `sudo -S` to create `/etc/systemd/system/ollama.service.d/models.conf`, set directory permissions (`chown -R ollama:ollama <path>`), execute `systemctl daemon-reload`, and restart `ollama.service`.
- `US-01 / AC-02`: If no password is provided and root access is needed on Linux, returns `{ ok: false, requiresPassword: true, path }`.
- `US-01 / AC-03`: If an incorrect password is provided, rejects with `errors.invalidSudoPassword` (`400` status / `TunerError`).
- `US-01 / AC-04`: After service restart, polls until Ollama's API responds before returning `{ ok: true, path, restarted: true }`.

---

### US-02: Interactive Sudo Password Prompt in Web UI
**As a** Web UI user,  
**I want** to be prompted for my sudo password when configuring Ollama storage,  
**So that** the change is applied and the service is restarted automatically with immediate visual confirmation.

#### Status: Complete

#### Acceptance Criteria
- `US-02 / AC-01`: When setting Ollama storage on Linux and `requiresPassword` is indicated, the UI reveals a sudo password prompt field (`web.enterSudoPassword`) and confirm action.
- `US-02 / AC-02`: On submit with password, sends `POST /api/engines/ollama/storage` with `password` and clears the password field immediately from memory and DOM.
- `US-02 / AC-03`: On success, displays `web.storageUpdatedAndRestarted` and triggers dashboard refresh to reflect updated models directory.
- `US-02 / AC-04`: On invalid password error, displays error message cleanly without leaking passwords.

---

### US-03: Interactive Sudo Password Prompt in CLI
**As a** CLI user running `llm-tuner engines`,  
**I want** the CLI to prompt for the sudo password interactively when updating Ollama storage,  
**So that** the systemd service is reconfigured and restarted in-place.

#### Status: Complete

#### Acceptance Criteria
- `US-03 / AC-01`: In interactive CLI mode, prompts for sudo password via `@inquirer/prompts` `password()` when updating Ollama storage on Linux.
- `US-03 / AC-02`: On success, outputs `cli.storageUpdatedAndRestarted`.
- `US-03 / AC-03`: On failure, outputs localized error message without crashing.

---

## QA Traceability & Verification Matrix

| Story / Criterion | Test File & Procedure | Observed Result |
| --- | --- | --- |
| `US-01 / AC-01` | `test/engine-storage.test.js`: verify `setModelsDir` with password executes privileged configuration and restart | Passed (`node --test test/engine-storage.test.js`) |
| `US-01 / AC-02` | `test/engine-storage.test.js`: verify `requiresPassword: true` returned when unprivileged without password | Passed (`node --test test/engine-storage.test.js`) |
| `US-01 / AC-03` | `test/engine-storage.test.js`: verify rejection with `errors.invalidSudoPassword` on wrong password | Passed (`node --test test/engine-storage.test.js`) |
| `US-01 / AC-04` | `test/engine-storage.test.js`: verify API readiness check after service restart | Passed (`node --test test/engine-storage.test.js`) |
| `US-02 / AC-01` | `test/web-engine-panels.test.js`: verify password prompt displays when `requiresPassword: true` | Passed (`node --test test/web-engine-panels.test.js`) |
| `US-02 / AC-02` | `test/web-engine-panels.test.js`: verify password submission via API and input clearing | Passed (`node --test test/web-engine-panels.test.js`) |
| `US-02 / AC-03` | `test/web-engine-panels.test.js`: verify `web.storageUpdatedAndRestarted` shown on success | Passed (`node --test test/web-engine-panels.test.js`) |
| `US-02 / AC-04` | `test/web-engine-panels.test.js`: verify clean error display on auth failure | Passed (`node --test test/web-engine-panels.test.js`) |
| `US-03 / AC-01` | `test/cli-engines.test.js`: verify interactive sudo password prompt called | Passed (`node --test test/cli-engines.test.js`) |
| `US-03 / AC-02` | `test/cli-engines.test.js`: verify `cli.storageUpdatedAndRestarted` logged on success | Passed (`node --test test/cli-engines.test.js`) |
| `US-03 / AC-03` | `test/cli-engines.test.js`: verify error handling on invalid password | Passed (`node --test test/cli-engines.test.js`) |
