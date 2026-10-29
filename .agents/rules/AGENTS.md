# AGENTS.md

Instructions for every AI coding agent working in this repository (Antigravity, Claude Code, Codex, Cursor, OpenCode, and any other). Read this file at the start of every new session.

## Language and Documentation Rule (MANDATORY)

- **English by default**: All source code, identifiers, function and variable names, comments, documentation (`docs/`, READMEs, architecture/planning docs), and commit messages MUST be written in English.
- **Translations**: Translations are the only exception (e.g., `README.es.md` or dedicated i18n localization catalogs). In multi-language applications, internal code, identifiers, and core error/status codes remain strictly in English, while user-facing localized strings go through dedicated i18n catalogs.

## Backlog Approval and Execution (MANDATORY)

Before implementing a requested change, the planning agent must:

1. Inspect the existing project and clarify only unresolved requirements.
2. Break the request into small, independently verifiable user stories. Use stable IDs (`US-01`, `US-02`), a simple "As a ..., I want ..., so that ..." statement, acceptance criteria, dependencies, and a verification method. A small change may need only one story; do not invent scope to fill a backlog.
3. Review the complete backlog for coverage, feasibility, dependencies, and unnecessary work, then save it to `docs/userstories/{featurename}/README.md` relative to the active project's root before generating implementation code or editing implementation files. Automatically derive `{featurename}` from the new request's intent as a short, descriptive English `kebab-case` name; do not ask the user to name it. For example, "Add Google authentication" becomes `docs/userstories/google-authentication/README.md`. Reuse that path for follow-up prompts about the same feature. For an unrelated feature with a colliding name, generate a distinct descriptive name without overwriting existing stories. This is a project-relative path, not the filesystem-root `/docs/` or the setup template's directory when working in another project.
   - Keep the full stories, acceptance criteria, dependencies, verification methods, execution mode, status, and observed verification results in that file, including for small backlogs. Creating this planning document does not authorize implementation.
   - Keep chat replies short: a brief summary, story count or progress, a link to the file, and the required approval question or blocking decision. Do not paste the complete backlog or repeat the file's details unless the user asks. Follow the file-first presentation pattern used by Superpowers, without requiring that plugin.
4. Ask, in the user's language: "Do you approve this backlog, and should I implement all stories or proceed one at a time?" Stop and wait. Approval of the design alone is not backlog approval; an ambiguous answer does not select an execution mode.

The user's explicit approval and execution choice authorize only that backlog:

- **All stories**: implement the approved stories in dependency order, verify each, and report results without asking again between stories. Stop for a blocker, a consequential unresolved decision, or a requested scope change.
- **One at a time**: implement and verify only the next approved story, show its changes and verification results, then stop for explicit approval before starting another. Never silently advance.
- **Revision**: update the affected stories and obtain approval of the revised scope before implementing them. Preserve completed work and its evidence.

Track each story as pending, in progress, blocked, or complete in the feature's user-story file; complete requires observed acceptance checks. Update that file after each story and approved scope revision, reporting only a concise summary and link in chat. If another feature/task document is required, link it rather than duplicating its execution log or creating competing story trackers. Read-only questions do not require an implementation backlog.

## Planning and Implementation Roles

- **Planner / reviewer**: use the selected reasoning-capable model for analysis, story decomposition, implementation context, and result review. It does not become the default code writer merely because it owns the conversation.
- **Implementer**: synthesize approved code, tests, and scripts using the local-first hierarchy below; when local execution is unavailable or explicitly bypassed by the user, use an available lightweight hosted model.
- Resolve model availability and selection through the current client's supported capabilities. Do not hardcode model IDs, silently change global defaults, or claim that shorter answers or lower reasoning effort change the underlying model.
- If a lightweight model cannot be selected or invoked, report that limitation and ask the user to select one or explicitly authorize the current model before generating code. Never silently fall back to the expensive planner.
- Hand off only the approved story, acceptance checks, allowed files, relevant existing code, project rules, and Library Context Brief. The planner reviews the output and runs verification regardless of the implementer.

These are cross-agent instructions, not an automatic model-switching integration. Apply them through the capabilities actually available in Codex, Claude Code, Antigravity, OpenCode, or the current client.

## Code Authorship & Delegation Rule

**New or modified source code in this repository is synthesized by local LLM providers first. When local execution is unavailable or the user explicitly chooses not to use it, a lightweight hosted implementer writes the code. The planning model writes code only with explicit user authorization when that route is unavailable.**

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
3. **Fallback: Lightweight Hosted Implementer**
   - Used when neither local provider is available, both fail (e.g., connection errors, GPU OOM, or no model loaded), or the user explicitly bypasses local execution.
   - Select a lightweight model actually available through the current client, using its supported model-selection or delegation mechanism. Report the selected route and any inability to verify the actual model identity.
   - Keep planning and review with the reasoning-capable orchestrator. If the client cannot invoke a lightweight implementer, follow the explicit user-decision rule above.

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

1. **Explore, Plan, and Obtain Approval**: Prepare and review the complete backlog in `docs/userstories/{featurename}/README.md` of the active project, automatically naming the feature from the request as described above. Share only a short summary and file link in chat, then obtain explicit approval and the all-stories or one-at-a-time choice before implementation. Do not ask local models to explore; they have no filesystem or repository access.
2. **Resolve Library Facts (Cache-Aside Flow)**: Before every code request, resolve the current state of every library the task touches using the `.context/` cache or Context7, and build the Library Context Brief. Never send a code request without it.
3. **Prepare Prompt**:
   - Select the implementer through the hierarchy above. Call `pumbastudio`, `pumbalama`, or the available lightweight hosted implementer with a self-contained prompt that follows the Prompt Template below.
   - **System message**: Include project rules that apply (language, architecture constraints, style).
     Always paste the rules in `.agents/local-llm-prompt-rules.md`, and add a short rule there whenever a review rejects part of an answer.
   - **When the MCP tool times out or cannot turn reasoning off**, run `python3 scripts/ask_local_llm.py --user request.md --out answer.md --code-out file.py` (add `--provider ollama` for Ollama). It adds the rules file to the system message itself and sends `reasoning_effort: "none"` unless `--think` is given.
   - **User message**: Include the Library Context Brief, the exact task, target file paths, relevant existing code verbatim, and expected output format (full file or exact replacement block).
4. **Review and Learn**: Check the answer against the approved story, acceptance criteria, Library Context Brief, project rules, and language requirements. Reject APIs not in the brief or existing code. Send one focused correction request for an incorrect answer; if still incorrect, report the blocker rather than silently rewriting with the planner. Record reusable corrections in `.agents/local-llm-prompt-rules.md` and project-specific findings in Engram, without secrets. This is prompt/context improvement, not automatic model training or fine-tuning.
5. **Apply, Test, and Report**: Apply the code using file tools, run the story's acceptance checks and applicable tests, and report failures honestly. Continue or pause according to the approved execution mode.

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
<approved story ID, statement, acceptance criteria, dependencies, and execution mode>
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
