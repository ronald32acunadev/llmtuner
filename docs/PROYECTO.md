# LLM Tuner — project specification

Handoff document to continue the project in another session or with another AI agent. Explains what it is, why it exists, how it works, what was measured and what's left. Last updated: 2026-09-25.

---

## 1. The idea

Running a local LLM fast depends on many parameters that almost nobody tunes well: how many layers go to the GPU, how much context fits, which KV cache type to use, in what order multiple GPUs are used, how many CPU threads… LM Studio's and Ollama's defaults tend to be conservative, and the user ends up with a saturated CPU and few tokens per second.

**LLM Tuner** automates that tuning. The user chooses engine, model and context, and presses **Load**. The app finds the fastest configuration for their hardware, saves it as a preset and loads the model with it.

### Origin

The project came out of a real case. Qwen2.5-Coder-32B (Q4_K_M) on LM Studio over 2× RTX 5070 was running at ~11 t/s with the CPU saturated. Tuning it by hand got to ~26 t/s. That manual process (finding the config files, discovering that a VRAM limit was cutting layers, measuring which contexts fit) is what the app does on its own. See §8.

### User requirements

1. **No LLM decides the configuration.** Everything is deterministic: hardware detection, reading the model's metadata, memory formulas and real measurements. The only model that runs is the one being configured, and only to measure its speed.
2. **Cross-platform:** Windows, macOS and Linux, in Node.js.
3. **Two engines:** LM Studio and Ollama. If they're already installed, they're detected; if not, they're installed automatically.
4. **Three interfaces** over the same core: CLI, local web and desktop (Electron).
5. **User flow** (defined by the user, must be respected):
   1. Choose engine (Ollama or LM Studio).
   2. The app lists the models already downloaded for that engine.
   3. Choose a model, enter the context and press **Load**.
   4. If no preset exists: the tests run to find the best performance for that model and context.
   5. A **preset** is generated for that model and context, so the tests aren't repeated.
   6. **It only measures again when the context changes** (or the hardware or the model file).
6. The app ships in **English** (default) and **Spanish**. Code and identifiers are in English.

---

## 2. How it's used

```bash
npm install
npm start          # CLI wizard (src/cli/index.js)
npm run web        # web interface at http://127.0.0.1:7860
npm run desktop    # desktop app (electron/launch.js → electron/main.js)
npm test           # node --test test/
```

Non-interactive CLI:

```bash
node src/cli/index.js --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --yes
node src/cli/index.js --presets
# other options: --force (re-measure), --dry-run, --candidates N, --json, --web, --lang <en|es>
```

Requirements: Node ≥ 20. Dependencies: `systeminformation` and `@inquirer/prompts`; `electron` as a devDependency.

---

## 3. Architecture

```
src/
  core/                 core shared by the three interfaces
    util.js             exec, which, JSON with backup, fetch with timeout, CPU sampling
    hardware.js         CPU/RAM/GPU: nvidia-smi, rocm-smi, Apple Silicon, fallback with systeminformation
    gguf.js             own GGUF reader (metadata + size of each tensor) and summary for the estimator
    estimator.js        memory per layer, KV cache, GPU split, t/s prediction, candidates
    benchmark.js        deterministic synthetic code prompt; benchmark via API (LM Studio / Ollama)
    llama-server.js     launches LM Studio backend's llama-server with the exact parameters and measures
    presets.js          save and look up presets; hardware fingerprint
    installer.js        official per-OS install plans (winget, brew, scripts)
    tuner.js            orchestrator: detectEngines, Tuner.plan/run/load, pickBest
    engines/
      lmstudio.js       detection, models, backend, config writing, apply, load
      ollama.js         detection, models, private server for measuring, Modelfile, variables, load
    index.js            public exports
  cli/index.js          CLI with @inquirer/prompts
  web/server.js         http + SSE (/api/state, /api/models, /api/plan, /api/presets, /api/load, /api/install…)
  web/public/           index.html, app.js, style.css (vanilla, no framework)
electron/
  launch.js             disables the Chromium sandbox only if chrome-sandbox doesn't have root setuid
  main.js               starts the web server on a random port and opens it in a BrowserWindow
test/core.test.js       unit tests with the measured cases as regression
```

