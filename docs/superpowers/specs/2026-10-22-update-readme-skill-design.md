# Update README Skill Design (`update-readme`)

## 1. Intent & Motivation
Most README generators fail in real-world repositories because they impose a rigid 18-section boilerplate template from scratch, overwrite valuable project-specific context, invent CLI flags or scripts that do not exist in the codebase, or leave translated documentation (such as `README.es.md`) out of sync with `README.md`.

The goal is to create a portable, project-level skill at `.agents/skills/update-readme/SKILL.md` (and retire the legacy `Agents/readme-generator.md`) that teaches any compatible AI coding agent (Antigravity, Claude Code, Codex, OpenCode) how to **audit, update, or bootstrap** a project's `README.md` (and any companion translations) strictly grounded in repository evidence and technical writing best practices.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **Evidence-First Auditing**: Extract ground truth from manifests (`package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `pubspec.yaml`, etc.), CLI entrypoints, environment variables, and directory trees before touching any documentation.
- **Incremental & Lossless Updates**: Preserve valid existing badges, language switchers, custom architecture diagrams, and project-specific troubleshooting notes while fixing outdated sections or replacing overwritten templates.
- **Archetype Adaptation**: Tailor the README structure to the project's actual shape (CLI/Desktop App, Library/SDK, Web/API Service, or Bootstrap Template) rather than forcing empty boilerplate headings.
- **Multilingual Synchronization**: Detect companion translated READMEs (`README.es.md`, `README.<lang>.md`) and keep them structurally and factually synchronized with the primary English `README.md`.
- **Cross-Harness Portability & `/update-readme` Invocation**: Keep the canonical logic in `.agents/skills/update-readme/SKILL.md` while wiring thin native slash-command adapters so `/update-readme` works across Claude Code, OpenCode, Codex, and Antigravity without duplicating the protocol.

### Non-Goals
- Generating external documentation sites (Docusaurus, VitePress, MkDocs) or full API reference portals.
- Modifying source code, package manifests, or build scripts during a documentation update.

### Anti-Goals (Failure Modes Even If Technically Valid Markdown)
- **Hallucinated Commands or Flags**: Documenting `npm run build` or `--verbose` when no such script or flag exists in the codebase.
- **Blind Boilerplate Dumping**: Including irrelevant sections (e.g., "Database Migrations" or "Kubernetes Deployment" in a local CLI tool).
- **Silent Context Destruction**: Wiping out existing valid sections, screenshots, or language navigation headers because they were not in a generic template.
- **Drift Between `README.md` and `README.<lang>.md`**: Updating one language file while leaving the other outdated or describing a different project.

---

## 3. Constraints
- **Artifact Language**: Follows `AGENTS.md`—the primary `README.md` and `SKILL.md` must be written in English. Companion translation files (`README.es.md`, etc.) use neutral/professional target-language prose while keeping code, CLI flags, and identifiers in English.
- **Skill Discovery Format**: Frontmatter `name: update-readme` and `description` starting with `"Use when..."` (under 1024 characters, third-person, listing triggering symptoms and contexts without summarizing the workflow).
- **TDD Skill Verification**: Must be validated using the `writing-skills` RED-GREEN-REFACTOR methodology (baseline subagent test without the skill vs. compliance test with the skill).

---

## 4. Approaches Considered

| Approach | Description | Trade-offs | Decision |
| :--- | :--- | :--- | :--- |
| **A. Self-Contained Protocol Skill (`SKILL.md` only)** | Encodes the complete 5-phase audit, archetype mapping, incremental merge rules, multilingual sync, and verification checklist directly in `.agents/skills/update-readme/SKILL.md`. | **Pros**: Zero runtime dependencies; works in Rust, Python, Go, Dart, or Node repos out of the box; easy to copy across projects.<br>**Cons**: Relies on the agent executing verification commands via its native tools. | **Selected** — Maximizes portability across any project while keeping `.agents/` clean. |
| **B. Hybrid Skill (`SKILL.md` + Node.js Audit Script)** | Pairs `SKILL.md` with a `scripts/audit-readme.js` helper to scan broken links and manifest scripts automatically. | **Pros**: Deterministic link/script checking.<br>**Cons**: Couples a universal skill to a Node.js runtime and adds maintenance overhead. | Rejected — Violates cross-language portability for "any project". |

