# README Archetypes, Ground-Truth Matrix & Verification Checklists

Reference companion for [`.agents/skills/update-readme/SKILL.md`](../SKILL.md).

---

## 1. Ground-Truth Extraction Matrix (By Ecosystem)

Before drafting or editing any section of `README.md`, inspect the repository's actual files in this order:

| Ecosystem | Manifest & Lockfile | Entrypoints & CLI Surface | Config, Env & Docs |
| :--- | :--- | :--- | :--- |
| **Node.js / TypeScript** | `package.json` (`name`, `version`, `description`, `engines`, `bin`, `exports`, `scripts`, `dependencies`), `package-lock.json` / `pnpm-lock.yaml` | Files referenced in `bin` and `main` (e.g., `src/cli/index.js`, `src/cli/router.js`, `electron/launch.js`), argument parsers, help commands (`src/cli/commands/help.js`) | `.env.example`, `README.*.md` (`README.es.md`, etc.), `docs/` |
| **Rust** | `Cargo.toml` (`[package]`, `[[bin]]`, `[lib]`, `[features]`, `[dependencies]`), `Cargo.lock` | `src/main.rs`, `src/lib.rs`, `clap` / CLI structs | `README.*.md`, `examples/`, `docs/` |
| **Python** | `pyproject.toml` (`[project]`, `[project.scripts]`, `requires-python`), `uv.lock` / `poetry.lock` | `__main__.py`, CLI click/argparse/typer definitions | `.env.example`, `README.*.md`, `docs/` |
| **Go** | `go.mod` (`module`, `go` version), `Makefile` / `Taskfile.yml` | `cmd/*/main.go`, flag/cobra definitions | `README.*.md`, `docs/` |
| **Dart / Flutter** | `pubspec.yaml` (`name`, `description`, `environment`, `executables`, `dependencies`) | `bin/*.dart`, `lib/main.dart` | `README.*.md`, `l10n.yaml`, `docs/` |

---

## 2. Project Archetype Section Blueprints

Never dump an 18-section boilerplate template. Pick the blueprint that matches what the repository actually ships:

### A. CLI & Desktop Application (e.g., `llm-tuner`)
1. **Title, Language Switcher & Badges**: `# <Name>`, `[English](README.md) · [Español](README.es.md)` (if multilingual), npm/version/license/runtime badges.
2. **Value Proposition (Lead Paragraph)**: 1–2 paragraphs stating what the tool does, how it works deterministically/architecturally, and what problem it solves.
3. **Table of Contents**: Anchored links to major sections.
4. **Key Features**: Concise bullet points grounded in real modules.
5. **How It Works / Core Concepts**: Step-by-step lifecycle or profiles/modes table.
6. **Installation**: Global install (`npm install -g <pkg>`), `npx <pkg>`, and running from source (`git clone`, `npm install`), plus runtime prerequisites.
7. **Usage**:
   - Interactive CLI wizard (`<bin>` and slash commands like `/load`, `/mcp`, `/presets`, `/settings`, `/help`).
   - Desktop / GUI mode (if present in `bin` or `scripts`).
   - Non-interactive / CI usage with runnable examples.
   - **CLI Options & Flags Reference Table** (`Flag | Description | Default`).
8. **Architecture & Storage Paths**: Directory tree of real folders (`src/`, `electron/`, `test/`), config/preset file paths per OS (Windows, macOS, Linux).
9. **Development & Testing**: Exact test and run commands from the manifest (`npm test`, `npm start`).
10. **Troubleshooting & Platform Notes**: Verified edge cases and platform behavior.
11. **License**: License type and link to `LICENSE`.

### B. Library / SDK / Package
1. **Title & Badges**
2. **Overview & Why Use It**
3. **Installation**
4. **Quick Start** (minimal runnable import + call snippet)
5. **API Reference** (exported functions, classes, types, options table)
6. **Development & Testing**
7. **License**

### C. Web Application / Backend API Service
1. **Title & Overview**
2. **Architecture & Tech Stack**
3. **Prerequisites & Environment Variables** (table of required vs. optional env vars from code/`.env.example`)
4. **Local Development Setup** (install, migrations/seed if any, dev server command)
5. **API Endpoints / Key Workflows**
6. **Testing & Deployment**
7. **Troubleshooting & License**

### D. Bootstrap Template / Agent Rules Repository
1. **Title, Badges & Overview**
2. **Quick Start (Copy / Bootstrap Commands)**
3. **Included Assets, Skills & Directory Structure**
4. **Core Rules & Workflow Standards**
5. **Sync Invariants & Verification**
6. **Troubleshooting & Contributing**

---

## 3. Cognitive Load & Technical Writing Rules

Apply these principles from `cognitive-doc-design`:
- **Lead with the outcome**: Open with what the project does and who it helps in the first 3 lines.
- **Recognition over recall**: Use Markdown tables for CLI flags, profiles, environment variables, and platform support instead of dense paragraphs.
- **Copy-paste ready commands**: Always include language tags (`bash`, `json`, `javascript`) on fenced code blocks and use real binary/script names from the manifest.
- **Zero dead sections**: Omit sections that do not apply (e.g., do not include "Deployment" or "Database" in a local CLI tool).

---

## 4. Rationalization Prevention & Red Flags

| Rationalization / Shortcut Under Pressure | Why It Fails in Production | Mandatory Counter-Action |
| :--- | :--- | :--- |
| *"I'll refactor the existing `README.md` in place to save time."* | The existing `README.md` may belong to a bootstrap template (e.g., `AGENTS.md` template) that overwrote the real project's README. | Compare `README.md` title/subject against `package.json` / `Cargo.toml` / `pyproject.toml`. If they describe different projects, classify `README.md` as **Foreign/Overwritten** and rebuild it from codebase facts and any valid `README.<lang>.md`. |
| *"I only need to read `package.json` to know the CLI usage."* | `package.json` only shows top-level `bin` and `scripts`; it hides subcommands, slash commands (`/load`, `/mcp`), and flags (`--ctx`, `--profile`). | Always read the CLI entrypoint (`bin` target, router, and help command implementation) before writing the Usage section. |
| *"I'll only check `README.md` and ignore `README.es.md`."* | Leaves bilingual repositories out of sync or misses rich, accurate documentation already written in the companion language file. | Always run `ls README*` in Phase 1. Use accurate companion READMEs as a reference and keep all `README*.md` files synchronized. |
| *"I'll include standard commands like `npm run build` or `npm run lint`."* | If `build` or `lint` is not in `package.json#scripts`, new developers hit an immediate error on step 1. | Document **only** scripts and flags proven to exist in the manifest or CLI parser. |
