# LLM Tuner

Node.js app (Windows/macOS/Linux) that loads a local LLM in LM Studio or Ollama with the fastest configuration for a given context. It detects the hardware, reads the GGUF, estimates the memory, measures the best options and saves the winner as a preset to avoid measuring again. It has three interfaces over the same core: CLI, web and Electron.

**Read `docs/PROYECTO.md` before changing anything.** It contains the idea, the agreed user flow, the architecture, the calibrated formulas, the LM Studio and Ollama internal details, the real measurements and the pending items.

## Project rules

- No LLM decides the configuration: everything is deterministic (hardware + metadata + formulas + real measurements).
- User flow: engine → model → context → **Load**. If there's a preset, apply and load; if not, measure, save the preset, apply and load. It only measures again if the context, the hardware or the model file changes.
- Code, identifiers and base strings are in English. Every user-facing string goes through `src/i18n` and must exist in both `en` and `es`. `src/core` emits codes, never translated text.
- Never write LM Studio's `hardware-config.json` with the app open. The per-model config can be written with the app open.
- Always save a backup before modifying the engines' config files.
- `src/core` doesn't depend on any interface; the CLI, the web and Electron only consume `Tuner` and its events.

## Commands

```bash
npm start        # CLI
npm run web      # http://127.0.0.1:7860
npm run desktop  # Electron
npm test         # unit tests (include real measurements as regression)
```
