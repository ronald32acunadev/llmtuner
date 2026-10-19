# CLI Slash Commands & Command Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modularize the `llm-tuner` CLI by implementing a Command Router supporting Claude-style slash commands (`/load`, `/mcp`, `/presets`, `/settings`, `/help`, `/exit`), an interactive selector menu on bare invocation, direct slash command routing, and complete backward compatibility for existing flags.

**Architecture:**
- `src/cli/router.js`: Inspects `process.argv`, determines route (direct flags, slash command, or interactive menu), and dispatches to appropriate handlers.
- `src/cli/commands/`: Individual, testable command handlers (`load.js`, `mcp.js`, `presets.js`, `settings.js`, `help.js`).
- `src/cli/index.js`: Clean entry point delegating to `router.js`.
- `src/i18n/`: Localized labels and descriptions for all commands in English and Spanish.

**Tech Stack:** Node.js (>=22), `@inquirer/prompts` (`select`, `checkbox`, `input`, `confirm`), native `node:test`.

---

## Proposed Changes

### Internationalization
#### [src/i18n/en.js](file:///run/media/pumba/Proyects/Proyects/llmtuner/src/i18n/en.js) and [src/i18n/es.js](file:///run/media/pumba/Proyects/Proyects/llmtuner/src/i18n/es.js)
- Add translation strings for slash command descriptions and the `/mcp` CLI interactive prompts.

### CLI Modular Architecture
#### [src/cli/router.js](file:///run/media/pumba/Proyects/Proyects/llmtuner/src/cli/router.js)
- Implement `parseCliArgs(argv)`: recognizes flags, slash commands, and bare invocations.
- Implement `routeCli(argv, env)`: dispatches to command handlers or displays top-level interactive menu.

#### [src/cli/commands/load.js](file:///run/media/pumba/Proyects/Proyects/llmtuner/src/cli/commands/load.js)
- Extract existing `main()` and `installFlow()` from `src/cli/index.js` into a dedicated `/load` module.

#### [src/cli/commands/mcp.js](file:///run/media/pumba/Proyects/Proyects/llmtuner/src/cli/commands/mcp.js)
- Implement interactive CLI wizard for `mcpManager`: select engine, multi-select agents, confirm server name, run installation, and format summary.

#### [src/cli/commands/presets.js](file:///run/media/pumba/Proyects/Proyects/llmtuner/src/cli/commands/presets.js)
- Extract preset listing and inspection logic.

#### [src/cli/commands/settings.js](file:///run/media/pumba/Proyects/Proyects/llmtuner/src/cli/commands/settings.js)
- Extract `settingsFlow()` language/theme selector.

#### [src/cli/commands/help.js](file:///run/media/pumba/Proyects/Proyects/llmtuner/src/cli/commands/help.js)
- Output updated CLI help explaining slash commands and options.

#### [src/cli/index.js](file:///run/media/pumba/Proyects/Proyects/llmtuner/src/cli/index.js)
- Simplify into top-level runner executing `routeCli(process.argv.slice(2))`.

---

## Tasks

- [ ] **Task 1: Add i18n keys for slash commands and `/mcp` CLI**
  - Add English strings in `src/i18n/en.js`.
  - Add Spanish strings in `src/i18n/es.js`.
  - Verify with `node --test test/i18n.test.js`.

- [ ] **Task 2: Implement CLI Router & Argument Parser with unit tests**
  - Create `test/cli-router.test.js` covering:
    - Slash command identification (`/load`, `/mcp`, `/settings`, `/presets`, `/help`, `/exit`).
    - Flag preservation (`--engine`, `--model`, `--presets`, `--yes`, `--dry-run`, `--json`).
    - Bare invocation detection (interactive vs non-interactive).
  - Implement `src/cli/router.js`.
  - Verify tests pass: `node --test test/cli-router.test.js`.

- [ ] **Task 3: Extract command handlers (`settings.js`, `presets.js`, `help.js`, `load.js`)**
  - Create `src/cli/commands/settings.js`.
  - Create `src/cli/commands/presets.js`.
  - Create `src/cli/commands/help.js`.
  - Create `src/cli/commands/load.js`.
  - Ensure shared helpers (`describe`, `benchErrorText`, `vramStr`, `c`) are cleanly shared.

- [ ] **Task 4: Implement `/mcp` CLI command handler**
  - Create `src/cli/commands/mcp.js`.
  - Wire up `detectEngines()`, `mcpManager.getAgentStatus()`, and `mcpManager.installMcp()`.
  - Create `test/cli-mcp.test.js` to test interactive/headless scenarios.
  - Verify tests pass: `node --test test/cli-mcp.test.js`.

- [ ] **Task 5: Update `src/cli/index.js` and connect router**
  - Refactor `src/cli/index.js` to invoke `routeCli`.
  - Verify manual test: `node src/cli/index.js --help` works.
  - Verify manual test: `node src/cli/index.js /settings` works.
  - Verify manual test: `node src/cli/index.js --presets` works.

- [ ] **Task 6: Update documentation and run full test suite**
  - Update `README.md` and `README.es.md` with the new slash commands documentation.
  - Run full test suite: `npm test`.

---

## Verification Plan

### Automated Tests
- `node --test test/cli-router.test.js`
- `node --test test/cli-mcp.test.js`
- `npm test` (all 208+ tests must pass)

### Manual Verification
1. Run `node src/cli/index.js --help` -> Prints slash commands and options.
2. Run `node src/cli/index.js /presets` -> Lists presets without showing menu.
3. Run `node src/cli/index.js` (bare) -> Displays interactive slash command selector (`/load`, `/mcp`, `/presets`, `/settings`, `/help`, `/exit`).
4. Select `/exit` -> Exits cleanly with status 0.
