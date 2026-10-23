# AGENTS.md

Instructions for every AI coding agent working in this repository (Antigravity, Claude Code, Codex, Cursor, OpenCode, and any other). Read this file at the start of every new session.

## Language and Documentation Rule (MANDATORY)

- **English by default**: All source code, identifiers, function and variable names, comments, documentation (`docs/`, READMEs, architecture/planning docs), and commit messages MUST be written in English.
- **Translations**: Translations are the only exception (e.g., `README.es.md` or dedicated i18n localization catalogs). In multi-language applications, internal code, identifiers, and core error/status codes remain strictly in English, while user-facing localized strings go through dedicated i18n catalogs.

## Code Authorship & Delegation Rule

**New or modified source code in this repository is synthesized by local LLM providers first. The agent writes the code itself only when local providers are unavailable.**

Local models are the owner's dedicated code synthesizers, exposed to agents as MCP servers. The agent is the orchestrator: it understands the request, prepares the context, prompts the local model for code, reviews the answer, applies it to files, and verifies it.

### Delegation Hierarchy & Dynamic Model Selection

**Dynamic Model Policy**: Do NOT restrict or hardcode specific model names. The agent must dynamically use whichever model is currently loaded in memory in LM Studio or Ollama.

1. **Primary Provider: `pumbastudio`**
   - Served by LM Studio (port `1234`), MCP tool `openai_chat`.
   - **Model**: Target the model currently loaded in LM Studio. Use the active model identifier or standard local alias (e.g., `"gpt-4o"` or active loaded model ID). LM Studio automatically serves completions using whichever model is active in memory.
2. **Secondary Provider: `pumbalama`**
   - Served by Ollama (port `11434`), MCP tool `chat_completion`.
   - Used when `pumbastudio` is unreachable or fails.
   - **Model**: Target whichever model is currently active/loaded in Ollama (e.g., checking active running models via `/api/ps` or using the active Ollama model). Do not restrict to any pre-defined model name.
3. **Fallback: Host Model (Gemini, Claude, etc.)**
   - Used when neither `pumbastudio` nor `pumbalama` is reachable or both fail (e.g., connection errors, GPU OOM, or no model loaded).
   - The host model takes over seamlessly without halting or blocking the task, noting briefly that local models were unavailable.

### What Local Models Write

- Source code (e.g., `src/`, `lib/`, `electron/`, etc.).
- Unit, integration, and end-to-end tests (e.g., `test/`, `tests/`).
- Scripts and executable routines.

### What the Agent Does Itself

- Exploration, codebase mapping, task tracking, and planning.
- Resolving library dependencies, reading up-to-date documentation.
- Applying synthesized code to disk and executing builds/tests.
- Reviewing code for correctness, safety, and architectural standards.
- Documentation (`docs/`, READMEs), configuration files, and commit messages.
- Mechanical edits with no logic: renames, imports adjustments, code formatting.

## Workflow

1. **Explore and Plan**: Explore the code and decide what needs to change. Do not ask local models to explore; they have no filesystem or repository access.
2. **Resolve Library Facts (Cache-Aside Flow)**: Before every code request, resolve the current state of every library the task touches using the `.context/` cache or Context7, and build the Library Context Brief. Never send a code request without it.
3. **Prepare Prompt**:
   - Call `pumbastudio` (or fallback to `pumbalama`) with a self-contained prompt that follows the Prompt Template below.
   - **System message**: Include project rules that apply (language, architecture constraints, style).
   - **User message**: Include the Library Context Brief, the exact task, target file paths, relevant existing code verbatim, and expected output format (full file or exact replacement block).
4. **Review**: Check the answer against the request, the Library Context Brief, project rules, and language requirements. Reject any API, import, or option that is not in the brief or in the existing code. If incorrect or incomplete, send a follow-up naming the specific defect and the correct API.
5. **Apply and Test**: Apply the code to files using file tools and run applicable tests.

## Library Context Brief & Offline Documentation Cache (MANDATORY)

