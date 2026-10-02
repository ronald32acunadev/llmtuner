# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# LLM Tuner

Node.js app (Windows/macOS/Linux) that loads a local LLM in LM Studio or Ollama with the fastest configuration for a given context. It detects the hardware, reads the GGUF, estimates the memory, measures the best options and saves the winner as a preset to avoid measuring again. It has three interfaces over the same core: CLI, web and Electron.

**Read `docs/PROYECTO.md` before changing anything.** It contains the idea, the agreed user flow, the architecture, the calibrated formulas, the LM Studio and Ollama internal details, the real measurements, known issues and the pending items.

## Project rules

- No LLM decides the configuration: everything is deterministic (hardware + metadata + formulas + real measurements).
- User flow: engine → model → context → **Load**. If there's a preset, apply and load; if not, measure, save the preset, apply and load. It only measures again if the context, the hardware or the model file changes.
- All code, comments, documentation (`docs/`, `odd/`, READMEs) and commit messages are written in English. Translations are the only exception: the `es` i18n catalog, tests that assert its strings, and translated user docs such as `README.es.md`.
- Code, identifiers and base strings are in English. Every user-facing string goes through `src/i18n` and must exist in both `en` and `es`. `src/core` emits codes (`code`, `reasonCode`, `labelCode`, `errorCode`, `noteCode`, `TunerError(code, params)`), never translated text.
- Never write LM Studio's `hardware-config.json` with the app open. The per-model config can be written with the app open.
- Always save a backup (`*.bak-llm-tuner-*`) before modifying the engines' config files.
- `src/core` doesn't depend on any interface; the CLI, the web and Electron only consume `Tuner` and its events.
- LM Studio's internal files are not a public API; the integration is verified against LM Studio 0.4.25.

## Commands

Node ≥ 22, ESM (`"type": "module"`). No build step, no linter, no framework on the web UI (vanilla JS).

```bash
npm start                    # CLI wizard (src/cli/index.js)
npm run web                  # http://127.0.0.1:7860 (PORT env overrides)
npm run desktop              # Electron (electron/launch.js → main.js)
npm run dist / dist:win      # electron-builder (AppImage / Windows portable / dmg)
npm test                     # node --test test/*.test.js

node --test test/core.test.js                          # one test file
node --test --test-name-pattern="<regex>" test/*.test.js  # one test by name

node src/cli/index.js --engine lmstudio --model <key> --ctx 16384 --yes   # non-interactive
# other flags: --force, --dry-run, --candidates N, --json, --presets, --web, --lang <en|es>
```

## Architecture

- `src/core/tuner.js` is the orchestrator. `Tuner.load(key, ctx)` is the "Load" button: `findPreset` → hit: `apply` + `load`; miss: `run()` (unload models, re-detect free VRAM, `planCandidates`, benchmark the top N, `pickBest` = deep-context gen t/s × KV-type quality) → `savePreset` → `apply` → `load`. Progress is emitted as `progress` events with a `type` (`status`, `plan`, `candidate-start`, `bench-progress`, `candidate-done`, `preset-hit`, `preset-saved`, `applied`, `loaded`, `done`).
- Engines (`src/core/engines/lmstudio.js`, `ollama.js`) share one interface: `id, name, capabilities, detect, listModels, modelMeta, prepare, benchmark, apply, load, chat`, all taking `ctx = { detection, hw }`. Registered in `ENGINES` in `tuner.js`. `capabilities.kvTypes` / `cpuMoe` restrict what the estimator plans.
  - LM Studio: benchmarks by launching LM Studio's own `llama-server` (`llama-server.js`) with identical params, then writes the per-model config and `hardware-config.json`.
  - Ollama: KV type and Flash Attention are server-wide, so each candidate is measured on a private `ollama serve` on another port; applying creates a `<model>-tuned-<ctx>` Modelfile and sets server env vars (systemd / `setx` / `launchctl`).
- Estimation pipeline: `hardware.js` (GPU order: PCIe bandwidth → no monitor → free VRAM) → `gguf.js` (own parser, per-tensor sizes) → `estimator.js` (per-layer memory, KV cache incl. SWA, multi-GPU split, `--n-cpu-moe` for MoE, t/s prediction). Formulas are calibrated against real measurements in `docs/PROYECTO.md` §8, which `test/core.test.js` encodes as regression — don't change estimator math without updating both.
- Presets (`presets.js`) are keyed by engine + model + ctx and validated against a hardware fingerprint and the model file size. They live in `configDir()` (`util.js`) next to `settings.json` (UI language).
- `src/web/server.js`: plain `http` with a route table (`'METHOD /path': handler`), long jobs streamed via SSE at `/api/jobs/:id/events`. Electron's `main.js` just starts this server on a random port and opens a `BrowserWindow`.
- i18n: `src/i18n/{en,es}.js` catalogs + `t(locale, key, params)`; `src/i18n/core.js` maps core codes to keys. `test/i18n.test.js` fails if `en`/`es` keys or params diverge or if `src/` references a missing key.

## Testing notes

- Tests that touch config set `LLM_TUNER_CONFIG_DIR` to a temp dir before importing — do the same so tests never write to the real `~/.config/llm-tuner`.
- Engine HTTP calls are mocked by pointing `OLLAMA_HOST` / `LM_STUDIO_HOST` at a local mock server (see `test/server.test.js`).

## Gotchas

- With npm 11 + Node 26, Electron may install without its binary (only `locales` in `node_modules/electron/dist`). Fix: extract `~/.cache/electron/*/electron-*.zip` into `node_modules/electron/dist` and create `node_modules/electron/path.txt` containing `electron`.
- `electron/launch.js` disables the Chromium sandbox only when `chrome-sandbox` lacks root setuid.
