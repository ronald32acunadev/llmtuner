# CLI Slash Commands & Command Router Architecture Design

## 1. Goal & Motivation
The current `llm-tuner` CLI is structured as a single linear script (`src/cli/index.js`). Running `llm-tuner` without arguments immediately asks for an engine, bypassing any top-level navigation. Furthermore, the newly created Model Context Protocol (MCP) subsystem (`src/core/mcp`) is currently only exposed through the Web UI and REST API.

To provide a modern, organized, and extensible terminal experience inspired by Claude Code's slash commands:
1. Provide a top-level Command Router supporting slash commands: `/load`, `/mcp`, `/presets`, `/settings`, `/help`, and `/exit`.
2. Provide an interactive command selector menu when `llm-tuner` is invoked without arguments in an interactive terminal.
3. Allow direct invocation of slash commands from the terminal (e.g., `llm-tuner /settings`, `llm-tuner /mcp`, `llm-tuner /load`, `llm-tuner /presets`).
4. Maintain **100% backward compatibility** for all existing flags, options, and non-interactive scripted workflows (`--engine`, `--model`, `--presets`, `--yes`, `--json`, `--dry-run`, etc.).

---

## 2. Command Architecture & Routing Model

### 2.1 Route Determination Logic
When `llm-tuner` runs, arguments (`process.argv.slice(2)`) are analyzed by the router:
1. **Direct Flags / Scripted Execution (Priority 1):**
   - If args contain non-interactive action flags (`--presets`, `--help`, `-h`, `--version`, `-v`), route directly to their respective handlers.
   - If args contain tuning flags (`--engine`, `--model`, `--ctx`, `--profile`, `--force`, `--dry-run`, `--yes`, `--json`), route directly to the `/load` handler without showing a menu.
2. **Direct Slash Command Execution (Priority 2):**
   - If the first positional argument starts with `/` (e.g., `/load`, `/mcp`, `/presets`, `/settings`, `/help`), or aliases like `settings`, route directly to the corresponding command handler.
3. **Bare Interactive Invocations (Priority 3):**
   - If no arguments are provided (or only global styling flags like `--lang` or `--theme` were passed) and `process.stdin.isTTY` is true:
     Show hardware summary header and prompt with `@inquirer/prompts` `select`:
     - `/load` — Tune and load a model with optimal hardware settings
     - `/mcp` — Connect local engine to AI coding agents (Claude, OpenCode, VS Code, etc.)
     - `/presets` — View and inspect saved model tuning presets
     - `/settings` — Configure interface language and visual theme
     - `/help` — View commands and CLI usage flags
     - `/exit` — Exit the program
   - If `!process.stdin.isTTY` (piped or non-interactive), default to `/load` or print help.

---

## 3. Subcommand Specifications

### 3.1 `/load` (Model Tuning & Loading Wizard)
- Preserves the existing interactive tuning flow from `main()`:
  1. Engine selection (LM Studio or Ollama).
  2. Model selection (or prompt to download).
  3. Context window selection.
  4. Profile selection (`speed`, `balanced`, `quality`).
  5. Benchmark execution and candidate verification.
  6. Configuration application and model loading.
- Accepts all existing flags: `--engine`, `--model`, `--ctx`, `--profile`, `--force`, `--candidates`, `--dry-run`, `--yes`, `--json`.

### 3.2 `/mcp` (AI Agent MCP Server Integration)
- Interactive flow exposing `src/core/mcp`:
  1. **Engine Selection:**
     - Prompt with `select`: LM Studio or Ollama (detects running/installed status).
  2. **Agent Multi-Selection:**
     - Call `mcpManager.getAgentStatus(engineId)`.
     - Prompt with `checkbox` from `@inquirer/prompts`:
       Lists all supported agents (Claude Desktop, Claude Code, OpenCode, Antigravity, VS Code, Codex), showing current status (`Installed` vs `Not installed`).
  3. **Server Name Prompt:**
     - Prompt with `input`: default `lmstudio` or `ollama`.
  4. **Execution & Summary:**
     - Call `mcpManager.installMcp({ engineId, serverName, targetAgents })`.
     - Print formatted status for each agent (success with checkmark, or error details).

### 3.3 `/presets` (Saved Presets Management)
- Lists saved presets from disk matching optional filters (`--engine`, `--model`).
- Formats table: Engine, Model, Context, Profile, KV Type, GPU Offload, TPS, Creation date.

### 3.4 `/settings` (Preferences Configuration)
- Interactive menu to configure:
  - Language: English (`en`), Español (`es`).
  - Theme: System (`system`), Light (`light`), Dark (`dark`).
- Persists choices using `writeSettings()`.

### 3.5 `/help` & `--help`
- Displays organized help output explaining:
  - Slash commands (`/load`, `/mcp`, `/presets`, `/settings`, `/help`).
  - Tuning options and flags.
  - Non-interactive script usage examples.

---

## 4. Directory Structure Refactoring
Refactor `src/cli/` cleanly into modular components:
```
src/cli/
├── index.js             # Thin CLI entry point
├── router.js            # Argument inspection, dispatch, and interactive command menu
├── profile.js           # Existing profile helper routines
└── commands/
    ├── load.js          # /load wizard and benchmarking flow
    ├── mcp.js           # /mcp interactive agent configuration flow
    ├── presets.js       # /presets list & inspection
    ├── settings.js      # /settings language & theme management
    └── help.js          # /help and usage formatter
```

---

## 5. Internationalization (i18n)
Add command descriptions and `/mcp` prompts to `src/i18n/en.js` and `src/i18n/es.js`:
- `cli.menuTitle`
- `cli.cmdLoadDesc`
- `cli.cmdMcpDesc`
- `cli.cmdPresetsDesc`
- `cli.cmdSettingsDesc`
- `cli.cmdHelpDesc`
- `cli.cmdExitDesc`
- `cli.mcpSelectEngine`
- `cli.mcpSelectAgents`
- `cli.mcpServerNamePrompt`
- `cli.mcpSuccess`
- `cli.mcpFailed`
- `cli.mcpNoAgentsSelected`

---

## 6. Testing Strategy
1. **Unit Tests for Router (`test/cli-router.test.js`):**
   - Verify argument parsing correctly distinguishes slash commands (`/settings`, `/load`, `/mcp`, `/presets`, `/help`) from flags (`--presets`, `--engine`, etc.).
   - Verify non-interactive execution routes directly to command handlers without prompting.
   - Verify fallback handling and exit codes.
2. **Integration Tests for `/mcp` CLI Flow (`test/cli-mcp.test.js`):**
   - Test `/mcp` command execution with mocked `mcpManager` and `@inquirer/prompts`.
3. **Regression Tests:**
   - Run the full test suite (`npm test`) to ensure all existing 208 unit and integration tests continue passing.