### Common interface of an engine (`engines/*.js`)

```
id, name, capabilities
detect()                              → { installed, bin, version, …}
listModels(ctx)                       → [{ key, name, sizeBytes, quant, … }]
modelMeta(ctx, key)                   → GGUF metadata (+ file)
prepare(ctx)                          → unloads loaded models to free VRAM
benchmark(ctx, model, candidate, o)   → { ok, short, deep, cpu, vramPeakBytes, error, oom }
apply(ctx, model, candidate, o)       → writes the config (dryRun returns the preview)
load(ctx, model, o)                   → loads the model with the applied config and measures a short prompt
```

`ctx = { detection, hw }`.

### `Tuner.load(model, ctx)` flow

1. `findPreset(engine, model, ctx, hw, modelBytes)`.
2. **If there's a preset:** `preset-hit` event → `apply` (doesn't write if nothing changed) → `load`.
3. **If there isn't one:** `run()`:
   1. `plan` with `unload`: unloads models and re-reads free VRAM.
   2. The N best candidates are tried (3 by default).
   3. `pickBest` → `savePreset` → `preset-saved` event → `apply` → `load`.

Progress events: `status`, `plan`, `candidate-start`, `bench-progress`, `candidate-done`, `preset-hit`, `preset-saved`, `applied`, `loaded`, `done`. The web UI receives them via SSE at `/api/jobs/:id/events`.

## Languages

The app ships in English (default) and Spanish. `src/i18n/` holds the catalogs (`en.js`, `es.js`) and `t(locale, key, params)`. `src/core` never produces user-facing text: it emits codes (`code`, `reasonCode`, `labelCode`, `errorCode`, `noteCode`, `TunerError`) and each interface translates them. The chosen language is saved in `settings.json` inside the config folder (`configDir()`), shared by the CLI (`--lang`), the web UI and Electron (EN/ES selector). `test/i18n.test.js` fails if `en` and `es` differ in keys or params, or if `src/` references a key that does not exist.

---

## 4. Algorithms

### 4.1 Hardware (`hardware.js`)

- **NVIDIA:** `nvidia-smi --query-gpu=index,name,uuid,pci.bus_id,memory.total,memory.used,memory.free,pcie.link.gen.max,pcie.link.width.current,pcie.link.width.max,display_active`.
  - Use **`width.current`**: `width.max` reports what the GPU supports, not the slot. On the reference machine, GPU0 reports max=16 and current=4.
  - Use **`gen.max`**: `gen.current` drops to 1 when the GPU is idle.
- **GPU priority order:** highest PCIe bandwidth → no monitor attached → most free VRAM.
- **Memory bandwidth:** table by GPU name. Only used to order candidates before measuring.
- **Apple Silicon:** usable VRAM ≈ 67% of RAM (≤ 36 GB) or 75% (over 36 GB).

### 4.2 GGUF (`gguf.js`)

Own parser: reads the header, the key/value pairs and the tensor info. Large arrays (the vocabulary) are skipped and only their length is kept. From the tensors it obtains:

- `layerBytes[i]`: real bytes per `blk.i.*` layer.
- `layerExpertBytes[i]`: `*_exps.*` tensors (MoE).
- `attnLayers`: layers with `attn_k`/`attn_q`/`attn_qkv`. Hybrid models (Mamba/SSM) only have KV cache on those layers.
- `outputBytes`: `output.weight` + normalization. If embeddings are tied, `token_embd` is added.
- `kvHeadsPerLayer` (accepts per-layer arrays), `slidingWindow` and `swaLayers`.
- Experts (`expert_count` / `expert_used_count`).

