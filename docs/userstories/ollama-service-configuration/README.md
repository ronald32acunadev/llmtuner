# Feature: Ollama Service Configuration & Authorization Resilience

## Overview
When loading or tuning models with Ollama on Linux systems, users encounter `errors.ollamaAuthorizationFailed` ("Ollama service configuration failed. Check the service and its configuration backup before retrying."). This occurs due to two root causes:
1. **Unprivileged inspection failure**: Ollama runs under a dedicated `ollama` system user by default, meaning `/proc/<pid>/environ` has mode `0400` owned by `ollama:ollama`. `serviceIO.inspect` throws `EACCES` when an unprivileged user reads it, always returning `null` and forcing unnecessary elevation even when the service is already correctly configured.
2. **Elevated restart race condition**: In the privileged script executed via `pkexec`/`sudo`, `systemctl restart ollama.service` is triggered for a `Type=simple` unit. The script immediately calls `live_matches "$@"` without waiting for systemd to finish stopping the old process and starting the new one. When `MainPID` is temporarily 0 or transitioning, `live_matches` returns 1, triggering the `set -e` EXIT trap and failing with exit code 70, causing `errors.ollamaAuthorizationFailed`.

---

## User Stories

### US-01: Resilient Unprivileged Service Inspection
- **Statement**: As a user running LLM Tuner, I want `serviceIO.inspect` to verify whether the running Ollama service already matches the target configuration even when `/proc/<pid>/environ` cannot be read due to file permissions, so that the application does not prompt for administrator authorization when the service is already configured properly.
- **Dependencies**: None.
- **Acceptance Criteria**:
  1. `serviceIO.inspect(env)` checks whether the unit file `CONFIG` matches `configText(env)`.
  2. If reading `/proc/<pid>/environ` fails with `EACCES` or permission error, `serviceIO.inspect` falls back to querying `systemctl show ollama.service --property=Environment --value` and verifies active service state.
  3. When the service configuration and active environment match, `reconcileOllamaService` returns `{ changed: false, restarted: false, backups: [] }` without invoking `authorize()`.
  4. Security checks verifying trusted root ownership of parent directories and configuration files remain intact.
- **Verification Method**: Unit tests in `test/ollama-service.test.js` simulating unreadable `/proc/<pid>/environ` and matching `systemctl show` output.
- **Status**: Complete
- **Observed Results**: 12/12 unit tests in `test/ollama-service.test.js` passed, confirming unprivileged fallback to `systemctl show` on `EACCES` and returning null on inactive service.

---

### US-02: Systemd Restart Polling in Privileged Configuration Script
- **Statement**: As a user applying configuration changes to the Ollama systemd service, I want the elevated configuration script to poll for the restarted Ollama service to become active and match the target environment with a bounded timeout, so that asynchronous systemd process transitions do not fail prematurely with exit code 70 (`errors.ollamaAuthorizationFailed`).
- **Dependencies**: US-01.
- **Acceptance Criteria**:
  1. In `src/core/engines/ollama-service.js` `SCRIPT`, replace the instantaneous single call to `live_matches "$@"` after `systemctl restart` with a retry loop (e.g., polling every 0.25s for up to 10 seconds).
  2. If the service becomes active and its environment matches within the timeout, the script outputs `changed=...`, `restarted=...`, `backup=...` and exits with code 0.
  3. If the service fails to match within the timeout, the script exits cleanly with the existing failure code 70.
  4. Privileged tests and authorizer tests in `test/ollama-service.test.js` and `test/ollama-authorize.test.js` pass.
- **Verification Method**: Unit tests in `test/ollama-service.test.js` and mock authorization executions.
- **Status**: Complete
- **Observed Results**: 20/20 tests in `test/ollama-*.test.js` passed and full test suite 319/319 passed, verifying bounded polling wait for live matches without race condition failures.
