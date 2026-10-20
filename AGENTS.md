# AGENTS.md

Instructions for every AI coding agent working in this repository (Antigravity, Claude Code, Codex, Cursor, OpenCode, and any other). Read this file at the start of every new session.

**Read `docs/PROYECTO.md` before changing behavior.** It is the canonical spec: the agreed user flow, the architecture, the calibrated formulas, the LM Studio/Ollama internals, real measurements, known issues and pending work. `CLAUDE.md` carries the long-form architecture notes; when the two disagree, trust the executable code and `docs/PROYECTO.md`.

## Commands

Node ≥ 22, ESM (`"type": "module"`). No build step, no linter, no formatter, no framework on the web UI (vanilla JS).

```bash
npm start                    # CLI wizard (src/cli/index.js)
npm run desktop              # Electron (electron/launch.js → src/web/server.js)
npm test                     # node --test test/*.test.js (224 tests, ~7 s)

node --test test/core.test.js                          # one test file
node --test --test-name-pattern="<regex>" test/*.test.js  # one test by name

node src/cli/index.js --engine lmstudio --model <key> --ctx 16384 --yes   # non-interactive
# other flags: --profile <speed|balanced|quality>, --force, --dry-run, --candidates N, --json, --presets, --lang <en|es>
```

There is no `lint` / `typecheck` script: `npm test` is the whole gate.

## Language and Documentation Rule (MANDATORY)

- **English by default**: all source code, identifiers, comments, documentation (`docs/`, `odd/`, READMEs) and commit messages are written in English. Translations are the only exception: the `es` i18n catalog, tests asserting its strings, and translated user docs such as `README.es.md`.
- Every user-facing string goes through `src/i18n` and must exist in **both** `en` and `es`. `src/core` never emits translated text: it emits codes (`code`, `reasonCode`, `labelCode`, `errorCode`, `noteCode`, `TunerError(code, params)`), and `src/i18n/core.js` maps them to keys. `test/i18n.test.js` fails on any `en`/`es` divergence or missing key.

## Code Authorship & Delegation Rule

**New or modified source code (including tests and scripts) is synthesized by a local LLM provider first. The agent writes the code itself only when both local providers are unreachable or fail, and says so briefly.** The agent is the orchestrator: it explores, prepares a self-contained prompt (task, target paths, the relevant existing code verbatim, expected output format), reviews the answer, applies it, and runs the tests. Exploration, docs, configuration files, commit messages and purely mechanical edits (renames, import fixes, formatting) stay with the agent. Never ask a local model to explore: it has no filesystem or repository access.

**Dynamic model policy**: do not hardcode model names. Use whichever model is currently loaded in memory.

1. **`pumbastudio`** (LM Studio, port `1234`, tool `openai_chat`) — primary.
2. **`pumbalama`** (Ollama, port `11434`) — when `pumbastudio` is unreachable or fails; target the model active in Ollama.
3. **Host model** (the model running this session) — when both fail; continue without blocking.

Local models have a fixed knowledge cutoff and no internet access, so **the agent resolves current APIs** (Context7, official docs, `node_modules`) and passes exact library names and versions, exact function signatures, option names and import paths, plus any deprecated API the code must not use.

MCP registration each agent needs:

```json
{
  "mcpServers": {
    "pumbastudio": {
      "command": "npx",
      "args": ["-y", "@mzxrai/mcp-openai@latest"],
      "env": { "OPENAI_BASE_URL": "http://127.0.0.1:1234/v1", "OPENAI_API_KEY": "sk-lm-local" }
    },
    "pumbalama": {
      "command": "npx",
      "args": ["-y", "ollama-mcp-server@latest"],
      "env": { "OLLAMA_HOST": "http://127.0.0.1:11434" }
    }
  }
}
```

## Project rules that are easy to break