Takes about 0.3 s on a 19 GB GGUF.

### 4.3 Estimator (`estimator.js`)

**KV cache per layer** = `tokens × kvHeads × (key_len + value_len) × bytes_per_element`. Bytes per element are f16 = 2, q8_0 = 34/32 and q4_0 = 18/32. On SWA layers, `tokens = min(ctx, window)`.
Validated: 32K with q8_0 on Qwen 32B = 4352 MiB, exactly what llama.cpp allocates.

**Constants calibrated** on 2× RTX 5070 with Qwen2.5-Coder-32B:

| Constant | Value | Note |
|---|---|---|
| `PER_GPU_OVERHEAD` | 350 MiB | CUDA context + scratch |
| `PER_GPU_RESERVE` | 64 MiB | `nvidia-smi`'s "free" already discounts ~450 MiB for the driver; **do not subtract another large reserve** (that was a bug) |
| `COMPUTE_BYTES_PER_CTX_TOKEN` | 3.5 KiB | |
| Logits buffer | `vocab × ubatch × 4` | on the GPU holding the output layer (~297 MiB on Qwen) |
| `DECODE_EFFICIENCY` | 0.7 | fraction of theoretical bandwidth |
| `readCost` for q4_0 | ×12 | the q4_0 cache with Flash Attention is much slower to read with long context (measured) |

**Layer split (`placeLayers`):**

1. Count how many layers fit, starting from the **last ones** (llama.cpp offloads the last N).
2. The output layer plus the logits go to the priority GPU.
3. If everything fits and there's more than one GPU, it **rebalances** so all GPUs end up with the same percentage of free headroom. The greedy split left the priority GPU ~90 MiB from the limit, and llama.cpp failed to allocate the compute buffers (a real bug, already fixed).
4. On MoE models that don't fit, it tries leaving the experts of the first N layers in RAM (`--n-cpu-moe`).

**Candidates (`planCandidates`):**

- A split is computed for each KV type (f16, q8_0, q4_0).
- If an option is less than 1 GiB short of fitting entirely, an **optimistic** candidate (probe) with everything on GPU is also added. If it doesn't fit, it fails fast on load and is discarded.
- **Threads:** 4 if everything is on GPU; physical cores − 1 if there are layers on the CPU.
- **Order:** first the ones that fit entirely with a safety margin, then by estimated t/s × KV type quality.

**Estimated speed:** time per token = bytes read on each GPU / (bandwidth × 0.7) + bytes on CPU / (RAM bandwidth × 0.6) + cache read at the given depth × `readCost`. Only used for ordering; the real measurement decides.

**Final choice (`pickBest`):** maximum of `t/s with context × KV_quality`, with quality f16 = 1.0, q8_0 = 0.99 and q4_0 = 0.93.

### 4.4 Benchmark

- **Prompt:** deterministic synthetic JavaScript code (PRNG with a fixed seed). On llama-server, characters per token are calibrated with `/tokenize`.
- **Two measurements:** a short prompt (~200 tokens) and a long one (~50% of the context). 200 tokens are generated with `ignore_eos` so the length is fixed.
- **Sampling every 500 ms:** VRAM with `nvidia-smi` and CPU with `os.cpus()`, which works on every system.
- **OOM detection** in the log (`cudaMalloc failed`, `out of memory`…). If it fails, the last 15 lines of the log are returned in `logTail`.

---

## 5. Engine integration

### 5.1 LM Studio (verified with 0.4.25 on Linux)

