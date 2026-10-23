# `/update-readme` Cross-Agent Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a portable, evidence-driven `.agents/skills/update-readme/SKILL.md` skill and thin native `/update-readme` slash-command adapters for Claude Code, OpenCode, Codex, and Antigravity, replacing the legacy `Agents/readme-generator.md`.

**Architecture:** A single source of truth at `.agents/skills/update-readme/SKILL.md` defines the activation triggers, hard rules, decision gates, and 5-phase README audit/update workflow, paired with `.agents/skills/update-readme/references/archetypes-and-checklists.md` for archetype templates to keep the main skill within the 180–700 token budget. Thin project command adapters in `.claude/commands/update-readme.md` and `.opencode/commands/update-readme.md` expose `/update-readme` in Claude Code and OpenCode TUIs while Codex and Antigravity discover `.agents/skills/update-readme/SKILL.md` directly.

**Tech Stack:** Markdown (`SKILL.md`, Agent Skills specification, Gentle AI skill-registry, Claude Code & OpenCode command frontmatter).

**Spec:** `docs/superpowers/specs/2026-10-22-update-readme-skill-design.md`

## Global Constraints

- Primary `README.md` and all skill/command definitions must be written in English (`AGENTS.md` Language Rule).
- `SKILL.md` frontmatter `description` must be a single quoted YAML-safe line `<= 250` characters, starting with `"Use when..."` and including `/update-readme` trigger keywords.
- `SKILL.md` body must stay under 700 tokens (`skill-style-guide.md`) and follow the section order: `Activation Contract`, `Hard Rules`, `Decision Gates`, `Execution Steps`, `Output Contract`, `References`.
- Zero invented CLI commands, scripts, flags, or directory paths in any generated/updated README.
- Companion translated READMEs (`README.es.md`, `README.<lang>.md`) must be audited and kept synchronized when present.

## Review Focus

- Overwritten or foreign `README.md` (where `README.md` belongs to a bootstrap template while `package.json` and `README.es.md` describe the real project) must be detected as `Overwritten/Foreign` and rebuilt from codebase facts + companion translation, not patched superficially.
- Projects without a build step (e.g., pure ESM Node CLI) must not get hallucinated `npm run build` commands in Quick Start or Development sections.
- Existing valid custom elements (badges, language switchers, ASCII diagrams, platform support tables) must be preserved during incremental updates.
- invoking `/update-readme` with optional user arguments (e.g., `/update-readme focus on MCP section`) must honor the user's scope while still verifying every touched fact against the codebase.
- `.atl/skill-registry.md` must index `update-readme` at project scope via `gentle-ai skill-registry refresh --force`.

---

### Task 1: RED Phase — Baseline Subagent Pressure Scenario (Without Skill)

**Files:**
- Test: Subagent (`research` read-only) baseline evaluation against `llmtuner` repository

**Interfaces:**
- Consumes: current repository state (`package.json`, `README.md`, `README.es.md`, legacy `Agents/readme-generator.md`)
- Produces: verbatim baseline failure observations and rationalizations to counter in `SKILL.md`

- [x] **Step 1: Dispatch baseline `research` subagent under time/template pressure without `update-readme` skill**

Prompt a read-only `research` subagent to propose a plan/outline for updating `README.md` in this repo under time pressure ("we need a quick README update, keep it fast, use standard 18-section template if helpful") and observe whether it:
1. Notices `README.md` is actually a foreign template ("Project Setup Template") while `package.json` and `README.es.md` are `llm-tuner`.
2. Checks `README.es.md` for bilingual parity.
3. Avoids imposing irrelevant boilerplate sections (e.g., API Reference, Deployment, Database) from `Agents/readme-generator.md`.

- [x] **Step 2: Record baseline failures and rationalizations**

Verify the subagent response and record specific gaps to counter in `Hard Rules` and `Decision Gates`.

---

### Task 2: GREEN Phase — Author `.agents/skills/update-readme/` Skill & Reference

