# Feature: Active Server Proxy Routing & Remote Context

## Overview
Currently, selecting a remote server in Settings (`activeServerId !== 'local'`) only saves the server ID in `settings.json`, but the local daemon still serves its own local hardware, local engines, and local models to the Web and Desktop UI.

This feature introduces transparent daemon proxy routing:
When `activeServerId !== 'local'`, the client daemon delegates execution endpoints (`/api/state`, `/api/models`, `/api/plan`, `/api/presets`, `/api/load`, SSE event streams, and `/api/chat`) to the active remote server using its Bearer token, while keeping local settings and agent discovery local to the client PC.

---

## User Stories

### US-01: Daemon Proxy Routing for Active Remote Server
- **Statement**: As a Desktop or Web UI user, when I select a remote server in Settings, I want the UI to display and interact with the remote machine's hardware, engines, and models, so that switching servers switches the entire application context seamlessly.
- **Dependencies**: None.
- **Acceptance Criteria**:
  1. When `activeServerId !== 'local'` (and daemon is not running with `--serverMode`), `/api/state` queries the active remote server and returns the remote hardware and engines.
  2. Endpoints `/api/models`, `/api/plan`, `/api/presets`, `/api/load`, and `/api/chat` forward requests to the active remote server using its configured Bearer token.
  3. Job progress SSE (`/api/jobs/:id/events`) proxies the remote SSE stream to the client browser.
  4. Client-owned settings (`GET /api/settings`, `POST /api/settings`) and `/api/update` continue to be processed locally on the client machine.
  5. When `activeServerId === 'local'`, existing local hardware detection and in-process execution remain unchanged.
- **Verification Method**: Automated integration tests in `test/active-server-proxy.test.js`.
- **Status**: Complete
- **Observed Verification**: 5/5 integration tests passing in `test/active-server-proxy.test.js` verifying remote state, models, plan, load proxying, and SSE event streaming.

---

### US-02: Remote Engine Host Resolution for MCP Installation
- **Statement**: As a user configuring MCP agents on a client PC connected to a remote server, I want the MCP dialog to automatically suggest the active remote server's IP address as the engine host, so that local agents connect directly to the remote GPU box without manual IP entry.
- **Dependencies**: US-01.
- **Acceptance Criteria**:
  1. When `activeServerId !== 'local'`, the MCP configuration pre-populates the host using the active remote server's hostname/IP (e.g., `http://<remote-ip>:1234/v1` for LM Studio, `http://<remote-ip>:11434` for Ollama).
  2. Installing the MCP server writes to the client PC's local agent configuration files (Claude, Cursor, VS Code, OpenCode) with the remote engine endpoint.
- **Verification Method**: Unit tests in `test/mcp-active-server.test.js`.
- **Status**: Complete
- **Observed Verification**: 2/2 tests passing in `test/mcp-active-server.test.js` validating remote engine host resolution for LM Studio and Ollama. Full suite passing with 317/317 tests.