| What | Where |
|---|---|
| Base folder | `~/.lmstudio` (or the path from `~/.lmstudio-home-pointer`) |
| CLI | `~/.lmstudio/bin/lms` (`lms ls --json`, `lms load`, `lms unload --all`, `lms server start`, `lms ps`) |
| Model index | `.internal/model-index-cache.json`. A "virtual" model (`qwen/qwen2.5-coder-32b`) points via `concreteModelIndexedModelIdentifier` to the concrete entry, which has `containingDirAbsolutePath` |
| Per-model config | `.internal/user-concrete-model-default-config/<key>.json` |
| Hardware config | `.internal/hardware-config.json` (superjson format: `{"json":[["<backend>",{"fields":[…]}]],"meta":{"values":["map"]}}`) |
| Active backend | `.internal/backend-preferences-v1.json` → `extensions/backends/<name>-<version>/llama-server`. CUDA libraries in `extensions/backends/vendor/*` |
| App path | `.internal/app-install-location.json` |
| API | `http://127.0.0.1:1234/api/v0/chat/completions` (returns `stats.tokens_per_second`) |

**Per-model config keys** (`load.fields`):

- `llm.load.contextLength`
- `llm.load.llama.acceleration.offloadRatio` (1 = everything on GPU)
- `llm.load.llama.flashAttention`
- `llm.load.llama.cpuThreadPoolSize`
- `llm.load.llama.evalBatchSize` and `llm.load.llama.physicalBatchSize`
- `llm.load.numParallelSessions`
- `llm.load.useUnifiedKvCache`
- `llm.load.offloadKVCacheToGpu`
- `llm.load.llama.kCacheQuantizationType` / `vCacheQuantizationType`, in `{checked, value}` format
- `llm.load.llama.contextCheckpoints`
- `llm.load.numCpuExpertLayersRatio` (MoE)

**Hardware config keys:**

- `load.gpuStrictVramCap`: this is the "Limit Model Offload to Dedicated GPU Memory" option.
- `load.gpuSplitConfig`: `{strategy: "priorityOrder" | "evenly" | "tensor", priority: [1,0], disabledGpus, customRatio}`.

**Verified behaviors:**

- **`gpuStrictVramCap: true` cuts layers on its own,** with a conservative estimate: 59 of 65 on Qwen 32B, even with `lms load --gpu max`. The app only sets it to `false` once the benchmark confirmed everything fits.
- **LM Studio re-reads the per-model config on every `lms load`.** It can be written with the app open.
- **`hardware-config.json` is written with the app closed,** because it can be overwritten on exit. The app is only restarted if that config changes (`isHardwareApplied`). Shutdown uses SIGINT and, if needed, SIGKILL, because Electron stays in the system tray.
- **The real arguments** llama-server was launched with can be seen in `/proc/<pid>/cmdline` (Linux). That's how the `--n-gpu-layers 59` was discovered.
- **The benchmark directly uses LM Studio backend's `llama-server`,** which is the same binary, so the results carry over as-is.
- **CUDA device order** in the benchmark:
  - `CUDA_DEVICE_ORDER=PCI_BUS_ID`, to match `nvidia-smi`'s numbering.
  - `CUDA_VISIBLE_DEVICES` with reversed priority, because llama.cpp gives the last layers and the output layer to the last device.
  - `--tensor-split` with the number of layers per GPU, in that same reversed order.
- **LM Studio updates its own backend.** During development it went from 2.45.0 to 2.46.0. `backend()` reads the preferences and, if they don't exist, uses the most recent one.

### 5.2 Ollama (implemented, untested with Ollama installed)