---

## 5. Skill Architecture & Workflow (`SKILL.md`)

### 5.1 Five-Phase Execution Protocol
1. **Phase 1 — Codebase Ground-Truth Extraction**:
   - Inspect manifests (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pubspec.yaml`), entrypoints (`bin`, `main`, `exports`), CLI parsers/routers, test runners, and `.gitignore`.
   - Record only verified commands, minimum runtime versions, dependencies, and actual directory paths.
2. **Phase 2 — Existing README & Translation Audit**:
   - Read `README.md` and check for localized counterparts (`README.*.md`) or `docs/`.
   - Classify each existing section as: **Accurate (Keep)**, **Drifted (Update)**, **Missing (Add)**, or **Foreign/Overwritten (Replace)** (e.g., when a template README overwrote the project README, use the code and any accurate companion `README.<lang>.md` as sources).
3. **Phase 3 — Archetype Selection & Section Mapping**:
   - Select the matching project archetype instead of a rigid 18-section list:
     - **CLI / Desktop Application**: Header + Badges + Language Switcher → Value Proposition & How It Works → Features → Installation → Usage (Interactive, GUI, Non-Interactive CLI + Flag Reference Table) → Architecture & Storage Paths → Development & Testing → Troubleshooting → License.
     - **Library / SDK**: Header + Badges → Overview → Installation → Quick Start (runnable snippet) → API Overview → Development & Tests → License.
     - **Service / API / Full-Stack App**: Header → Overview & Architecture → Prerequisites & Environment Variables → Setup & Run → Endpoints / Workflows → Deployment & Testing → Troubleshooting.
     - **Template / Rules Repository**: Header → Overview → Quick Start (Copy/Bootstrap steps) → Included Assets & Directory Tree → Workflow & Sync Invariants → Troubleshooting.
4. **Phase 4 — Evidence-Based Drafting & Multilingual Sync**:
   - Draft or update `README.md` in clear, scannable English (tables for flags/options, fenced code blocks with language tags, concise paragraphs).
   - If `README.<lang>.md` exists (or is requested), synchronize its structure, commands, and version badges with `README.md`.
5. **Phase 5 — Mandatory Verification Checklist**:
   - Verify every file link and directory path exists on disk.
   - Verify every documented script/command matches the manifest or CLI router.
   - Confirm zero placeholder tokens (`TODO`, `your-org`, `[insert ...]`) remain.

### 5.2 Cross-Agent `/update-readme` Invocation Wiring
Each agent harness resolves slash commands and skills slightly differently at the project level:
- **Canonical Skill (`.agents/skills/update-readme/SKILL.md`)**: Single source of truth discovered natively by **Codex**, **Antigravity**, and `gentle-ai skill-registry refresh` (`.atl/skill-registry.md`). Includes `/update-readme` in its `description` trigger so typing `/update-readme` (or `$update-readme` in Codex's skill picker) activates it immediately.
- **Claude Code Native Slash Command (`.claude/commands/update-readme.md`)**: Thin project-level command file that instructs Claude Code to load and execute `.agents/skills/update-readme/SKILL.md`, registering `/update-readme` in Claude Code's native `/` autocomplete menu.
- **OpenCode Native Slash Command (`.opencode/commands/update-readme.md`)**: Thin project-level command file (matching `~/.config/opencode/commands/skill-creator.md`) that registers `/update-readme` in OpenCode's TUI `/` menu and delegates to the `update-readme` skill.

### 5.3 Repository Cleanup
- Remove the legacy `Agents/readme-generator.md` directory/file so `.agents/skills/update-readme/SKILL.md` becomes the single canonical solution.
- Run `gentle-ai skill-registry refresh --force` to index `update-readme` in `.atl/skill-registry.md`.
