# Engine as MCP Server for AI Agents — Design

Date: 2026-10-19
Status: Ready for Human Approval

## Goal

Provide a frictionless way for users to configure their local AI engines (LM Studio and Ollama) as MCP (Model Context Protocol) servers across all installed AI agents and applications (Claude Desktop, Claude Code, OpenCode, Antigravity, VS Code, ChatGPT/Codex) across Linux, macOS, and Windows.

## Background & Intent

Users running local LLMs via LM Studio or Ollama want their AI coding assistants and agent environments to connect to these local models. Currently, users must manually find configuration files across different operating systems, handle distinct schema formats (JSON with varying keys, command arrays vs strings, and TOML), and craft boilerplate execution blocks.

LLM Tuner already monitors hardware and engine status. Adding an "Add as MCP" feature connects the engine directly to the user's agent ecosystem with custom naming and cross-platform safety.

## Scope & Phasing

- **Phase 1 (This Feature)**:
  - Core MCP manager and agent detection module for Linux, macOS, and Windows.
  - Safe configuration adapters for JSON and TOML formats with backup generation.
  - Web & Electron Desktop UI: "Add as MCP" button on each engine card with tooltip, and configuration modal with agent multi-selection, custom naming, and optional advanced settings (host/port, API key).
  - Full i18n support (`en` and `es`).
- **Phase 2 (Future / Postponed)**:
  - CLI command selector refactor (e.g. `load model`, `add-mcp`, etc.).

## Target Agents & OS Path Resolution

| Agent / App | Linux Path | macOS Path | Windows Path | Format & Root Key |
|---|---|---|---|---|
| **Claude Desktop** | `~/.config/Claude/claude_desktop_config.json` | `~/Library/Application Support/Claude/claude_desktop_config.json` | `%APPDATA%\Claude\claude_desktop_config.json` | JSON, `mcpServers` |
| **Claude Code** | `~/.claude.json` | `~/.claude.json` | `%USERPROFILE%\.claude.json` | JSON, `mcpServers` |
| **OpenCode** | `~/.config/opencode/opencode.json` | `~/Library/Application Support/opencode/opencode.json` | `%APPDATA%\opencode\opencode.json` | JSON, `mcp` (type: "local", command array) |
| **Antigravity / Gemini CLI** | `~/.gemini/config/mcp_config.json` | `~/.gemini/config/mcp_config.json` | `%USERPROFILE%\.gemini\config\mcp_config.json` | JSON, `mcpServers` |
| **VS Code** | `~/.config/Code/User/mcp.json` | `~/Library/Application Support/Code/User/mcp.json` | `%APPDATA%\Code\User\mcp.json` | JSON, `servers` |
| **ChatGPT (Codex Desktop)** | `~/.codex/config.toml` | `~/.codex/config.toml` | `%USERPROFILE%\.codex\config.toml` | TOML, `[mcp_servers.<name>]` |

*Path Helpers*: All paths resolve via standard Node.js `os.homedir()`, `process.env.APPDATA`, `process.env.LOCALAPPDATA`, and `process.env.XDG_CONFIG_HOME` fallbacks.

## MCP Server Payloads & Engine Defaults

### 1. LM Studio Engine
- **Package**: `@mzxrai/mcp-openai@latest`
- **Command**: `npx`
- **Args**: `["-y", "@mzxrai/mcp-openai@latest"]`
- **Defaults**:
  - `OPENAI_BASE_URL`: `http://127.0.0.1:1234/v1`
  - `OPENAI_API_KEY`: `"sk-lm-local"`

### 2. Ollama Engine
- **Package**: `ollama-mcp-server@latest`
- **Command**: `npx`
- **Args**: `["-y", "ollama-mcp-server@latest"]`
- **Defaults**:
  - `OLLAMA_HOST`: `http://127.0.0.1:11434`

## Core Architecture

```
src/
├── core/
│   ├── mcp/
│   │   ├── index.js            # Main facade: detectAgents(), installMcp()
│   │   ├── registry.js         # Agent definitions, paths per OS, format type
│   │   ├── adapters/
│   │   │   ├── json-adapter.js # Handles standard { mcpServers: {} } and { servers: {} }
│   │   │   ├── opencode.js     # Handles { mcp: {} } with command array format
│   │   │   └── toml-adapter.js # Surgical section updater for ~/.codex/config.toml
│   │   └── util.js             # Atomic writing, backup generation, path resolution
```

### Safety & Mutation Rules
1. **Never erase existing tools**: Only upsert the key specified by `customName`.
2. **Backups**: Before modifying any existing configuration file, create an in-place timestamped backup (`<file>.bak-llm-tuner-<timestamp>`).
3. **Format & Comment Preservation**:
   - For JSON: safely parse, update target key, stringify with 2 spaces.
   - For TOML: perform a surgical section replacement/insertion for `[mcp_servers.<name>]` to preserve all existing tables, headers, and comments in `config.toml`.
4. **Fresh Installs**: If an agent is selected whose config file or parent directory does not yet exist, create the required directories and initialize a valid minimal config containing the new MCP server.

## Web & Desktop Interface (UI)

1. **Engine Card Action**:
   - On each engine card in `src/web/public/index.html`, add a secondary button:
     `<button class="btn mcp-btn" type="button" data-i18n="web.addAsMcp" title="...">Add as MCP</button>`
   - Native hover tooltip explains: "Expose this engine as an MCP tool to external AI agents like Claude, OpenCode, VS Code and ChatGPT".
2. **Configuration Modal (`#mcp-modal`)**:
   - **Header**: Engine title (e.g., "Add LM Studio as MCP Server").
   - **Server Name Input**: Default value `lmstudio` or `ollama`. User can type custom name (e.g. `pumbastudio`, `pumbalama`).
   - **Optional Advanced Options (Collapsible)**:
     - Host / Base URL input (prefilled with default).
     - API Key input (for LM Studio, prefilled with `sk-lm-local`).
   - **Agent Checklist**:
     - Checkbox for each supported agent.
     - Detected agents are checked by default with a `Detected` badge.
     - Uninstalled/not found agents are unchecked by default with an `Available` badge.
     - If the typed server name already exists in an agent's config, an indicator `(Configured - will update)` is displayed.
   - **Action Buttons**: "Cancel" and "Save & Configure".
   - Shows feedback banner or alert on completion.

## API Endpoints (`src/web/server.js`)

- `GET /api/mcp/agents`:
  - Returns: `[ { id, name, detected, configPath, configuredServers: [string] }, ... ]`
- `POST /api/mcp/install`:
  - Request Body: `{ engineId, customName, agentIds, host, apiKey }`
  - Returns: `{ success: true, updated: [agentId, ...], errors: [ ... ] }`

## Internationalization (i18n)

New catalog entries in `src/i18n/en.js` and `src/i18n/es.js`:
- `web.addAsMcp`
- `web.addAsMcpTooltip`
- `web.mcpModalTitle`
- `web.mcpServerName`
- `web.mcpAdvancedOptions`
- `web.mcpBaseUrl`
- `web.mcpApiKey`
- `web.mcpSelectAgents`
- `web.mcpDetected`
- `web.mcpNotDetected`
- `web.mcpAlreadyConfigured`
- `web.mcpSuccess`
- `web.mcpSaveBtn`

## Non-Goals & Constraints

- CLI interactive command wizard is deferred to Phase 2.
- Local connections only (`127.0.0.1` / `localhost`).
- Zero new external runtime dependencies.