Local models have fixed knowledge cutoffs and no internet or repository access. They do not know the latest library versions, newly introduced APIs, or recent breaking changes, and they will confidently write code against an older API. The quality of their code depends on how specific the agent is.

Agents must resolve current library documentation using a **Cache-Aside** strategy:

1. **Resolve version from lockfile/manifest**: The orchestrating agent checks the project's lockfile (`package-lock.json`, `pnpm-lock.yaml`, `Cargo.lock`, `pyproject.toml`, `go.mod`, etc.) for the exact installed version. Never query documentation without an exact version.
2. **Check local cache (`.context/`)**: Look for `.context/<library>@<version>.md` (ignored by Git in `.gitignore`):
   - **Cache Hit**: Read reference documentation directly from disk with zero network latency.
   - **Cache Miss**: Query Context7 (or official docs/type definitions) for that exact version, save the result to `.context/<library>@<version>.md`, and proceed.
3. **Curate the brief**: The orchestrator extracts only the signatures, options, and minimal examples needed for the task into the Library Context Brief. Never dump whole raw documentation files into the local model's prompt.
4. **Engram vs .context/ separation of concerns**:
   - **`.context/`**: Raw third-party API documentation and SDK guides (local cache).
   - **Engram (`mem_save`)**: Project-specific discoveries, gotchas, architecture choices, and bug root causes. Never save raw third-party doc dumps to Engram.

Every code request includes a brief with, for each library the task touches:

1. **Runtime and version**: Language and runtime version (e.g., Node 22, Python 3.12) and the exact installed library version, taken from the lockfile, not guessed.
2. **Current API surface**: Exact import paths, function and class signatures, option names, and return types the task needs, copied from the docs or type definitions for that version.
3. **Recent changes**: Breaking changes, renamed or moved APIs, and new recommended patterns introduced in recent major or minor versions, stated as "use X, not Y".
4. **Forbidden APIs**: Deprecated or removed functions, options, and patterns that must not appear in the answer.
5. **Minimal working example**: One short, verified usage example from the official docs for that version.
6. **Project usage**: How the project already uses the library (an existing call site verbatim), so the answer matches local conventions.

Then detail the change itself step by step: functions to add or change, behavior, inputs and outputs, error handling, and edge cases. If a fact cannot be verified, say so in the prompt instead of letting the model guess.

### Prompt Template

```text
## Library Context Brief
- Runtime: <language + version>
- <library>@<exact version>
  - Imports: <exact import statements>
  - API: <signatures and options used by this task>
  - Changed in recent versions: use <new>, not <old>
  - Do NOT use: <deprecated/removed APIs>
  - Example (official docs): <short snippet>
  - Existing project usage: <verbatim call site>

## Task
<exact change, step by step, with inputs/outputs and edge cases>

## Target files
<paths + relevant existing code verbatim>

## Output format
<full file | exact replacement block>. Use only the APIs listed above.
```

## MCP Server Setup Reference

Each agent needs the servers registered in its MCP configuration:

```json
{
  "mcpServers": {
    "pumbastudio": {
      "command": "npx",
      "args": ["-y", "@mzxrai/mcp-openai@latest"],
      "env": {
        "OPENAI_BASE_URL": "http://127.0.0.1:1234/v1",
        "OPENAI_API_KEY": "sk-lm-local"
      }
    },
    "pumbalama": {
      "command": "npx",
      "args": ["-y", "ollama-mcp-server@latest"],
      "env": {
        "OLLAMA_HOST": "http://127.0.0.1:11434"
      }
    }
  }
}
```

## Project Context

- This repository is a reusable project setup template for AI coding agent rules, workflow standards, and subagent configurations.
- Add application-specific architecture, dependencies, and commands in the projects that reuse this template.
- `.atl/` and `.codegraph/` are local tooling state with their own `.gitignore`. Never stage with a blanket `git add`.
- Commits follow Conventional Commits, with no AI attribution lines.