**Files:**
- Create: `.agents/skills/update-readme/SKILL.md`
- Create: `.agents/skills/update-readme/references/archetypes-and-checklists.md`

**Interfaces:**
- Consumes: baseline findings from Task 1, `skill-style-guide.md`, `cognitive-doc-design`
- Produces: `.agents/skills/update-readme/SKILL.md` and `.agents/skills/update-readme/references/archetypes-and-checklists.md`

- [x] **Step 1: Create `.agents/skills/update-readme/references/archetypes-and-checklists.md`**

Include:
1. Project Archetype Section Blueprints (`CLI / Desktop App`, `Library / SDK`, `Web / API Service`, `Template / Rules Repo`).
2. Ground-Truth Extraction Matrix by ecosystem (Node/TS, Rust, Python, Go, Dart/Flutter).
3. Cognitive Load & Formatting Checklist (progressive disclosure, scannable tables for flags/env vars, runnable code blocks with language tags, badge & language-switcher hygiene).
4. Anti-Rationalization & Common Mistakes Table.

- [x] **Step 2: Create `.agents/skills/update-readme/SKILL.md`**

Use exact frontmatter:
```yaml
---
name: update-readme
description: "Use when creating, auditing, or updating a project README.md or translated README files (/update-readme, sync README, fix outdated documentation)."
license: MIT
metadata:
  author: ronald32acunadev
  version: "1.0"
---
```
Include ordered sections (`Activation Contract`, `Hard Rules`, `Decision Gates`, `Execution Steps`, `Output Contract`, `References`) within the 180–700 token budget.

- [x] **Step 3: Verify frontmatter and word/token budget**

Run: `wc -w .agents/skills/update-readme/SKILL.md && head -n 10 .agents/skills/update-readme/SKILL.md`
Expected: Word count `< 500` words (`< 700` tokens), single-line quoted `description` under 250 characters.

---

### Task 3: Cross-Agent `/update-readme` Adapters, Legacy Cleanup & Skill Registry

**Files:**
- Create: `.claude/commands/update-readme.md`
- Create: `.opencode/commands/update-readme.md`
- Delete: `Agents/readme-generator.md`
- Modify: `.atl/skill-registry.md` (via `gentle-ai skill-registry refresh --force`)

**Interfaces:**
- Consumes: `.agents/skills/update-readme/SKILL.md`
- Produces: `/update-readme` command entrypoints for Claude Code and OpenCode, updated `.atl/skill-registry.md`

- [x] **Step 1: Create `.claude/commands/update-readme.md` and `.opencode/commands/update-readme.md`**

Both files load `.agents/skills/update-readme/SKILL.md` as the single source of truth and pass `$ARGUMENTS` (if any) as scope instructions.

- [x] **Step 2: Remove legacy `Agents/readme-generator.md` and empty `Agents/` directory**

Run: `rm -f Agents/readme-generator.md && rmdir Agents`
Expected: `Agents/` directory removed cleanly.

- [x] **Step 3: Refresh skill registry and verify `update-readme` is indexed**

Run: `gentle-ai skill-registry refresh --force --cwd /run/media/pumba/Proyects/Proyects/Desktop/llmtuner && grep "update-readme" .atl/skill-registry.md`
Expected: `update-readme` row present with scope `project` and path `/run/media/pumba/Proyects/Proyects/Desktop/llmtuner/.agents/skills/update-readme/SKILL.md`.

- [x] **Step 4: Verify compliance with a fresh `research` subagent loading `.agents/skills/update-readme/SKILL.md`**

Dispatch a fresh `research` subagent instructed to read `.agents/skills/update-readme/SKILL.md` and audit this repo's `README.md` vs `README.es.md` and `package.json`.
Expected: Subagent follows the 5-phase protocol, classifies `README.md` as `Overwritten/Foreign`, selects the `CLI / Desktop Application` archetype, identifies `README.es.md` for bilingual sync, and cites only real commands from `package.json` and `src/cli/router.js`.
