---
name: update-readme
description: "Use when creating, auditing, or updating a project README.md or translated README files (/update-readme, sync README, fix outdated documentation)."
license: MIT
metadata:
  author: ronald32acunadev
  version: "1.0"
---

## Activation Contract

Load this skill when the user invokes `/update-readme` (or `$update-readme`) or asks to create, audit, modernize, or synchronize `README.md` or `README.<lang>.md` files.

**Core principle:** Every command, flag, and path in a README must be proven by repository files—never copied blindly from templates or assumed from filenames.

## Hard Rules

- **Read the content of every `README*.md` file**: Listing filenames with `ls` is NEVER sufficient. Read the actual contents of `README.md` and every `README.<lang>.md` and compare each file's `# Title` (H1) and sections against the root manifest (`package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `pubspec.yaml`).
- **Detect Foreign/Overwritten READMEs**: If `README.md` has a different H1 title or describes a bootstrap template instead of the manifest's project, classify it as **Foreign/Overwritten** and rebuild it from codebase facts and any valid `README.<lang>.md`.
- **Read CLI entrypoints, not just manifests**: Inspect `bin`/`main` targets and router/help modules to capture real subcommands, slash commands, and flags.
- **Zero hallucinated commands or dead sections**: Document only scripts, flags, and env vars proven to exist in code. Omit irrelevant boilerplate headings.
- **Artifact language**: Write `README.md` in English (`AGENTS.md`). Keep translated prose in `README.<lang>.md` and synchronize all language files.

## Decision Gates

### 1. Existing README State

| Condition | Action |
| :--- | :--- |
| `README.md` missing or empty | **Bootstrap**: Generate from codebase facts + matching Archetype Blueprint. |
| `README.md` H1 title/subject differs from manifest project (e.g., template text) | **Foreign/Overwritten**: Rebuild `README.md` from codebase facts + any accurate `README.<lang>.md`. |
| `README.md` H1 matches manifest project but misses features, flags, or sections | **Drifted**: Update in place; preserve valid badges, language switchers, diagrams, and notes. |
| User passed scope arguments (`/update-readme <scope>`) | **Scoped**: Edit `<scope>` only, verifying touched facts against code. |

### 2. Project Archetype

| Repository Signals | Blueprint in `references/archetypes-and-checklists.md` |
| :--- | :--- |
| `bin` entries, CLI router/flags, or Desktop/TUI launcher | **A. CLI & Desktop Application** |
| Reusable module exports (`main`/`exports`/`lib`), no CLI | **B. Library / SDK / Package** |
| HTTP/WebSocket server, database, or full-stack web app | **C. Web Application / Backend API Service** |
| Agent rules (`AGENTS.md`), `.agents/` skills, starter config | **D. Bootstrap Template / Agent Rules Repository** |

## Execution Steps

1. **Extract Codebase Ground Truth**: Read the root manifest and the CLI/entrypoint/router/help source files wired in `bin`/`main` per [`references/archetypes-and-checklists.md`](./references/archetypes-and-checklists.md).
2. **Read & Audit All `README*.md` Files**: List `README*` at the root, read the contents of `README.md` and every `README.<lang>.md`, and compare each file's H1 title and sections against the manifest via Decision Gate 1.
3. **Select Archetype**: Pick the blueprint from Decision Gate 2 and read [`references/archetypes-and-checklists.md`](./references/archetypes-and-checklists.md) for section order and cognitive-load formatting.
4. **Draft & Synchronize**: Update `README.md` in English and synchronize any companion `README.<lang>.md`.
5. **Verify**: Confirm every documented command, flag, and local file link exists in the repository with zero placeholders.

## Output Contract

Return:
- **Audit Summary**:
  - `Manifest Name & Version`: `<name>@<version>`
  - `Existing README.md H1`: `<exact line 1 H1 of README.md>`
  - `Companion READMEs`: `<filename: exact line 1 H1>` (or `none`)
  - `Classification`: `<Bootstrap | Foreign/Overwritten | Drifted | Scoped>` + discrepancies fixed.
- **Files Modified**: Clickable links to updated `README*.md` files.
- **Verification Evidence**: Confirmation that all commands, flags, and file paths match the codebase.

## References

- [`references/archetypes-and-checklists.md`](./references/archetypes-and-checklists.md) — Ecosystem extraction matrix, archetype blueprints, cognitive-load rules, and anti-rationalization table.
