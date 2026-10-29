# LLM Tuner

**English** · [Español](README.es.md)

[![npm version](https://img.shields.io/npm/v/llm-tuner.svg)](https://www.npmjs.com/package/llm-tuner)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

Load a local LLM with the fastest configuration for the context you need, on LM Studio or Ollama, across Windows, macOS, and Linux. You choose what "best" means through deterministic load profiles: raw speed (`speed`), a balanced trade-off (`balanced`), or maximum answer quality (`quality`).

No LLM decides the configuration. LLM Tuner reads your hardware topology and model GGUF metadata, mathematically calculates what fits into VRAM, benchmarks the top candidate configurations on real hardware, and saves the winner as a persistent **preset**. The next time you load that model with the same context and profile, the preset is applied immediately (~20s) without re-measuring.

---

## Table of Contents

- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Load Profiles](#load-profiles)
- [Installation](#installation)
- [Usage](#usage)
  - [Interactive CLI & Slash Commands](#interactive-cli--slash-commands)
  - [Desktop Application](#desktop-application)
  - [Remote Server Mode & Daemon](#remote-server-mode--daemon)
  - [MCP Server Integration for AI Agents](#mcp-server-integration-for-ai-agents)
  - [Non-Interactive CLI](#non-interactive-cli)
  - [CLI Options & Flags Reference](#cli-options--flags-reference)
- [Tuning Pipeline](#tuning-pipeline)
- [Architecture & Storage Paths](#architecture--storage-paths)
- [Platform Support](#platform-support)
- [Development & Testing](#development--testing)
- [Troubleshooting & Platform Notes](#troubleshooting--platform-notes)
- [License](#license)

---

## Key Features

- **Deterministic Optimization**: Uses GGUF tensor-level metadata, PCIe bandwidth measurements, and real token-generation benchmarks—never an AI guessing parameters.
- **Multi-GPU & Topology Aware**: Splits layers intelligently across multiple GPUs, prioritizing cards with wider PCIe links and no attached display server.
- **Tailored Load Profiles**: Optimize for raw tokens/second (`speed`), quality-weighted speed (`balanced`), or zero-loss GPU retention (`quality`).
- **Engine Support**: First-class support for both LM Studio (direct `llama-server` management) and Ollama (isolated benchmark servers and systemd/service integration).
- **Persistent Presets**: Measures once per hardware fingerprint, model, context, and profile. Automatically invalidates presets if hardware or model weights change.
- **Dual Interfaces**: Interactive terminal wizard (`llm-tuner`) and cross-platform desktop UI (`llm-tuner-desktop`).
- **Remote Server & Daemon Mode**: Run `llm-tuner /serve` on a dedicated GPU machine with timing-safe Bearer token authentication and sanitized hardware telemetry, then control it from any local CLI or Desktop client.
- **AI Agent MCP Integration**: Connect your local or remote engines (LM Studio, Ollama) as Model Context Protocol (MCP) servers to Claude Desktop, Claude Code, OpenCode, Antigravity, VS Code, and ChatGPT/Codex.
- **Bilingual**: Full English (`en`) and Spanish (`es`) localization across both terminal and desktop interfaces.

---

## How It Works

1. **Engine Selection**: Select LM Studio or Ollama. If neither is installed, LLM Tuner offers official installation plans.
2. **Model & Context**: Pick any locally downloaded model and set the desired context window (between `512` and the model's training limit, e.g., `16384` tokens).
3. **Load Profile**: Choose between `speed`, `balanced` (default), or `quality`. The planner recommends the highest-quality profile that fits fully in free VRAM.
4. **Load & Benchmark**:
   - **Preset Hit**: If a valid preset exists for that exact model, context, profile, and hardware fingerprint, it is applied and loaded immediately (~20s).
   - **Preset Miss**: Unloads loaded models to free VRAM, evaluates top candidate configurations (2–3 min), measures short and deep-context generation speeds, saves the winning preset, and loads the model.

Benchmarks run again only if the context or profile changes, the hardware changes (GPU, VRAM, PCIe link), the model file changes, or downloaded variants change (for `speed` and `quality`). You can also force re-measurement anytime with `--force`.

---

## Load Profiles

More tokens per second does not always mean better answers. Load profiles control when answer quality can be traded for speed or memory efficiency:

| Profile | Optimization Goal | Trade-offs & Behavior |
| :--- | :--- | :--- |
| `speed` | Maximum tokens per second. | Selects the lightest downloaded quantization variant and allows any KV cache type (`f16`, `q8_0`, `q4_0`). |
| `balanced` | Speed weighted by KV cache quality. *(Default)* | Uses the selected model variant and ranks candidates by `tps × kvQuality`. |
| `quality` | Least degradation that still runs fully on GPU. | Picks the heaviest downloaded variant that fits 100% into VRAM with a precise KV cache (`f16` or `q8_0`). Falls back to `balanced` if no full-GPU config fits. |

Lossless optimizations (layer distribution across GPUs, GPU ordering, CPU thread count) are applied across all profiles.

### Variant Switching

- **Ollama**: Automatically selects and loads the optimal tag variant for the active profile among tags recognized as the same model family.
- **LM Studio**: Optimizes the currently active variant and notifies you if another downloaded (or downloadable `Q8_0` / `Q6_K` / `Q5_K_M`) quantization better suits your chosen profile.

---

## Installation

Install globally via npm:

```bash
npm install -g llm-tuner
```

Or run directly without permanent installation via `npx`:

```bash
npx llm-tuner
```

### Prerequisites

- **Node.js**: `>= 22` (`engines.node` in [`package.json`](package.json)).
- **Local Engine**: LM Studio (0.4.25+) or Ollama installed (or install via the built-in wizard).

---

## Usage

### Interactive CLI & Slash Commands

Launch the interactive terminal menu:

```bash
llm-tuner
```

Running `llm-tuner` without arguments opens an interactive command loop:
- `/load`: Tune and load a model with optimal hardware settings.
- `/mcp`: Connect your local engine to AI coding agents as an MCP server.
- `/presets`: View saved tuning presets.
- `/serve`: Start remote server mode with API authentication.
- `/settings`: Configure interface language (`en` / `es`) and visual theme (`system` / `light` / `dark`).
- `/help`: View usage help and CLI flags.
- `/exit`: Exit the interactive menu.

You can also invoke any slash command (or its plain positional alias) directly from your shell:

```bash
llm-tuner /load
llm-tuner /mcp
llm-tuner /presets
llm-tuner /serve
llm-tuner /settings
llm-tuner /help
```

### Desktop Application

Launch the graphical desktop app:

```bash
llm-tuner-desktop
```

> [!NOTE]
> The Electron desktop runtime is downloaded on first launch if not already cached. On Linux, `llm-tuner-desktop` also registers a desktop entry at `~/.local/share/applications/llm-tuner.desktop`.

### Remote Server Mode & Daemon

Run LLM Tuner as a network daemon on a dedicated GPU host:

```bash
# Start on default 0.0.0.0:7860 (generates and saves a 32-byte hex token if omitted)
llm-tuner /serve

# Customize host, port, and Bearer token
llm-tuner /serve --host 0.0.0.0 --port 7860 --token my-secret-token
```

- **Security & Telemetry Sanitization**: Remote and server-mode requests require `Authorization: Bearer <token>` verified via `crypto.timingSafeEqual`. Remote `/api/state` responses strip host-identifying details (OS distro, CPU brand, PCI bus IDs, GPU UUIDs) and block remote `/api/install` calls (`403 Forbidden`).
- **Client Connection**: Add the remote server (Name, URL, Token) in the Desktop/Web UI under **Settings → Servers**, or select a configured server from the CLI with `--server <id|name>`.

### MCP Server Integration for AI Agents

Register LM Studio (`@mzxrai/mcp-openai`) or Ollama (`ollama-mcp-server`) across your installed AI coding agents:

```bash
# Interactive wizard
llm-tuner /mcp

# With flags
llm-tuner /mcp --engine lmstudio --name my-local-llm --host http://127.0.0.1:1234/v1 --apiKey sk-lm-local
```

Supported AI agents:
- **Claude Desktop** (`claude_desktop_config.json`)
- **Claude Code** (`~/.claude.json`)
- **OpenCode** (`opencode.json`)
- **Antigravity** (`~/.gemini/config/mcp_config.json`)
- **VS Code** (`Code/User/mcp.json`)
- **ChatGPT / Codex** (`~/.codex/config.toml`)

### Non-Interactive CLI

Run directly in headless, scripted, or CI environments:

```bash
# Tune and load non-interactively with the default balanced profile
llm-tuner --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --yes

# Optimize for maximum answer quality and output JSON
llm-tuner --engine ollama --model qwen2.5-coder:14b --ctx 32768 --profile quality --yes --json

# Dry-run measurement without modifying engine files or saving a preset
llm-tuner --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --dry-run

# Target a configured remote server
llm-tuner --server gpu-rig --engine ollama --model llama3.1:8b --ctx 16384 --yes
```

### CLI Options & Flags Reference

| Flag / Command | Description | Default |
| :--- | :--- | :--- |
| `/load`, `load` | Tune and load a model with optimal hardware settings. | Default when tuning flags are passed |
| `/mcp`, `mcp` | Configure LM Studio or Ollama as an MCP server for AI agents. | — |
| `/presets`, `presets`, `--presets` | List saved tuning presets (filterable by `--engine` and `--model`). | — |
| `/serve`, `serve`, `--serve` | Start remote server daemon mode with Bearer authentication. | — |
| `/settings`, `settings`, `--settings` | Open the interactive settings menu (language & theme). | — |
| `/help`, `help`, `-h`, `--help` | Show CLI usage help and presets directory path. | — |
| `-v`, `--version` | Print the installed version (`0.4.4`). | — |
| `--engine <lmstudio\|ollama>` | Target local LLM engine. | Interactive prompt |
| `--model <key>` | Model key (LM Studio) or model tag (Ollama). | Interactive prompt |
| `--ctx <tokens>` | Context length in tokens (e.g., `16384` or `16k`). | Interactive prompt |
| `--profile <speed\|balanced\|quality>` | Load profile to optimize for. | `balanced` |
| `--force` | Re-run benchmarks even if a valid preset already exists. | `false` |
| `--candidates <n>` | Number of top candidate configurations to benchmark. | `3` |
| `--yes` | Skip confirmation prompts. | `false` |
| `--dry-run` | Measure and preview changes without applying config or saving a preset. | `false` |
| `--json` | Emit final execution result as JSON. | `false` |
| `--lang <en\|es>` | Set and persist interface language. | Saved setting / `en` |
| `--theme <system\|light\|dark>` | Set and persist visual theme. | `system` |
| `--server <id\|name>` | Set the active target server from saved settings. | `local` |
| `--host <host>` | Bind address for `/serve` or custom endpoint host for `/mcp`. | `0.0.0.0` (`/serve`) |
| `--port <port>` | TCP port for `/serve`. | `7860` |
| `--token <token>` | Authentication Bearer token for `/serve`. | Auto-generated 32-byte hex |
| `--name <name>` | Custom MCP server name when running `/mcp`. | Engine ID (`lmstudio` / `ollama`) |
| `--apiKey <key>` | Custom API key for LM Studio when running `/mcp`. | `sk-lm-local` |

---

## Tuning Pipeline

For each KV cache type permitted by the active profile (`f16`, `q8_0`, `q4_0`):

1. **GGUF Tensor Inspection**: Reads GGUF tensor headers directly to determine exact byte weights per layer, embedding, and output head.
2. **Context Memory Modeling**: Computes KV cache footprint across attention heads, head dimensions, and sliding window attention (SWA) layers.
3. **Multi-GPU Layer Placement**: Distributes layers across GPUs proportionally to usable VRAM headroom, ranking GPUs by PCIe generation/width and penalizing display-attached cards.
4. **MoE Expert Offloading**: For Mixture-of-Experts (MoE) models that exceed VRAM, calculates how many expert layers can spill into system RAM (`cpuMoeLayers` / `--n-cpu-moe`).
5. **Empirical Benchmarking**: Measures token generation throughput on a short prompt and a deep prompt (~50% of target context), sampling CPU load and peak VRAM.
6. **Atomic Application & Backups**:
   - **LM Studio**: Writes per-model configuration under `~/.lmstudio/.internal/user-concrete-model-default-config/` and updates `hardware-config.json`.
   - **Ollama**: Creates a tuned model tag (`<model>-tuned-<ctx>`) with fixed `num_ctx`, `num_gpu`, and `num_thread`, and configures service environment variables (`OLLAMA_FLASH_ATTENTION`, `OLLAMA_KV_CACHE_TYPE`). Timestamped backups (`*.bak-llm-tuner-*`) are created before modifying files.

---

## Architecture & Storage Paths

### Repository Structure

```text
llmtuner/
├── src/
│   ├── cli/                # CLI router, interactive wizard, and slash commands
│   │   ├── commands/       # /load, /mcp, /presets, /serve, /settings, /help
│   │   ├── animation.js    # Live terminal telemetry and progress animation
│   │   ├── colors.js       # Theme-aware ANSI styling
│   │   ├── index.js        # CLI binary entrypoint (llm-tuner)
│   │   ├── nav.js          # Backspace/escape step navigation wrapper
│   │   ├── profile.js      # CLI profile selection helpers
│   │   └── router.js       # Argument parser and interactive menu loop
│   ├── core/               # Hardware detection, GGUF parser, estimator, presets, MCP
│   │   ├── engines/        # LM Studio and Ollama engine adapters
│   │   ├── mcp/            # Multi-agent MCP registry plus JSON and TOML adapters
│   │   ├── benchmark.js    # Short and deep-context benchmark runner
│   │   ├── client.js       # Unified HTTP/SSE TunerApiClient for local/remote servers
│   │   ├── estimator.js    # VRAM placement and KV cache modeling
│   │   ├── gguf.js         # Binary GGUF header and tensor reader
│   │   ├── hardware.js     # GPU, PCIe, RAM, and CPU topology detection
│   │   ├── installer.js    # Cross-platform engine installation plans
│   │   ├── llama-server.js # Direct llama-server harness for LM Studio benchmarks
│   │   ├── presets.js      # Hardware-fingerprinted preset storage
│   │   ├── profiles.js     # Speed, balanced, and quality profile rules
│   │   ├── settings.js     # Persistent user settings and server profiles
│   │   ├── telemetry.js    # Live CPU, RAM, and GPU VRAM sampling
│   │   ├── tuner.js        # Main Tuner orchestrator class
│   │   └── updater.js      # npm registry version check
│   ├── i18n/               # English (en.js) and Spanish (es.js) catalogs
│   ├── platform/           # Privileged Ollama service authorization (sudo/polkit)
│   └── web/                # Embedded HTTP + SSE server and static Desktop/Web UI
├── electron/               # Desktop launcher (launch.js) and Electron main process
├── scripts/                # Local utility and evaluation helper scripts
├── test/                   # Node.js built-in test suite (test/*.test.js)
└── docs/                   # Design specs, user stories, and hardware evaluation reports
```

### Configuration & Preset Paths

By default, settings (`settings.json`), server config (`server.json`), and presets (`presets/*.json`) are stored in the per-user configuration directory (overridable via the `LLM_TUNER_CONFIG_DIR` environment variable):

| Operating System | Base Configuration Directory | Presets Directory |
| :--- | :--- | :--- |
| **Linux** | `~/.config/llm-tuner/` (or `$XDG_CONFIG_HOME/llm-tuner/`) | `~/.config/llm-tuner/presets/` |
| **macOS** | `~/Library/Application Support/llm-tuner/` | `~/Library/Application Support/llm-tuner/presets/` |
| **Windows** | `%APPDATA%\llm-tuner\` | `%APPDATA%\llm-tuner\presets\` |

---

## Platform Support

| Platform & Engine | Status | Notes |
| :--- | :--- | :--- |
| **Linux + NVIDIA + LM Studio** | Verified | Calibrated with real hardware measurements (2× RTX 5070, Ryzen 7 5800X). |
| **Linux + Ollama** | Verified | Tested with isolated benchmark instances, systemd overrides, and unit tests. |
| **Windows / macOS** | Supported | Official paths, installer plans, `setx`/`launchctl` environment updates, and GPU detection implemented. |
| **AMD ROCm / Apple Silicon / Intel Arc** | Supported | VRAM and unified memory detection supported; bandwidth estimated from architecture lookup tables. |

---

## Development & Testing

Clone the repository and install dependencies:

```bash
git clone https://github.com/ronald32acunadev/llmtuner.git
cd llmtuner
npm install

# Run the CLI wizard
npm start

# Launch the Electron desktop application
npm run desktop

# Run the automated Node.js test suite
npm test
```

---

## Troubleshooting & Platform Notes

- **First Desktop Launch (`llm-tuner-desktop`)**: The Electron binary is downloaded on initial install/run. If Electron cannot start, run `llm-tuner` in the terminal—it works without the desktop runtime.
- **Linux Sandbox on NTFS/exFAT or Non-Root Mounts**: `electron/launch.js` automatically checks `chrome-sandbox` permissions on Linux and sets `ELECTRON_DISABLE_SANDBOX=1` when SUID root (`04755`) is unavailable on the filesystem.
- **Ollama Service Authorization**: Updating Ollama server environment variables (`OLLAMA_KV_CACHE_TYPE`, `OLLAMA_FLASH_ATTENTION`) on Linux may prompt for administrator authorization (`sudo` or `pkexec`). If settings are already up to date, the service is not restarted. Non-interactive (`--json`) runs never block on password prompts.
- **LM Studio Must Be Closed Before Applying**: LM Studio overwrites its configuration files on exit; close LM Studio before applying a new hardware configuration if prompted.

---

## License

Released under the [MIT License](LICENSE).