- **API:** `OLLAMA_HOST` or `127.0.0.1:11434`. Endpoints `/api/tags`, `/api/show` (`verbose: true` gives `model_info`; the `modelfile` field contains `FROM <blob path>`, which is read as GGUF), `/api/generate` and `/api/ps` (`size_vram` vs `size` to know how much actually ended up on GPU).
- **The KV type and Flash Attention are global to the server** (`OLLAMA_KV_CACHE_TYPE`, `OLLAMA_FLASH_ATTENTION`). That's why each candidate is measured on a **private `ollama serve`** on another port, with `OLLAMA_MODELS` pointing at the same models. If the models folder can't be read (systemd service), it's measured on the main server and a warning is shown.
- **Apply:**
  - `ollama create <model>:<tag>-tuned-<N>k` with a Modelfile (`num_ctx`, `num_gpu`, `num_thread`, `num_batch`).
  - Server variables: systemd override on Linux (needs sudo; if there's no passwordless sudo, the commands are shown), `setx` on Windows and `launchctl setenv` on macOS.
- **Load:** `generate` with `keep_alive: '30m'` on the tuned model.

### 5.3 Automatic installation (`installer.js`)

| Engine | Linux | macOS | Windows |
|---|---|---|---|
| Ollama | `curl -fsSL https://ollama.com/install.sh \| sh` (asks for sudo) | `brew install --cask ollama` or download the `.dmg` | `winget install Ollama.Ollama` or `irm https://ollama.com/install.ps1 \| iex` |
| LM Studio | `curl -fsSL https://lmstudio.ai/install.sh \| bash` (installs `llmster` headless, no sudo) | same, or `brew install --cask lm-studio` | `winget install ElementLabs.LMStudio` or `irm https://lmstudio.ai/install.ps1 \| iex` |
| LM Studio app (download) | `https://lmstudio.ai/download/latest/<linux\|darwin\|win32>/<x64\|arm64>` | | |

All URLs were verified on 2026-09-25. Plans that require sudo are not run from the web UI (there's no terminal for the password): the command is shown to run by hand.

---

## 6. Presets (`presets.js`)

- **Path:** `~/.config/llm-tuner/presets/` on Linux, `~/Library/Application Support/llm-tuner/presets/` on macOS and `%APPDATA%\llm-tuner\presets\` on Windows.
- **File:** `<engine>__<model>__<ctx>.json` with `{version, engine, model, ctx, modelBytes, fingerprint, hardware, createdAt, candidate, bench, tried[]}`.
- **Hardware fingerprint:** sha256 of the CPU brand + (GPU name, VRAM in GB, generation and PCIe width) of each GPU.
- **Invalidated if** the fingerprint changes or the model file size changes. `--force` or the "Re-measure" checkbox ignore it.

---

## 7. Reference machine

- **System:** Ubuntu 26.04, kernel 7.0.
- **CPU and RAM:** AMD Ryzen 7 5800X (8 cores / 16 threads), 76 GB RAM.
- **GPU1:** RTX 5070 12 GB, PCIe 3.0 x16, no monitor. It's the **priority** one.
- **GPU0:** RTX 5070 12 GB, PCIe 2.0 x4, with the monitor (~900 MiB used by the desktop).
- **Software:** LM Studio 0.4.25 with llama.cpp CUDA 12 backend (2.45 → 2.46). Node 26.10 and npm 11.19.
- **Storage:** the project is on ext4 (`~/Proyects/llm-tuner`). The models remain on an **NTFS** disk (`/run/media/pumba/Proyects/Data/Models`). The first copy of the project was on that NTFS disk and disappeared on 2026-09-25 without having been pushed to GitHub; it was rebuilt from the session log.

## 8. Real measurements (Qwen2.5-Coder-32B Q4_K_M, 2× RTX 5070)

| Configuration | Fits? | Short prompt | With ~10K tokens | With ~20K tokens | Peak VRAM (GPU0 / GPU1) |
|---|---|---|---|---|---|
| Original (LM Studio with strict limit, 59/65 layers) | — | 11–12.5 t/s | — | — | 9.8 / 9.6 GB |
| 8K q8_0, everything on GPU | ✅ | 26.0 | — | — | 10.6 / 10.9 GB |
| **16K q8_0, everything on GPU** (chosen preset) | ✅ | 25.6–26.1 | 22.2–22.8 | — | 11.1 / 11.5 GB |
| 20K q8_0 | ✅ at the limit | — | 22.2 | — | 11.7 / 11.4 GB |
| 24K q8_0 | ❌ OOM | | | | |
| 32K q8_0 / K q8 + V q4 | ❌ OOM | | | | |
| 32K q4_0 | ✅ at the limit | 23.8 | 15.5 | 11.4 | 11.7 / 11.5 GB |
| 16K f16, 62/65 layers | partial | 16.7 | 14.0 | — | 11.4 / 11.4 GB |

Conclusions:
- **What matters most** is having all layers on GPU: speed went from 12.5 to 26 t/s and CPU dropped from ~280% to ~8%.
- **Avoid q4_0 for the KV cache:** more context fits, but with long context the speed collapses.
- **16K is the recommended setting** for coding on this machine.

App timings: the first load (measuring 3 candidates + preset + load) takes 2 min 27 s. With a preset, 22 s.

---

## 9. Known issues and fixes

- **Installing Electron with npm 11 and Node 26:**
  - npm 11 blocks install scripts. `package.json` already includes `allowScripts: {"electron@38.8.6": true}`.
  - Electron's automatic extraction fails silently (it only creates `dist/locales`). Happens on both NTFS and ext4, so it doesn't depend on the disk. Fix: unzip `~/.cache/electron/*/electron-v*-linux-x64.zip` into `node_modules/electron/dist` and create `node_modules/electron/path.txt` with the text `electron`.
- **Electron sandbox on Linux:** `chrome-sandbox` needs to be owned by root with mode 4755, impossible on NTFS. `electron/launch.js` sets `ELECTRON_DISABLE_SANDBOX=1` only in that case. Doing it with `app.commandLine.appendSwitch('no-sandbox')` **doesn't work**: the sandbox is checked before the main process runs.
- **`pkill -f <pattern>` inside a bash script** kills itself if the pattern appears in the command line (exit code 144). Use `pgrep` and filter.
- **`nvidia-smi`'s "free" VRAM already discounts the driver's reserve** (~450 MiB per GPU).
- **To launch LM Studio's `llama-server` by hand** you need its libraries: on Linux, `LD_LIBRARY_PATH=<backend>:<vendor/*>`; on Windows, `PATH`; on macOS, `DYLD_LIBRARY_PATH`.

---

## 10. Status and next steps

**Done and tested (Linux + NVIDIA + LM Studio):**
- Hardware and engine detection.
- GGUF reading.
- Calibrated estimator.
- Benchmark with llama-server.
- Presets.
- apply/load on LM Studio.
- CLI, web and Electron starting up.
- 9 unit tests.

**Implemented but untested:**
- Ollama end to end.
- Windows and macOS: paths, installers, `taskkill`, `osascript`, `setx`, `launchctl`.
- AMD GPUs (ROCm), Apple Silicon and Intel.
- Real automatic installation.

**Ideas and pending items:**
1. Install Ollama on the reference machine and test the full flow (benchmark on a private server, Modelfile, systemd override).
2. Test on Windows and macOS.
3. Measure with a MoE model (Qwen3-Coder-30B-A3B is already downloaded) to validate `--n-cpu-moe` and the predictions for MoE models.
4. Calibrate `readCost`/`PER_GPU_OVERHEAD` per GPU family. Today they're only calibrated on RTX 50xx.
5. Parameter to choose the benchmark depth (today 50% of the context) and number of candidates from the interface.
6. Package with electron-builder (the config is already in `package.json`, `npm run dist`) and check the sandbox in AppImage.
7. Detect in the interface that a preset became stale and explain why (hardware or model) before measuring again.
8. Move presets between identical machines (export/import).
9. If LM Studio changes its internal formats: detect the version and warn instead of writing blindly.

**Current state of the reference machine:**
- LM Studio has Qwen 32B configured with 16K, KV q8_0, everything on GPU and 4 threads.
- In the hardware config: `gpuStrictVramCap=false` and priority [1,0].
- There's a saved preset for `lmstudio / qwen/qwen2.5-coder-32b / 16384`.
- Backups of the original configs are next to each file (`*.bak-20260925`, `*.bak-llm-tuner-*`).
