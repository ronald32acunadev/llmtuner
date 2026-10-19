# LLM Tuner

**English** · [Español](README.es.md)

[![npm version](https://img.shields.io/npm/v/llm-tuner.svg)](https://www.npmjs.com/package/llm-tuner)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

Load a local LLM with the best configuration for the context you need, on LM Studio or Ollama, on Windows, macOS, and Linux. You choose what "best" means through deterministic load profiles: speed, a balanced trade-off, or maximum answer quality.

No LLM decides the configuration. LLM Tuner reads your hardware topology and model GGUF metadata, mathematically calculates what fits into VRAM, benchmarks the top candidate configurations on real hardware, and saves the winner as a persistent **preset**. The next time you load that model with the same context and profile, the preset is applied instantly (in ~20s) without re-measuring.

---

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Load Profiles](#load-profiles)
- [Installation](#installation)
- [Usage](#usage)
  - [Interactive Wizard](#interactive-wizard)
  - [Desktop App](#desktop-app)
  - [Non-Interactive CLI](#non-interactive-cli)
  - [CLI Options Reference](#cli-options-reference)
- [Tuning Pipeline](#tuning-pipeline)
- [Preset Storage](#preset-storage)
- [Platform Support](#platform-support)
- [Project Architecture](#project-architecture)
- [Development & Testing](#development--testing)
- [Notes & Troubleshooting](#notes--troubleshooting)
- [License](#license)

---

## Features

- **Deterministic Optimization**: Uses GGUF tensor-level metadata, PCIe bandwidth measurements, and real token-generation benchmarks—never an AI guessing parameters.
- **Multi-GPU & Topology Aware**: Splits layers intelligently, prioritizing the GPU with the widest PCIe link and no display server attached.
- **Tailored Load Profiles**: Optimize for raw tokens/second (`speed`), quality-weighted speed (`balanced`), or zero-loss GPU retention (`quality`).
- **Engine Support**: First-class support for both LM Studio (direct `llama-server` management) and Ollama (isolated private benchmarks).
- **Persistent Presets**: Measures once per hardware, model, context, and profile. Automatically invalidates presets if hardware or model weights change.
- **Dual Interfaces**: Interactive terminal wizard (`llm-tuner`) and cross-platform desktop UI (`llm-tuner-desktop`).
- **AI Agent MCP Integration**: Connect your local engines (LM Studio, Ollama) as Model Context Protocol (MCP) servers to Claude Desktop, Claude Code, OpenCode, Antigravity, VS Code, and ChatGPT/Codex with custom naming and cross-platform safety.
- **Bilingual**: Full English and Spanish localization for both terminal and desktop interfaces.

---

## How It Works

1. **Engine Selection**: Select LM Studio or Ollama. If not installed, LLM Tuner provides official installer commands.
2. **Model & Context**: Pick any locally downloaded model and set the desired context window (e.g. 16,384 tokens).
3. **Load Profile**: Choose between `speed`, `balanced` (default), or `quality`. The system highlights a recommended profile based on free VRAM.
4. **Load**:
   - **Preset Hit**: If a preset exists for that exact model, context, profile, and hardware, it applies immediately and loads the model (~20s).
   - **Preset Miss**: Unloads existing models to free VRAM, evaluates top candidate configurations (2–3 min), benchmarks actual generation speeds, saves the best preset, and loads the model.

Benchmarks run again only if the context or profile changes, the hardware changes (GPU, VRAM, PCIe link), the model file changes, or downloaded variants change (for `speed` and `quality`). You can also force a benchmark run with `--force`.

---

## Load Profiles

More tokens per second does not always equal better answers. Profiles let you decide when answer quality can be traded for speed or memory efficiency:

| Profile | Optimization Goal | Trade-offs & Behaviour |
|---|---|---|
| `speed` | Maximum tokens per second. | Uses the lightest downloaded quantization variant and any KV cache type (including `q4_0`). |
| `balanced` | Speed weighted by KV cache quality. *(Default)* | Balanced trade-off; runs with the selected variant and weighs speed by KV precision. |
| `quality` | Zero degradation that still fits fully on GPU. | Keeps the heaviest downloaded variant that fits entirely into VRAM, using precise KV cache (`f16` or `q8_0`). Falls back to `balanced` if no full offload is possible. |

Lossless optimizations (layer distribution across GPUs, thread count, GPU selection order) are applied across all profiles.

### Variant Switching

- **Ollama**: Automatically selects and loads the best tag variant for the active profile among tags identified as the same model.
- **LM Studio**: Since LM Studio cannot switch variants programmatically, LLM Tuner optimizes the active variant and advises you when another variant better suits your chosen profile.

---

## Installation

Install globally via npm:

```bash
npm install -g llm-tuner
```

Prerequisites:
- **Node.js**: version 22 or higher (`node >= 22`).
- **Local Engine**: LM Studio (0.4.25+) or Ollama installed (or let the wizard guide installation).

---

## Usage

### Interactive CLI & Slash Commands

Launch the terminal interface:

```bash
llm-tuner
```

Running `llm-tuner` without arguments presents an interactive menu to choose a command:
- `/load`: Tune and load a model with optimal hardware settings
- `/mcp`: Connect your local engine as an MCP server to AI agents (Claude, OpenCode, VS Code, Codex)
- `/presets`: Inspect saved tuning presets
- `/settings`: Configure language (`en` / `es`) and visual theme (`system` / `light` / `dark`)
- `/help`: Display help and usage options
- `/exit`: Exit the interactive menu

You can also run any slash command directly from your terminal:

```bash
llm-tuner /load
llm-tuner /mcp
llm-tuner /presets
llm-tuner /settings
```

### Desktop App

Launch the desktop interface:

```bash
llm-tuner-desktop
```

> **Note**: Electron downloads automatically during the first launch of `llm-tuner-desktop`. A working network connection is required for that initial launch.

### Non-Interactive CLI

Run directly in headless, scripted, or CI environments:

```bash
# Basic run with balanced profile
llm-tuner --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --yes

# Specify load profile
llm-tuner --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --profile quality --yes

# List saved presets
llm-tuner --presets

# Configure language and theme
llm-tuner /settings
```

### CLI Options Reference

| Flag | Description | Default |
|---|---|---|
| `--engine <lmstudio\|ollama>` | Target engine. | Interactive prompt |
| `--model <key>` | Model key or Ollama tag. | Interactive prompt |
| `--ctx <tokens>` | Context length in tokens (e.g. `16384`). | Interactive prompt |
| `--profile <speed\|balanced\|quality>` | Load profile to optimize for. | `balanced` |
| `--force` | Force re-measurement even if a valid preset exists. | `false` |
| `--candidates <n>` | Number of top candidate configurations to benchmark. | `3` |
| `--yes` | Run non-interactively without confirmation prompts. | `false` |
| `--dry-run` | Measure without saving presets or modifying engine configurations. | `false` |
| `--presets` | List all saved presets. | — |
| `--json` | Output results as JSON. | `false` |
| `--lang <en\|es>` | Set and persist interface language. | System / `en` |
| `--theme <system\|light\|dark>` | Set and persist interface theme. | `system` |
| `/settings` | Open interactive settings menu. | — |
| `--help` | Show usage instructions. | — |

---

## Tuning Pipeline

For each KV cache type allowed by the selected profile (`f16`, `q8_0`, `q4_0`):

1. **GGUF Tensor Inspection**: Parses GGUF tensors to obtain actual byte sizes per layer.
2. **Context Memory Modeling**: Models KV cache size taking into account attention heads, dimensions, and sliding window attention (SWA).
3. **Multi-GPU Split**: Allocates layers proportionally to VRAM headroom, ordering GPUs by PCIe bandwidth and avoiding active display adapters.
4. **MoE Offloading**: For Mixture of Experts (MoE) architectures that exceed VRAM, calculates the exact expert count that can reside in system RAM (`--n-cpu-moe`).
5. **Empirical Benchmarks**: Benchmarks candidates using both a short prompt and a deep prompt filling ~50% of the context.
6. **Configuration Application**:
   - **LM Studio**: Updates per-model config in `~/.lmstudio/.internal/user-concrete-model-default-config/` and updates `hardware-config.json`.
   - **Ollama**: Creates an optimized Modelfile (`<model>-tuned-<ctx>`) and sets system server environment variables. A backup (`*.bak-llm-tuner-*`) is created before changing files.

---

## Preset Storage

Presets are stored deterministically per engine, model, context, and profile:

- **Linux**: `~/.config/llm-tuner/presets/`
- **macOS**: `~/Library/Application Support/llm-tuner/presets/`
- **Windows**: `%APPDATA%\llm-tuner\presets\`

---

## Platform Support

| Platform & Engine | Status | Notes |
|---|---|---|
| **Linux + NVIDIA + LM Studio** | ✅ Verified | Calibrated with real measurements (2× RTX 5070, Ryzen 7 5800X). |
| **Linux + Ollama** | ✅ Verified | Tested via private instance harnesses and unit test suite. |
| **Windows / macOS** | 🧪 Supported | Official paths, system commands, and detection logic implemented. |
| **AMD ROCm / Apple Silicon / Intel Arc** | 🧪 Supported | Hardware VRAM detection enabled; memory bandwidth sourced from lookup tables. |

---

## Project Architecture

```
llmtuner/
├── src/
│   ├── core/           # Core tuning engine, estimator, hardware detection, presets, profiles
│   │   ├── engines/    # LM Studio and Ollama driver adapters
│   │   ├── estimator.js# Mathematical memory and VRAM modeling
│   │   ├── gguf.js     # GGUF tensor parser
│   │   ├── hardware.js # GPU detection, PCIe links, VRAM monitoring
│   │   ├── presets.js  # Preset persistence and invalidation logic
│   │   └── profiles.js # Speed, balanced, and quality profile rules
│   ├── cli/            # Interactive wizard and CLI argument parsing
│   ├── i18n/           # English and Spanish localization catalogs
│   └── web/            # Embedded HTTP/SSE server powering the desktop GUI
├── electron/           # Desktop launcher and main process wrapper
├── test/               # Node.js native test suite
└── docs/               # Technical specs, real benchmark measurements, and notes
```

---

## Development & Testing

Clone and set up locally:

```bash
git clone https://github.com/ronald32acunadev/llmtuner.git
cd llmtuner
npm install

# Start CLI wizard
npm start

# Start Desktop app
npm run desktop

# Run test suite
npm test
```

The test suite includes regression tests verifying real dual-RTX 5070 measurements with Qwen2.5-Coder-32B.

---

## Notes & Troubleshooting

- **Desktop Runtime Download**: The Electron runtime is downloaded on the first execution of `llm-tuner-desktop`. If downloading in a restricted offline environment, extract `electron-v*.zip` into the `dist/` directory of the installed `electron` package and create `path.txt` with the content `electron`.
- **Root / Sudo Installs**: Avoid running `npm install -g --unsafe-perm` under root without proper directory ownership, as Electron may fail to unpack its binary into user space.
- **LM Studio Compatibility**: Internal config paths are calibrated and tested against LM Studio 0.4.25+.

---

## License

[MIT](LICENSE) © Ronald Daniel Acuña Arias
