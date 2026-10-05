# LLM Tuner

**English** · [Español](README.es.md)

Load a local LLM with the best configuration for the context you need, on LM Studio or Ollama, on Windows, macOS and Linux. You choose what "best" means with a load profile: speed, a balance, or answer quality.

No LLM decides the configuration. The app reads your hardware and the model's metadata, estimates what fits in VRAM, actually measures the best options and saves the winner as a **preset**. The next time you load that model with that context and profile, the preset is used directly, without measuring again.

## Flow

1. **Engine**: you choose LM Studio or Ollama. If it isn't installed, the app installs it with the official method (winget, Homebrew or the install script).
2. **Model and context**: you choose one of your models and enter the context you want.
3. **Profile**: you choose what to optimize for: `speed`, `balanced` or `quality`. The app marks one as recommended.
4. **Load**:
   - If there's a preset for that model, context, profile and hardware, it's applied and the model is loaded (about 20 s).
   - If there isn't one, 3 configurations are tried (2–3 min), the best one is saved as a preset, applied and loaded.

It only measures again when you change the context or the profile, the hardware changes (GPU, VRAM, CPU or PCIe link) or the model file changes. With `speed` and `quality` it also measures again when you download or remove a variant of the model. You can also force it with "Measure again even if a preset exists" or with `--force`.

## Load profiles

More tokens per second does not mean better answers. The profile decides how much answer quality may be traded for speed or memory.

| Profile | What it optimizes | What it costs |
|---|---|---|
| `speed` | Tokens per second. It uses the lightest variant of the model you have downloaded and any KV cache type. | Answer quality: the most compressed weights and cache are allowed. |
| `balanced` | Speed weighted by the quality of the KV cache, with the variant you selected. It is the default. | A middle ground: neither the fastest nor the most precise. |
| `quality` | The least loss that still runs fully on GPU: the heaviest downloaded variant that fits, with a precise KV cache (`f16` or `q8_0`). | Speed. If nothing fits fully on GPU, it says so and picks the winner like `balanced`. |

Optimizations that lose nothing (layer split across GPUs, GPU order, threads) are applied in every profile.

Before you load, the app also tells you:

- **Which profile is recommended**: the highest-quality one that still runs fully on your GPUs.
- **Whether a heavier variant would fit**: for example, that Q8_0 is not downloaded and would fit fully on your GPUs. The size is an estimate, and the app never downloads anything.
- **Whether the preview is conservative**: it is computed with the VRAM that is free at that moment, so the app warns you when VRAM is in use. Loading unloads the engine's models first and then makes the real choice.

The engines differ in one thing. **Ollama** lets the app pick the variant (tag) for the profile and load it, among the tags it can tell are the same model. **LM Studio** cannot load a specific variant on request, so there the profile applies to the variant selected in LM Studio, and the app tells you which one to select when another suits the profile better.

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
node src/cli/index.js --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --profile quality --yes
node src/cli/index.js --presets          # lists the saved presets
node src/cli/index.js --help
node src/cli/index.js --lang <en|es>     # UI language; saved for next time
```

`--profile <speed|balanced|quality>` sets the load profile for that run. The wizard asks for it and remembers your choice. Without the flag, a run with `--yes`, with `--json`, or with engine, model and context all given uses `balanced`.

The web and desktop app have an EN/ES selector in the side rail, and the choice is saved in `llm-tuner/settings.json`, next to the presets. The profile you choose in the wizard or in the app is saved there too.

## What gets tried

For each KV cache type the profile allows (`f16`, `q8_0`, `q4_0`; `quality` leaves out `q4_0`) the estimator computes:

- **Memory per layer**, read from the GGUF (the real size of each tensor).
- **Context cache** based on layers with attention, KV heads, dimension and sliding window (SWA).
- **Layer split across GPUs**, prioritizing the GPU with the widest PCIe link and no monitor attached, with free headroom balanced evenly across cards.
- **For MoE models that don't fit**, how many expert layers can stay in RAM (`--n-cpu-moe`).
- **Expected speed**, based on memory bandwidth.

The best options are measured with a short prompt and another that fills ~50% of the context. The profile decides the winner: in `balanced`, the fastest one with a full context, weighted by the quality of the KV type.

- **LM Studio**: it runs the same `llama-server` that LM Studio uses, with the exact same parameters. The result is written to the model's config (`~/.lmstudio/.internal/user-concrete-model-default-config/…`) and to `hardware-config.json`. LM Studio only restarts if the hardware config changes.
- **Ollama**: each option is measured on a private `ollama serve` on another port, because the KV type and Flash Attention are global. The model `<model>-tuned-16k` is created with `num_ctx`, `num_gpu` and `num_thread`, and the server variables are configured (systemd on Linux, `setx` on Windows, `launchctl` on macOS).

A `*.bak-llm-tuner-*` copy is saved before modifying any file.

## Where presets are stored

There is one preset per engine, model, context and profile.

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

Load profiles are covered by unit tests. The `speed` and `quality` profiles have not been measured on real hardware yet.

## Tests

```bash
npm test
```

Includes as regression the real results of 2× RTX 5070 with Qwen2.5-Coder-32B: 16K and 20K with q8_0 fit entirely, 24K doesn't; 32K only fits with q4_0.

## Notes

- With npm 11 and Node 26, installing Electron can end up without extracting the binary (only `locales` is left in `node_modules/electron/dist`). If so, extract `~/.cache/electron/*/electron-*.zip` into `node_modules/electron/dist` and create `node_modules/electron/path.txt` with the text `electron`. `npm run desktop` disables the Chromium sandbox only when it can't work (no `chrome-sandbox` with root setuid).
- LM Studio's internal files are not a public API. This version is verified with LM Studio 0.4.25.
