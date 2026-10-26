# Feature: Remote Servers & Daemon-First Architecture

## Overview
Decouple LLM Tuner clients (CLI and Desktop) from the compute engine using a unified Daemon-First architecture. Allows running LLM Tuner on a dedicated remote GPU server, managing remote server connections in Settings with Bearer token authentication, sanitizing hardware telemetry, and preserving server-side preset storage.

Based on design spec: [2026-10-24-remote-servers-api-design.md](../../superpowers/specs/2026-10-24-remote-servers-api-design.md)

---

## Backlog

### US-01: Daemon Authentication Middleware & Telemetry Sanitization
- **Statement**: As a server administrator, I want incoming API requests to require Bearer token authentication and hardware telemetry to be sanitized, so that remote attackers cannot profile the host or invoke privileged actions.
- **Dependencies**: None.
- **Acceptance Criteria**:
  1. Requests originating from non-loopback addresses or in server mode require `Authorization: Bearer <token>`; missing or invalid tokens return 401 Unauthorized.
  2. Token comparisons use `crypto.timingSafeEqual`.
  3. `GET /api/state` omits OS distro/kernel versions, CPU brand details, PCI bus IDs, and GPU UUIDs, returning only capacity metrics (VRAM, RAM, estimated bandwidth).
  4. Privileged endpoints (`POST /api/install`) return 403 Forbidden for remote/non-localhost clients.
- **Verification Method**: Automated unit tests in `test/server-auth.test.js`.
- **Status**: Complete
- **Observed Results**: 4/4 tests passed in `test/server-auth.test.js` verifying timing-safe auth, loopback detection, anti-fingerprint sanitization, and 403 blocking of remote `/api/install`.

---

### US-02: Server Mode CLI & Daemon Lifecycle
- **Statement**: As a user running on a dedicated host, I want to start LLM Tuner in server mode via CLI, so that it binds to the network with a managed authentication token.
- **Dependencies**: US-01
- **Acceptance Criteria**:
  1. CLI supports `llmtuner serve [--port <port>] [--host <host>] [--token <token>]`.
  2. If no token is provided, a cryptographically secure token (32-byte hex) is generated and output to stdout.
  3. The active server token and configuration are securely persisted in `~/.config/llmtuner/server.json`.
- **Verification Method**: CLI unit test in `test/cli-serve.test.js`.
- **Status**: Complete
- **Observed Results**: 5/5 tests passed in `test/cli-serve.test.js` validating argument parsing, token generation, server.json persistence, and remote authenticated HTTP health check.

---

### US-03: Settings Schema Extension for Server Profiles
- **Statement**: As a user, I want settings to store a list of servers and an active server target, so that I can switch between local and remote machines.
- **Dependencies**: None.
- **Acceptance Criteria**:
  1. `src/core/settings.js` supports `servers: [{ id, name, url, token }]` and `activeServerId: string` (defaulting to `'local'`).
  2. Reading settings with missing or legacy fields defaults safely to `{ activeServerId: 'local', servers: [...] }`.
  3. `writeSettings` merges server updates without corrupting existing language, theme, or profile values.
- **Verification Method**: Unit tests in `test/settings-servers.test.js`.
- **Status**: Complete
- **Observed Results**: 4/4 tests passed in `test/settings-servers.test.js` validating schema defaults, server registration, url normalization, active server selection fallback, and legacy file backward compatibility.

---

### US-04: Unified TunerApiClient
- **Statement**: As a client developer, I want a single HTTP/SSE API client, so that CLI and UI share identical communication logic with the active daemon.
- **Dependencies**: US-01, US-03
- **Acceptance Criteria**:
  1. `TunerApiClient` implements methods for `getState()`, `listModels()`, `planModel()`, `loadModel()`, `listPresets()`, and `chat()`.
  2. Requests include the active server's Bearer token.
  3. `loadModel()` supports streaming SSE progress events from `GET /api/jobs/:id/events`.
- **Verification Method**: Unit tests in `test/client.test.js` using a mock HTTP server.
- **Status**: Complete
- **Observed Results**: 7/7 tests passed in `test/client.test.js` verifying HTTP methods, Bearer authorization headers, SSE event streaming, error decoding, and fromSettings instantiation.

---

### US-05: Settings UI "Servers" Panel
- **Statement**: As a desktop or web user, I want a "Servers" section in Settings, so that I can configure, test, and switch target servers from the graphical interface.
- **Dependencies**: US-03, US-04
- **Acceptance Criteria**:
  1. A "Servers" tab/section exists in the Settings dialog.
  2. Users can view configured servers, add a new remote server (Name, URL, Token), test the connection, and set the active server.
  3. Switching the active server updates the client context and reloads models and state from that server.
- **Verification Method**: Unit tests in `test/settings-ui.test.js` and manual web verification.
- **Status**: Complete
- **Observed Results**: 3/3 tests passed in `test/settings-ui.test.js` verifying HTML elements, app.js handlers, and dynamic server registration and activeServerId switching via API.

---

### US-06: CLI Commands Refactor to Thin Client
- **Statement**: As a CLI user, I want existing CLI commands to execute against the active server via `TunerApiClient`, so that all commands work identically on local or remote servers.
- **Dependencies**: US-04
- **Acceptance Criteria**:
  1. CLI commands (`tune`, `models`, `bench`, `chat`) obtain their context from `TunerApiClient`.
  2. If `activeServerId === 'local'` and the daemon is not running, CLI transparently spawns the local daemon before executing.
  3. Existing CLI tests continue to pass without regression.
- **Verification Method**: `npm test` verifying all existing CLI test suites.
- **Status**: Complete
- **Observed Results**: 272/272 tests passed across 26 suites with zero regressions, verifying that both local and remote thin-client execution paths maintain full backward compatibility.
