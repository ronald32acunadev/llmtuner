# LLM Tuner

**English** · [Español](README.es.md)

Load a local LLM with the fastest configuration for the context you need, on LM Studio or Ollama, on Windows, macOS and Linux.

No LLM decides the configuration. The app reads your hardware and the model's metadata, estimates what fits in VRAM, actually measures the best options and saves the winner as a **preset**. The next time you load that model with that context, the preset is used directly, without measuring again.

## Flow

1. **Engine**: you choose LM Studio or Ollama. If it isn't installed, the app installs it with the official method (winget, Homebrew or the install script).
2. **Model and context**: you choose one of your models and enter the context you want.
3. **Load**:
   - If there's a preset for that model, context and hardware, it's applied and the model is loaded (about 20 s).
   - If there isn't one, 3 configurations are tried (2–3 min), the best one is saved as a preset, applied and loaded.

It only measures again when you change the context, the hardware changes (GPU, VRAM, CPU or PCIe link) or the model file changes. You can also force it with "Re-measure" or with `--force`.

## Usage

```bash
npm install
npm start               # terminal wizard
npm run web             # web interface at http://127.0.0.1:7860
npm run desktop         # desktop app (Electron)
```

Non-interactive mode:

```bash
node src/cli/index.js --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --yes
node src/cli/index.js --presets          # lists the saved presets
node src/cli/index.js --help
node src/cli/index.js --lang <en|es>     # UI language; saved for next time
```

The web and desktop app have an EN/ES selector in the side rail, and the choice is saved in `llm-tuner/settings.json`, next to the presets.

## What gets tried

For each KV cache type (`f16`, `q8_0`, `q4_0`) the estimator computes:

- **Memory per layer**, read from the GGUF (the real size of each tensor).
- **Context cache** based on layers with attention, KV heads, dimension and sliding window (SWA).
- **Layer split across GPUs**, prioritizing the GPU with the widest PCIe link and no monitor attached, with free headroom balanced evenly across cards.
- **For MoE models that don't fit**, how many expert layers can stay in RAM (`--n-cpu-moe`).
- **Expected speed**, based on memory bandwidth.

The best options are measured with a short prompt and another that fills ~50% of the context. The fastest one with a full context wins, weighted by the quality of the KV type.

- **LM Studio**: it runs the same `llama-server` that LM Studio uses, with the exact same parameters. The result is written to the model's config (`~/.lmstudio/.internal/user-concrete-model-default-config/…`) and to `hardware-config.json`. LM Studio only restarts if the hardware config changes.
- **Ollama**: each option is measured on a private `ollama serve` on another port, because the KV type and Flash Attention are global. The model `<model>-tuned-16k` is created with `num_ctx`, `num_gpu` and `num_thread`, and the server variables are configured (systemd on Linux, `setx` on Windows, `launchctl` on macOS).

A `*.bak-llm-tuner-*` copy is saved before modifying any file.

## Where presets are stored

- Linux: `~/.config/llm-tuner/presets/`
- macOS: `~/Library/Application Support/llm-tuner/presets/`
- Windows: `%APPDATA%\llm-tuner\presets\`

## Platform status

| | Tested | Notes |
|---|---|---|
| Linux + NVIDIA + LM Studio | ✅ 2× RTX 5070, Ryzen 7 5800X | Calibrated with real measurements |
| Linux + Ollama | Unit tests | Still needs testing with Ollama installed |
| Windows / macOS | Untested | Paths, installers and detection implemented |
| AMD (ROCm) / Apple Silicon / Intel | Untested | VRAM detection included; bandwidth from table |

## Tests

```bash
npm test
```

Includes as regression the real results of 2× RTX 5070 with Qwen2.5-Coder-32B: 16K and 20K with q8_0 fit entirely, 24K doesn't; 32K only fits with q4_0.

## Notes

- With npm 11 and Node 26, installing Electron can end up without extracting the binary (only `locales` is left in `node_modules/electron/dist`). If so, extract `~/.cache/electron/*/electron-*.zip` into `node_modules/electron/dist` and create `node_modules/electron/path.txt` with the text `electron`. `npm run desktop` disables the Chromium sandbox only when it can't work (no `chrome-sandbox` with root setuid).
- LM Studio's internal files are not a public API. This version is verified with LM Studio 0.4.25.
