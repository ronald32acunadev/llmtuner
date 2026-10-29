# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

# LLM Tuner

Node.js app (Windows/macOS/Linux) that loads a local LLM in LM Studio or Ollama with the fastest configuration for a given context. It detects the hardware, reads the GGUF, estimates the memory, measures the best options and saves the winner as a preset to avoid measuring again. It has two interfaces over the same core: the CLI and the desktop app (Electron), which shows the web UI in a native window. The same web server can also run as a token-protected daemon on a remote GPU host.

Design specs live in `docs/superpowers/specs/`; feature backlogs in `docs/userstories/<feature>/README.md`.

## Project rules

- No LLM decides the configuration: everything is deterministic (hardware + metadata + formulas + real measurements).
- User flow: engine → model → context → profile (`speed` | `balanced` | `quality`, default `balanced`) → **Load**. If there's a preset, apply and load; if not, measure, save the preset, apply and load. It only measures again if the context, the profile, the hardware or the model file changes (for `speed`/`quality`, also when the set of downloaded variants changes).
- A profile only governs the lossy choices (weight quantization variant and KV cache type). Lossless ones (layer split, GPU order, threads) apply to every profile. The app never downloads a model variant.
- Code, identifiers and base strings are in English. Every user-facing string goes through `src/i18n` and must exist in both `en` and `es`. `src/core` emits codes (`code`, `reasonCode`, `labelCode`, `errorCode`, `noteCode`, `TunerError(code, params)`), never translated text.
- Never write LM Studio's `hardware-config.json` with the app open. The per-model config can be written with the app open.
- Always save a backup (`*.bak-llm-tuner-*`) before modifying the engines' config files.
- `src/core` doesn't depend on any interface; the CLI and the web UI only consume `Tuner` and its events (locally or through the HTTP API).
- LM Studio's internal files are not a public API; the integration is verified against LM Studio 0.4.25.

## Commands

Node ≥ 22, ESM (`"type": "module"`). No build step, no linter, no framework on the web UI (vanilla JS).

```bash
npm start                    # CLI wizard (src/cli/index.js)
npm run desktop              # Electron (electron/launch.js → main.js)
npm test                     # node --test test/*.test.js

node --test test/core.test.js                             # one test file
node --test --test-name-pattern="<regex>" test/*.test.js  # one test by name

node src/cli/index.js --engine lmstudio --model <key> --ctx 16384 --yes   # non-interactive
# other flags: --profile <speed|balanced|quality>, --force, --dry-run, --candidates N, --json, --presets, --lang <en|es>, --server <id|name>
node src/cli/index.js serve [--host 0.0.0.0] [--port 7860] [--token <t>]  # daemon mode
```

Distribution is npm only (`llm-tuner`, commands `llm-tuner` and `llm-tuner-desktop`). A push to the `release` branch publishes (`.github/workflows/release.yml`). CI (`.github/workflows/ci.yml`) runs `npm ci && npm test` on Node 22 for pushes and PRs to `main`.

`.agents/skills/evaluate-profiles/` is a benchmark harness that checks the load profiles against real models on installed engines; it needs real hardware and is not part of `npm test`.

## Architecture

- `src/core/tuner.js` is the orchestrator. `Tuner.load(key, ctx, { profile })` is the "Load" button: `findPreset` → hit: `apply` + `load`; miss: `run()` (unload models, re-detect free VRAM, `planCandidates`, benchmark the top N, `pickBest(results, profile)`) → `savePreset` → `apply` → `load`. `speed` and `quality` wrap that flow with variant steps: list the downloaded variants, free VRAM first, then `pickVariant`. `Tuner.profilePlan(key, ctx)` is the no-measure, no-unload preview shown before Load. Progress is emitted as `progress` events with a `type` (`status`, `plan`, `candidate-start`, `bench-progress`, `candidate-done`, `preset-hit`, `preset-saved`, `applied`, `loaded`, `done`, plus `variant-picked` and `profile-fallback` for profiles).
- `src/core/profiles.js` holds every profile rule: allowed KV types, `pickVariant`, the recommended profile, and `pickBest` (`balanced` = deep-context gen t/s × KV-type quality; `speed` = raw t/s; `quality` = full GPU offload with `f16`/`q8_0`, falling back to the `balanced` rule with a `profile-fallback` event).
- Engines (`src/core/engines/lmstudio.js`, `ollama.js`) share one interface: `id, name, capabilities, detect, listModels, modelMeta, prepare, benchmark, apply, load, chat`, all taking `ctx = { detection, hw }`. Registered in `ENGINES` in `tuner.js`. `capabilities.kvTypes` / `cpuMoe` restrict what the estimator plans; `capabilities.variantSelect` says whether the app can load a specific variant (Ollama: yes, by tag; LM Studio: no, so the pick is only reported as `recommendSwitch`).
  - LM Studio: benchmarks by launching LM Studio's own `llama-server` (`llama-server.js`) with identical params, then writes the per-model config and `hardware-config.json`.
  - Ollama: KV type and Flash Attention are server-wide, so each candidate is measured on a private `ollama serve` on another port; applying creates a `<model>-tuned-<ctx>` Modelfile and sets server env vars (systemd / `setx` / `launchctl`, see `ollama-service.js` and `src/platform/ollama-authorize.js`).
