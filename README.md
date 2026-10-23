# Project Setup Template

Reusable bootstrap template containing universal AI coding agent rules, local-first code delegation standards, offline documentation caching, and subagent definitions for initializing software projects.

![Status](https://img.shields.io/badge/status-active-success)
![Format](https://img.shields.io/badge/format-AGENTS.md-blue)
![MCP](https://img.shields.io/badge/MCP-LM%20Studio%20%7C%20Ollama-orange)
![Cache](https://img.shields.io/badge/docs%20cache-.context%2F-purple)

---

## Overview

**Project Setup Template** standardizes how AI coding assistants (Antigravity, Claude Code, Codex, Cursor, OpenCode, and compatible CLI tools) operate across software repositories. Instead of repeating operational guardrails in every repository, this template provides a single, self-contained rule payload (`AGENTS.md`) alongside a synchronized `.agents/rules/AGENTS.md` mirror, a Claude Code adapter (`CLAUDE.md`), and reusable subagent prompts (`Agents/`).

It solves four recurring problems in AI-assisted development:
- **Inconsistent artifact language and commit hygiene**: Enforces English-only code, comments, documentation, and Conventional Commits without AI attribution.
- **Uncontrolled cloud model usage for routine code synthesis**: Routes source code, test, and script generation to local LLMs first (`pumbastudio` via LM Studio and `pumbalama` via Ollama) with dynamic active-model targeting.
- **Hallucinated or deprecated APIs from offline models**: Requires the orchestrating agent to assemble a verified **Library Context Brief** from lockfiles and current documentation before prompting a local model.
- **Redundant API queries & documentation latency**: Implements a local, Git-ignored **Cache-Aside** documentation cache (`.context/<lib>@<version>.md`) fed by Context7, keeping project decisions in Engram and raw docs on disk.

Application-specific runtimes, package manifests, builds, linters, and test suites intentionally do not live in this repository; add them in the target projects initialized from this template.

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Features & Standards](#features--standards)
- [Architecture Overview](#architecture-overview)
- [Included Subagents](#included-subagents)
- [Repository Structure](#repository-structure)
- [Usage in New Projects](#usage-in-new-projects)
- [MCP Server Configuration](#mcp-server-configuration)
- [Workflow for a Code Change](#workflow-for-a-code-change)
- [Documentation Cache & Engram Protocol](#documentation-cache--engram-protocol)
- [Sync Invariant](#sync-invariant)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Quick Start

1. **Copy the canonical rule file into your target project**:
   ```bash
   cp AGENTS.md /path/to/your-project/
   ```
2. **Copy the `.agents` rule mirror (for tools that read `.agents/rules/`)**:
   ```bash
   cp -r .agents /path/to/your-project/
   ```
3. **Copy `CLAUDE.md` if using Claude Code**:
   ```bash
   cp CLAUDE.md /path/to/your-project/
   ```
4. **Ensure `.context/` is added to `.gitignore`**:
   ```bash
   echo ".context/" >> /path/to/your-project/.gitignore
   ```
5. **Install the `readme-generator` subagent (optional)**:
   ```bash
   mkdir -p /path/to/your-project/.claude/agents
   cp Agents/readme-generator.md /path/to/your-project/.claude/agents/
   ```
6. **Verify rule synchronization when editing rules in this repository**:
   ```bash
   git diff --no-index AGENTS.md .agents/rules/AGENTS.md
   ```

---

## Prerequisites

- **Git** (`2.x+`) for repository management and running the byte-identical sync check (`git diff --no-index`).
- **Node.js & `npx`** (`18+` recommended) to launch the MCP stdio bridges (`@mzxrai/mcp-openai` and `ollama-mcp-server`).
- **Local LLM Provider (at least one recommended for local code synthesis)**:
  - [LM Studio](https://lmstudio.ai/) running its local OpenAI-compatible server on `http://127.0.0.1:1234/v1` with any coding model loaded.
  - [Ollama](https://ollama.com/) running on `http://127.0.0.1:11434` with an active model pulled.
- **Documentation Provider (Optional / Recommended)**: Context7 MCP server for fetching up-to-date library references.
- **Supported AI Coding Agent**: Antigravity, Claude Code, OpenCode, Cursor, Codex, or any agent supporting `AGENTS.md` / `.agents/rules/AGENTS.md` and MCP tools.

---

## Features & Standards

1. **Artifact Language & Commit Hygiene (Mandatory)**
   - All source code, identifiers, comments, documentation, and commit messages must be written in **English**.
   - Explicit translations (such as `README.es.md` or dedicated i18n catalogs) are the only exception.
   - All commits follow **Conventional Commits** with no `Co-Authored-By` or AI attribution lines.

2. **Local-First Code Authorship (Dynamic Model Selection)**
   - New or modified source code, tests, and executable scripts must be synthesized by a local model first.
   - The orchestrating agent explores the repository, builds the context brief, reviews the output, and applies changes; it writes docs, configuration, commit messages, and mechanical edits (renames, imports, formatting) directly, and writes application code only if both local providers fail.
   - Model names are **never hardcoded**—both LM Studio and Ollama serve whichever model is currently loaded.

3. **Mandatory Library Context Brief**
   - Local models have fixed knowledge cutoffs and no internet access.
   - Before delegating code synthesis, the orchestrating agent resolves exact library versions and current APIs (lockfile/manifest → `.context/` cache or Context7 → installed package source/types) and passes a structured `Library Context Brief`.
   - Any generated code that uses an import, API, or option absent from both the brief and existing code is rejected and resent with the specific defect named.

4. **Cache-Aside Documentation (`.context/`) & Memory Separation**
   - Raw external documentation fetched from Context7 is persisted locally under `.context/<library>@<version>.md` (ignored by Git) to avoid repeated API requests.
   - **Engram** is reserved exclusively for project decisions, architecture rationale, bug root causes, and learnings. Third-party raw documentation is never saved in Engram.

---

## Architecture Overview

```text
                                  +-------------------------------------------------------------+
                                  |                     Lockfile / Manifest                     |
                                  | (package-lock.json, pnpm-lock.yaml, Cargo.lock, pyproject)  |
                                  +------------------------------+------------------------------+
                                                                 |
                                                                 v (Extracts exact version: lib@1.2.3)
                                  +-------------------------------------------------------------+
                                  |                     Orchestrating Agent                     |
                                  |   (Antigravity / Claude Code / OpenCode / Cursor / Codex)   |
                                  +------------------------------+------------------------------+
                                                                 |
                                        +------------------------+------------------------+
                                        | Check .context/lib@1.2.3.md                     |
                                        v                                                 v
                            [Cache Hit: Local Disk]                           [Cache Miss: Query Context7]
                                        |                                                 |
                                        |                                                 v
                                        |                                     Save to .context/lib@1.2.3.md
                                        |                                                 |
                                        +------------------------+------------------------+
                                                                 |
                                                                 v
                                  +-------------------------------------------------------------+
                                  |                 Library Context Brief Assembly              |
                                  |  (Extracts ONLY needed signatures/options; no raw dumps)    |
                                  +------------------------------+------------------------------+
                                                                 |
                                                                 v
+-------------------------------------------------------------------------------------------------------------------------------+
|                                                 Local Code Synthesis Pipeline                                                 |
|                                                                                                                               |
|   Tier 1: pumbastudio (LM Studio @ 127.0.0.1:1234/v1) -> Tool: openai_chat                                                   |
|             | (on failure / unavailable)                                                                                      |
|             v                                                                                                                 |
|   Tier 2: pumbalama (Ollama @ 127.0.0.1:11434)        -> Tool: chat_completion                                               |
|             | (on failure / unavailable)                                                                                      |
|             v                                                                                                                 |
|   Tier 3: Host Model (Fallback only)                                                                                          |
+---------------------------------------------------------------+---------------------------------------------------------------+
                                                                |
                                                                v
                                  +-------------------------------------------------------------+
                                  |                    Review, Apply & Verify                   |
                                  | 1. Rejects APIs not in Brief or existing codebase           |
                                  | 2. Applies code via file tools                              |
                                  | 3. Runs verification commands                               |
                                  | 4. Saves architectural learnings/gotchas to Engram          |
                                  +-------------------------------------------------------------+
```

### Code Authorship Tier Order

| Order | Server | `npx` Package | Endpoint | Tool | Harness-Qualified Names |
|---|---|---|---|---|---|
| 1 | `pumbastudio` (LM Studio) | `@mzxrai/mcp-openai` | `http://127.0.0.1:1234/v1` | `openai_chat` | OpenCode: `tools.pumbastudio.openai_chat`<br>Claude Code: `mcp__pumbastudio__openai_chat` |
| 2 | `pumbalama` (Ollama) | `ollama-mcp-server` | `http://127.0.0.1:11434` | `chat_completion` | OpenCode: `tools.pumbalama.chat_completion`<br>Claude Code: `mcp__pumbalama__chat_completion` |
| 3 | Host model | — | — | Native synthesis | Fallback only when Tiers 1 and 2 fail |

---

## Included Subagents

### `Agents/readme-generator.md`
A specialized technical documentation subagent that analyzes repository structure, technology stack, architectural patterns, and existing rules to draft comprehensive, onboarding-ready `README.md` files.

> **Note**: `Agents/readme-generator.md` lives outside `.claude/agents/` in this template so tools do not load it automatically until you copy it into a target project's subagent directory.

---

## Repository Structure

```text
.
├── .agents/
│   └── rules/
│       └── AGENTS.md            # Byte-identical mirror of AGENTS.md (.agents standard)
├── Agents/
│   └── readme-generator.md      # Reusable subagent definition for README generation
├── AGENTS.md                    # Canonical, agent-agnostic rules payload
├── CLAUDE.md                    # Claude Code entry point (@AGENTS.md import + notes)
├── .gitignore                   # Excludes .context/, .venv/, and local tooling artifacts
└── README.md                    # Project documentation, MCP config, and usage guide
```

> **Note**: `.context/`, `.atl/`, and `.codegraph/` are local runtime caches and state. Never commit them or stage files with a blanket `git add .`.

---

## Usage in New Projects

Select the integration layout required by your coding tools when bootstrapping a new project:

### 1. Standalone Rule File (Option A)
Copy `AGENTS.md` to the root of your target project (supported by OpenCode, Codex, Antigravity, Cursor, and others):
```bash
cp AGENTS.md /path/to/your-new-project/
```

### 2. `.agents` Customization Directory (Option B)
Copy the `.agents` directory for tools that discover rules under `.agents/rules/`:
```bash
cp -r .agents /path/to/your-new-project/
```

### 3. Claude Code Integration (Option C)
Copy both `AGENTS.md` and `CLAUDE.md` (`CLAUDE.md` imports `@AGENTS.md` automatically):
```bash
cp AGENTS.md CLAUDE.md /path/to/your-new-project/
```

### 4. Git Ignore Setup
Ensure local documentation cache files are excluded in target projects:
```bash
echo ".context/" >> /path/to/your-new-project/.gitignore
```

### 5. Installing Subagents
To enable `readme-generator` in a Claude Code project:
```bash
mkdir -p /path/to/your-new-project/.claude/agents
cp Agents/readme-generator.md /path/to/your-new-project/.claude/agents/
```

---

## MCP Server Configuration

Register `pumbastudio` (LM Studio) and `pumbalama` (Ollama) in your agent's MCP configuration file to enable Tier 1 and Tier 2 local code synthesis:

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

---

## Workflow for a Code Change

When working in any project governed by `AGENTS.md`, the agent follows a strict 5-step loop for every code change:

1. **Explore & Plan**: Inspect the repository and determine the exact change. Local models have no filesystem or repo access, so exploration is never delegated.
2. **Resolve Library Facts (Cache-Aside Flow)**:
   - Extract the exact version from the lockfile/manifest.
   - Check `.context/<library>@<version>.md`. If absent, fetch from Context7 and save to disk.
   - Build the `Library Context Brief`.
3. **Send One Self-Contained Prompt**: Pass project rules as the `system` message and the Library Context Brief, task specification, verbatim target code, and output format as the `user` message.
4. **Review Against Brief & Code**: Reject any import, API, or option absent from both the brief and existing project code; re-prompt naming the exact defect and the valid API.
5. **Apply & Verify**: Write the verified changes using file tools and run the target project's verification suite.

### Library Context Brief Template

```text
## Library Context Brief
- Runtime: <language + version>
- <library>@<exact installed version>
  - Imports: <exact import statements>
  - API: <signatures, options, return types used by this task>
  - Changed recently: use <new>, not <old>
  - Do NOT use: <deprecated or removed APIs>
  - Example (official docs): <short verified snippet>
  - Existing project usage: <verbatim call site>

## Task
<step-by-step change: behavior, inputs/outputs, error handling, edge cases>

## Target files
<paths + relevant existing code verbatim>

## Output format
<full file | exact replacement block>. Use only the APIs listed above.
```

---

## Documentation Cache & Engram Protocol

To ensure clean separation of concerns and avoid memory bloat, follow this strict boundary:

| Resource | Storage Location | Responsibility |
|---|---|---|
| **Raw Third-Party Documentation** | `.context/<library>@<version>.md` (Disk, `.gitignore`) | Cached API surfaces, function signatures, migration guides, and official examples fetched from Context7. |
| **Architectural Decisions & Gotchas** | **Engram** (`mem_save` tool) | Project-specific trade-offs, unexpected library bugs, custom integration patterns, and bug root causes. |

Never dump whole documentation files into Engram, and never feed raw documentation files directly to local models.

---

## Sync Invariant

`AGENTS.md` and `.agents/rules/AGENTS.md` **must remain byte-identical** at all times. Any rule change must update `AGENTS.md`, `.agents/rules/AGENTS.md`, and the summary in `README.md` within the same commit.

Verify synchronization before committing:

```bash
git diff --no-index AGENTS.md .agents/rules/AGENTS.md
```

An empty output confirms both rule files are synchronized.

---

## Troubleshooting

| Symptom | Cause | Solution |
|---|---|---|
| `git diff --no-index AGENTS.md .agents/rules/AGENTS.md` outputs a diff | Only one of the two rule files was edited | Copy the canonical file over the mirror (`cp AGENTS.md .agents/rules/AGENTS.md`) and re-run the diff check. |
| `pumbastudio` (`openai_chat`) fails to connect | LM Studio server is stopped or listening on a different port | Start the local server in LM Studio on `127.0.0.1:1234` and load a model, or let the agent fall back to `pumbalama` (Ollama). |
| Local model invents deprecated methods or wrong imports | Missing or incomplete `Library Context Brief` | Verify the exact version in the lockfile, check `.context/<lib>@<version>.md` (or query Context7), and provide explicit signatures in the brief. |
| Stale library documentation in cache | Library was updated in lockfile but old `.context/` file remains | The cache filename is version-keyed (`<lib>@<version>.md`), so a version bump triggers a cache miss automatically. Remove old versions if disk cleanup is needed. |
| `readme-generator` does not appear in Claude Code | `Agents/` is a template directory, not `.claude/agents/` | Copy `Agents/readme-generator.md` into `.claude/agents/` inside the target project. |

---

## Contributing

1. Edit `AGENTS.md` and mirror the exact change to `.agents/rules/AGENTS.md`.
2. If you add, rename, or remove any file under `Agents/`, update both the **Included Subagents** and **Repository Structure** sections in `README.md`.
3. Verify byte-identical synchronization with `git diff --no-index AGENTS.md .agents/rules/AGENTS.md`.
4. Stage specific tracked files explicitly (never stage `.context/`, `.atl/`, or run a blanket `git add .`).
5. Commit in English using **Conventional Commits** (`docs: ...`, `feat: ...`, `chore: ...`) without AI attribution footers.