- No LLM decides the configuration: everything is deterministic (hardware + GGUF metadata + calibrated formulas + real measurements).
- User flow: engine → model → context → profile (`speed` | `balanced` | `quality`, default `balanced`) → Load. A preset hit applies and loads; a miss measures, saves the preset, applies and loads. A profile only governs the lossy choices (weight quantization variant, KV cache type); layer split, GPU order and threads are profile-independent. The app never downloads a model variant.
- **Never write LM Studio's `hardware-config.json` while the app is open** (the per-model config is fine). Always save a `*.bak-llm-tuner-*` backup before modifying an engine's config file.
- `src/core` must not depend on any interface: the CLI and the web UI only consume `Tuner` and its events. New core output is a code plus an i18n key, never a literal string.
- LM Studio's internal files are not a public API; the integration is verified against LM Studio 0.4.25.
- Estimator math is calibrated in `docs/PROYECTO.md` §8 and encoded as regression in `test/core.test.js`: change both together, never one alone.

## Architecture (where things really live)

- Entrypoints: CLI `src/cli/index.js` (flags) → `router.js`/`nav.js` menus → `commands/`; desktop `electron/launch.js` → `electron/main.js` starts `src/web/server.js` (plain `http`, route table `'METHOD /path': handler`, long jobs streamed by SSE at `/api/jobs/:id/events`).
- `src/core/tuner.js` is the orchestrator (`Tuner.load`, `Tuner.profilePlan`, `progress` events). Engines share one interface — `src/core/engines/lmstudio.js` and `ollama.js`: `id, name, capabilities, detect, listModels, modelMeta, prepare, benchmark, apply, load, chat`, all taking `ctx = { detection, hw }`, registered in `ENGINES` in `tuner.js`.
- Pipeline: `hardware.js` → `gguf.js` (own parser) → `estimator.js`; profile rules in `profiles.js`; presets in `presets.js` keyed by engine + model + ctx + profile, validated against a hardware fingerprint and stored in `configDir()` (`util.js`) beside `settings.json`.
- `src/core/mcp/` registers the engine as an MCP server in coding agents' config files; `src/i18n/{en,es}.js` + `core.js` own all strings.
- Full flow, formulas and engine internals: `docs/PROYECTO.md` and `CLAUDE.md`.

## Testing notes

- Tests that touch config must set `LLM_TUNER_CONFIG_DIR` to a temp dir **before importing**, so they never write the real `~/.config/llm-tuner`.
- Engine HTTP calls are mocked by pointing `OLLAMA_HOST` / `LM_STUDIO_HOST` at a local mock server (see `test/server.test.js`).
- `.agents/skills/evaluate-profiles/` is a benchmark harness needing real hardware and installed engines; it is **not** part of `npm test`.

## Distribution and CI

- npm only (`llm-tuner`; bins `llm-tuner`, `llm-tuner-desktop`). Published files are `src/`, `electron/`, `README.es.md` — `test/`, `docs/`, `AGENTS.md` and `CLAUDE.md` are excluded (asserted by `test/package.test.js`).
- CI (`.github/workflows/ci.yml`) runs `npm ci && npm test` on Node 22 for pushes and PRs to `main`.
- `.github/workflows/release.yml` publishes on a push to `release`, **except** the push that creates the branch: releases arrive through a pull request into `release`. Bump `package.json` version first — the workflow fails if that version is already on npm.

## Gotchas

- Electron 44 has no install script: `npm install` leaves `node_modules/electron/dist` without the binary, and the first `npm run desktop` downloads it. If that download fails, extract `~/.cache/electron/*/electron-*.zip` into `node_modules/electron/dist` and create `node_modules/electron/path.txt` containing `electron`.
- `electron/launch.js` disables the Chromium sandbox only when `chrome-sandbox` lacks root setuid.
- When delegating subagents, `.atl/skill-registry.md` is the index of available skills (project skill: `.agents/skills/evaluate-profiles/SKILL.md`).