- Estimation pipeline: `hardware.js` (GPU order: PCIe bandwidth → no monitor → free VRAM) → `gguf.js` (own parser, per-tensor sizes) → `estimator.js` (per-layer memory, KV cache incl. SWA, multi-GPU split, `--n-cpu-moe` for MoE, t/s prediction). Formulas are calibrated against real measurements that `test/core.test.js` encodes as regression — don't change estimator math without updating those tests.
- Presets (`presets.js`) are keyed by engine + model + ctx + profile and validated against a hardware fingerprint and the model file size; non-`balanced` presets also store the variant list and are invalidated when it changes. A preset without a `profile` field is a `balanced` preset. They live in `configDir()` (`util.js`) next to `settings.json` (`settings.js`: UI language, theme, last profile, `servers`, `activeServerId`).
- `installer.js` returns the official install plans per engine and OS; every plan is shown to the user before running, nothing is installed silently.
- `src/web/server.js`: plain `http` with a route table (`'METHOD /path': handler`), long jobs streamed via SSE at `/api/jobs/:id/events`. Electron's `main.js` just starts this server on a random port and opens a `BrowserWindow`.
- Remote servers (daemon-first): `serve` (`src/cli/commands/serve.js`) starts the same server in server mode and persists `{ host, port, token }` to `configDir()/server.json`. In server mode or for non-loopback clients, every request needs `Authorization: Bearer <token>` (timing-safe compare), `/api/state` hardware data is sanitized, and privileged routes like `POST /api/install` return 403 remotely. Clients talk to it through `TunerApiClient` (`src/core/client.js`, `fromSettings` picks the active entry of `settings.servers`), which also consumes the SSE job stream. Presets stay on the server side.
- `src/core/mcp/`: registers the loaded engine as an MCP server in coding agents' config files (`registry.js` lists `SUPPORTED_AGENTS` with their config path and format; `buildMcpPayload` builds the `npx` server entry per engine; `adapters/` upsert into JSON or TOML configs). Exposed through the CLI `mcp` command and the web UI.
- `updater.js` checks the npm registry for a newer `llm-tuner` (cached 24 h in `configDir()`); `telemetry.js` samples local RAM/CPU/GPU usage for live display only (nothing leaves the machine).
- CLI: `src/cli/index.js` parses flags, `router.js` + `nav.js` drive the interactive menus, and `commands/` holds one module per menu entry (`load`, `presets`, `mcp`, `settings`, `serve`, `help`).
- i18n: `src/i18n/{en,es}.js` catalogs + `t(locale, key, params)`; `src/i18n/core.js` maps core codes to keys. `test/i18n.test.js` fails if `en`/`es` keys or params diverge or if `src/` references a missing key.

## Testing notes

- Tests that touch config set `LLM_TUNER_CONFIG_DIR` to a temp dir before importing — do the same so tests never write to the real `~/.config/llm-tuner`.
- Engine HTTP calls are mocked by pointing `OLLAMA_HOST` / `LM_STUDIO_HOST` at a local mock server (see `test/server.test.js`).

## Gotchas

- Electron 44 has no install script: `npm install` leaves `node_modules/electron/dist` without the binary, and the first `npm run desktop` or `llm-tuner-desktop` downloads it. If that download fails: extract `~/.cache/electron/*/electron-*.zip` into `node_modules/electron/dist` and create `node_modules/electron/path.txt` containing `electron`.
- `electron/launch.js` disables the Chromium sandbox only when `chrome-sandbox` lacks root setuid.

## Rule files and the sync invariant

- `AGENTS.md` is canonical and agent-neutral (Antigravity, Claude Code, Codex, Cursor, OpenCode). Claude-specific guidance belongs here.
- `.agents/rules/AGENTS.md` is a byte-identical copy; any rule change touches both in the same commit. Verify with `git diff --no-index AGENTS.md .agents/rules/AGENTS.md` (no output = in sync).
- Do not hardcode model names in the rules: the dynamic model policy is deliberate.

## Code delegation in Claude Code

The delegation rule in `AGENTS.md` covers source code, tests, and scripts; docs, config, and commit messages are written by the agent. In Claude Code the tools are `mcp__pumbastudio__openai_chat` (primary) and `mcp__pumbalama__chat_completion` (secondary); `scripts/ask_local_llm.py` is the fallback when the MCP call times out. Reusable review corrections go to `.agents/local-llm-prompt-rules.md`.
