# LLM Tuner — project specification

Handoff document to continue the project in another session or with another AI agent. Explains what it is, why it exists, how it works, what was measured and what's left. Last updated: 2026-10-04.

---

## 1. The idea

Running a local LLM fast depends on many parameters that almost nobody tunes well: how many layers go to the GPU, how much context fits, which KV cache type to use, in what order multiple GPUs are used, how many CPU threads… LM Studio's and Ollama's defaults tend to be conservative, and the user ends up with a saturated CPU and few tokens per second.

**LLM Tuner** automates that tuning. The user chooses engine, model, context and a load profile, and presses **Load**. The app finds the best configuration for their hardware under that profile, saves it as a preset and loads the model with it.

The profile says what to optimize for: `speed`, `balanced` or `quality`. Speed is no longer the only goal: more tokens per second does not mean better answers, and a user with spare VRAM may prefer to spend it on quality. See §4.5.

### Origin

The project came out of a real case. Qwen2.5-Coder-32B (Q4_K_M) on LM Studio over 2× RTX 5070 was running at ~11 t/s with the CPU saturated. Tuning it by hand got to ~26 t/s. That manual process (finding the config files, discovering that a VRAM limit was cutting layers, measuring which contexts fit) is what the app does on its own. See §8.

### User requirements

1. **No LLM decides the configuration.** Everything is deterministic: hardware detection, reading the model's metadata, memory formulas and real measurements. The only model that runs is the one being configured, and only to measure its speed.
2. **Cross-platform:** Windows, macOS and Linux, in Node.js.
3. **Two engines:** LM Studio and Ollama. If they're already installed, they're detected; if not, they're installed automatically.
4. **Two interfaces** over the same core: CLI and desktop (Electron). The local web interface was a third one until the npm distribution; it is now the content of the desktop window.
5. **User flow** (defined by the user, must be respected):
   1. Choose engine (Ollama or LM Studio).
   2. The app lists the models already downloaded for that engine.
   3. Choose a model and enter the context.
   4. Choose a load profile (`speed`, `balanced` or `quality`) and press **Load**.
   5. If no preset exists: the tests run to find the best configuration for that model, context and profile.
   6. A **preset** is generated for that model, context and profile, so the tests aren't repeated.
   7. **It only measures again when the context or the profile changes** (or the hardware, the model file or, for `speed` and `quality`, the list of downloaded variants).
6. The app ships in **English** (default) and **Spanish**. Code and identifiers are in English.
7. **The user chooses what to optimize for.** Lossless optimizations always apply; the load profile decides how much lossy optimization (weight quantization, KV cache quantization) is allowed. The rule of each profile is deterministic, like everything else.

---

## 2. How it's used

Installed from npm:

```bash
npm install -g llm-tuner
llm-tuner            # CLI wizard (src/cli/index.js)
llm-tuner-desktop    # desktop app (electron/launch.js → electron/main.js)
```

From a clone of the repository:

```bash
npm install
npm start          # CLI wizard
npm run desktop    # desktop app
npm test           # node --test test/
```

Non-interactive CLI:

```bash
llm-tuner --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --yes
llm-tuner --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --profile quality --yes
llm-tuner --presets
# other options: --profile <speed|balanced|quality>, --force (re-measure), --dry-run, --candidates N, --json, --lang <en|es>
```

The flow is engine → model → context → profile → **Load**. The wizard asks for the profile with the recommended one marked. Without `--profile`, a run with `--yes`, with `--json`, or with engine, model and context all given as flags uses `balanced`, so scripts written before profiles existed behave the same. An unknown `--profile` value is rejected with exit code 1.

Requirements: Node ≥ 22. Dependencies: `systeminformation` and `@inquirer/prompts`; `electron` is a regular dependency (the desktop needs Node 22.12 or later, which is what Electron 44 requires).

---

## 3. Architecture

```
src/
  core/                 core shared by the interfaces
    util.js             exec, which, JSON with backup, fetch with timeout, CPU sampling
    hardware.js         CPU/RAM/GPU: nvidia-smi, rocm-smi, Apple Silicon, fallback with systeminformation
    gguf.js             own GGUF reader (metadata + size of each tensor) and summary for the estimator
    estimator.js        memory per layer, KV cache, GPU split, t/s prediction, candidates
    benchmark.js        deterministic synthetic code prompt; benchmark via API (LM Studio / Ollama)
    llama-server.js     launches LM Studio backend's llama-server with the exact parameters and measures
    presets.js          save and look up presets; hardware fingerprint
    profiles.js         load profile rules (pure, no I/O): allowed KV types, variant pick, winner, recommendation, hints
    settings.js         user preferences in settings.json: language, theme, last profile chosen
    installer.js        official per-OS install plans (winget, brew, scripts)
    tuner.js            orchestrator: detectEngines, Tuner.plan/run/load/profilePlan
    engines/
      lmstudio.js       detection, models, backend, config writing, apply, load
      ollama.js         detection, models, private server for measuring, Modelfile, variables, load
    index.js            public exports
  cli/index.js          CLI with @inquirer/prompts
  cli/profile.js        pure helpers of the CLI profile step (choices, notes, event lines)
  web/server.js         http + SSE (/api/state, /api/models, /api/plan, /api/presets, /api/load, /api/install…)
  web/public/           index.html, app.js, style.css (vanilla, no framework)
  web/public/profile.js view-model of the profile selector, shared by the browser and the Node tests
electron/
  launch.js             disables the Chromium sandbox only if chrome-sandbox doesn't have root setuid
  main.js               starts the web server on a random port and opens it in a BrowserWindow
test/                   unit tests; core.test.js holds the measured cases as regression
```

### Common interface of an engine (`engines/*.js`)

```
id, name, capabilities
detect()                              → { installed, bin, version, …}
listModels(ctx)                       → [{ key, name, sizeBytes, quant, … }]
listVariants(ctx, key)                → [{ key, quant, sizeBytes, selected }] downloaded variants of that model
modelMeta(ctx, key)                   → GGUF metadata (+ file)
prepare(ctx)                          → unloads loaded models to free VRAM
benchmark(ctx, model, candidate, o)   → { ok, short, deep, cpu, vramPeakBytes, error, oom }
apply(ctx, model, candidate, o)       → writes the config (dryRun returns the preview)
load(ctx, model, o)                   → loads the model with the applied config and measures a short prompt
```

`ctx = { detection, hw }`.

`capabilities` restricts what the core plans:

| Capability | Meaning |
|---|---|
| `kvTypes` | KV cache types the engine supports; the profile's list is intersected with it |
| `cpuMoe` | The engine can keep MoE expert layers in RAM (`--n-cpu-moe`) |
| `variantSelect` | The engine can load a specific downloaded variant by key. `true` in Ollama, `false` in LM Studio (§5) |

### `Tuner.load(model, ctx, { profile })` flow

The profile goes through `normalizeProfile` first: an unknown value is `balanced`. The result carries `profile` and `variant` (the key that was loaded).

**`balanced`** (the default; the flow that existed before profiles):

1. `findPreset(engine, model, ctx, hw, modelBytes)`.
2. **If there's a preset:** `preset-hit` event → `apply` (doesn't write if nothing changed) → `load`.
3. **If there isn't one:** `run()`:
   1. `plan` with `unload`: unloads models and re-reads free VRAM.
   2. The N best candidates are tried (3 by default).
   3. `pickBest` → `savePreset` → `preset-saved` event → `apply` → `load`.

**`speed` and `quality`** add the variant steps around that flow:

1. **List the variants:** `Tuner.variants(key)` calls `listVariants` and reads the metadata of each one. It is never empty: when the engine lists nothing, the chosen key is the only variant. Listing needs no hardware.
2. **Look up the preset:** `findPreset` with the profile and the variant list (§6).
3. **If there's a preset:** `preset-hit` → `presetTarget` announces the variant stored in the preset with a `variant-picked` event (reason `profile.variant.preset`). Nothing is picked and no VRAM is freed → `apply` → `load`.
4. **If there isn't one:**
   1. **Free VRAM:** `freeVram()` unloads the engine's models (`prepare`) and re-detects the hardware. The pick depends on the free VRAM, so it must come first.
   2. **Pick the variant:** `profileTarget` applies `pickVariant` (§4.5) and emits `variant-picked`, plus `profile-fallback` when the pick is a fallback.
   3. **Measure:** `run()` on the variant to load, with the KV types of the profile (it unloads again, as in the `balanced` flow); `pickBest(results, profile)` chooses the winner. If the profile is `quality` and the winner does not meet its criteria, a `profile-fallback` event says so.
   4. **Save, apply, load:** `savePreset` with the profile, the variant and the variant list → `preset-saved` → `apply` → `load`.

On an engine with `variantSelect: false` the variant measured and loaded is always the one selected in the engine, under the key the user chose; the pick is only reported (`recommendSwitch: true` when it differs from the selected one).

### `Tuner.profilePlan(model, ctx)`

A preview of what each profile would do, used before pressing Load. It does not measure and does not unload anything. It returns:

| Field | Content |
|---|---|
| `variants` | Downloaded variants: `key`, `quant`, `sizeBytes`, `selected`, `bitsPerWeight` |
| `variantSelect` | The engine capability |
| `recommended` | `{ profile, reasonCode }` (§4.5) |
| `profiles` | One entry per profile: `variant` and `quant` (the pick), `reasonCode`, `fallback`, `kvTypes`, `loads` (the key that would be loaded), `recommendSwitch` |
| `hints` | Heavier variants, not downloaded, that would fit fully on GPU (§4.5) |
| `vramBusy` | The preview is conservative because VRAM is in use (§4.5) |

The CLI wizard calls it directly. The web UI gets it as the `profiles` field of `POST /api/plan` (`null` if it fails; the rest of the plan is still returned). `POST /api/load` accepts `profile` and rejects an unknown one with `errors.unknownProfile` before creating a job.

### Progress events

`status`, `plan`, `candidate-start`, `bench-progress`, `candidate-done`, `preset-hit`, `preset-saved`, `applied`, `loaded`, `done`, and two for profiles:

| Event | Payload | When |
|---|---|---|
| `variant-picked` | `profile`, `variant` (`key`, `quant`, `sizeBytes`), `reasonCode`, `loads`, `recommendSwitch` | `speed` and `quality` only: after the pick, or on a preset hit |
| `profile-fallback` | `profile`, `reasonCode`, `variant` | `quality` could not keep its promise (§4.5) |

Both carry codes only, never text. The web UI receives every event via SSE at `/api/jobs/:id/events`.

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

- A split is computed for each KV type the profile allows (f16, q8_0, q4_0 by default; see §4.5).
- If an option is less than 1 GiB short of fitting entirely, an **optimistic** candidate (probe) with everything on GPU is also added. If it doesn't fit, it fails fast on load and is discarded.
- **Threads:** 4 if everything is on GPU; physical cores − 1 if there are layers on the CPU.
- **Order:** first the ones that fit entirely with a safety margin, then by estimated t/s × KV type quality.

**Estimated speed:** time per token = bytes read on each GPU / (bandwidth × 0.7) + bytes on CPU / (RAM bandwidth × 0.6) + cache read at the given depth × `readCost`. Only used for ordering; the real measurement decides.

**Final choice (`pickBest`, `balanced` profile):** maximum of `t/s with context × KV_quality`, with quality f16 = 1.0, q8_0 = 0.99 and q4_0 = 0.93. `pickBest` lives in `profiles.js`; the rules of the other profiles are in §4.5.

### 4.4 Benchmark

- **Prompt:** deterministic synthetic JavaScript code (PRNG with a fixed seed). On llama-server, characters per token are calibrated with `/tokenize`.
- **Two measurements:** a short prompt (~200 tokens) and a long one (~50% of the context). 200 tokens are generated with `ignore_eos` so the length is fixed.
- **Sampling every 500 ms:** VRAM with `nvidia-smi` and CPU with `os.cpus()`, which works on every system.
- **OOM detection** in the log (`cudaMalloc failed`, `out of memory`…). If it fails, the last 15 lines of the log are returned in `logTail`.

### 4.5 Load profiles (`profiles.js`)

A profile says what the tuner optimizes for. The module is pure: no I/O, no engine calls.

**The estimator formulas of §4.3 did not change.** A profile only restricts which KV types `planCandidates` receives, which variant is measured and which rule picks the winner.

**Governing rule.** There are two kinds of optimization, and the profile governs only one.

| Kind | Examples | Applied |
|---|---|---|
| Lossless | Layer placement across GPUs, GPU order, threads, batch sizes, Flash Attention | Always, in every profile. They only add speed |
| Lossy | A more aggressive weight quantization, a quantized KV cache | As much as the profile allows. They trade answer quality for speed or memory |

**How loss is ordered.** With data read from the model, not hand-made tables.

- **Weights:** bits per weight (`bitsPerWeight` in the GGUF summary) = total tensor bytes × 8 / total tensor elements, rounded to two decimals. More bits means less loss. If any variant lacks the value, variants are ordered by file size instead.
- **KV cache:** `f16` is lossless, `q8_0` nearly lossless and `q4_0` the aggressive one (quality 1.0, 0.99 and 0.93 in `KV_TYPES`).

**The three profiles.**

| Profile | Variant (`pickVariant`) | KV types allowed (`kvTypesFor`) | Winner (`pickBest`) |
|---|---|---|---|
| `speed` | Lightest downloaded variant (lowest bits per weight) | `f16`, `q8_0`, `q4_0` | Highest measured t/s with context, with no quality weight |
| `balanced` | The variant the user selected | `f16`, `q8_0`, `q4_0` | t/s with context × KV quality (§4.3) |
| `quality` | Heaviest downloaded variant that fits fully on GPU at the requested context | `f16`, `q8_0` | Among results that are fully on GPU with `f16` or `q8_0`: highest KV precision; on a tie, highest t/s |

- The KV types are always intersected with the engine's `capabilities.kvTypes`. If an engine supported neither `f16` nor `q8_0`, `quality` would plan with the engine's full list; both current engines support all three.
- "Fits fully on GPU" is `fitsFullyOnGpu`: `placeLayers` reaches a full offload with at least one allowed KV type. A MoE model that only fits with expert layers in RAM does not count, in the pick and in the winner (`meetsQuality`).
- The "Variant" column is what Ollama loads and what LM Studio only recommends (§5).
- With a single downloaded variant, `speed` and `quality` differ only in the KV types and the winner rule.
- `balanced` is the behavior that existed before profiles: same winner, same preset file.

**Quality fallback.** `quality` promises a full GPU offload with a precise KV cache. When it cannot keep that promise it says so with a `profile-fallback` event and does not fail.

| Case | Detected | What is used | Reason code |
|---|---|---|---|
| No downloaded variant fits fully on GPU | Before measuring, in the pick | The selected variant | `profile.variant.noFullGpu` |
| The pick found a variant that fits, but no measured configuration of the loaded variant is fully on GPU with `f16` or `q8_0` | After measuring | The variant already loaded for the measurement | `profile.fallback.noFullGpuConfig` |

Whenever no measured result meets the quality criteria, `pickBest` applies the `balanced` rule to the measured results. `q4_0` is still never planned, so a fallback is not identical to choosing `balanced`.

**Recommended profile (`recommendProfile`).** The highest-quality profile whose outcome stays fully on GPU. The hardware decides; there is no t/s threshold.

| Order | Condition | Recommended | Reason code |
|---|---|---|---|
| 1 | A downloaded variant fits fully on GPU with `f16` or `q8_0` | `quality` | `profile.recommend.qualityFits` |
| 2 | The selected variant fits fully on GPU with some KV type the engine supports | `balanced` | `profile.recommend.balancedFits` |
| 3 | Otherwise | `speed` | `profile.recommend.partialOffload` |

**Variant hint (`variantHints`).** When a heavier quantization that is not downloaded would fit fully on GPU, the app says so. It never downloads anything.

| Target (`HINT_TARGETS`) | Bits per weight |
|---|---|
| `Q8_0` | 8.5008 |
| `Q6_K` | 6.5633 |
| `Q5_K_M` | 5.7036 |

For each target, starting from the selected variant:

1. Skip it unless its bits per weight are at least 5% above the file on disk (`HINT_MIN_GAIN = 1.05`). Measured bits per weight are rounded and the targets come from another model, so without the margin the app could hint the quantization the file already is.
2. Skip it if that quantization is already downloaded.
3. Scale the layer, expert, output, embedding and file bytes by target bits / current bits.
4. Hint it if the scaled model passes `fitsFullyOnGpu` with the KV types of `quality`.

The size is **an estimate**: the targets are the bits per weight llama.cpp publishes in `tools/quantize/README.md` for Llama-3.1-8B, and other models differ. The interfaces word it as an estimate. There is no hint when the metadata has no bits per weight.

**Conservative preview (`vramInUse`).** `profilePlan` plans with the VRAM that is free right now, while a real load unloads the engine's models first. `vramBusy` is true when any GPU has more than 20% of its VRAM in use (`VRAM_BUSY_FRACTION = 0.2`; a desktop compositor alone stays below it), and the interfaces then warn that the preview is conservative. On unified-memory hardware used VRAM is reported as 0, so the warning never shows.

**Preselection.** `settings.json` holds `profile`, the last profile chosen interactively (`null` until one is chosen).

| Interface | Preselected | Stored |
|---|---|---|
| CLI wizard | Stored profile, else the recommended one | The choice made in the prompt |
| CLI with `--profile` | The flag | Nothing: the flag applies to that run only |
| CLI without `--profile` and with `--yes`, `--json`, or engine, model and context all given | `balanced` | Nothing |
| Web and desktop | Stored profile, else the recommended one of the current plan, else `balanced` | Every change, through `POST /api/settings` |

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

**Variants and load profiles (`variantSelect: false`).** LM Studio cannot load a specific variant by key, so the profile governs the load configuration (KV type, GPU placement) of the variant selected in LM Studio, and the app only recommends selecting another one.

Observed on 0.4.25 with `lms load <identifier> --estimate-only -y`, which loads nothing:

| Identifier | Result |
|---|---|
| Family key (`qwen/qwen2.5-coder-14b`) | Accepted |
| Family key + variant (`qwen/qwen2.5-coder-14b@q4_k_m`, the downloaded variant) | "Model not found" |
| Concrete GGUF path | "Model not found" |
| Concrete default identifier | "Model not found" |

- `GET /api/v0/models` lists only the family id, with the quantization of the selected variant.
- `model-index-cache.json` does hold one entry per variant (`defaultIdentifier` such as `model@q4_k_m`), so the GGUF of any downloaded variant can be resolved and read. Only loading through LM Studio is limited to the selected variant.
- The per-model config is stored by family key, with no variant in the file name.
- `listVariants` reads `variants` and `selectedVariant` from the model's entry in `lms ls --json` and resolves each file through the model index. The quantization is the text after the last `@`, upper-cased. An entry without `variants` is a single, selected variant. A variant whose file cannot be resolved is left out, unless it is the selected one.
- What the user sees: `speed` and `quality` measure and load the selected variant. When another downloaded variant suits the profile better, the `variant-picked` event carries `recommendSwitch: true` and the interfaces say which variant to select in LM Studio. The app never switches it: the selected-variant state is another non-public internal file and the app does not write it.

### 5.2 Ollama (implemented, untested with Ollama installed)

- **API:** `OLLAMA_HOST` or `127.0.0.1:11434`. Endpoints `/api/tags`, `/api/show` (`verbose: true` gives `model_info`; the `modelfile` field contains `FROM <blob path>`, which is read as GGUF), `/api/generate` and `/api/ps` (`size_vram` vs `size` to know how much actually ended up on GPU).
- **The KV type and Flash Attention are global to the server** (`OLLAMA_KV_CACHE_TYPE`, `OLLAMA_FLASH_ATTENTION`). That's why each candidate is measured on a **private `ollama serve`** on another port, with `OLLAMA_MODELS` pointing at the same models. If the models folder can't be read (systemd service), it's measured on the main server and a warning is shown.
- **Apply:**
  - `ollama create <model>:<tag>-tuned-<N>k` with a Modelfile (`num_ctx`, `num_gpu`, `num_thread`, `num_batch`).
  - Server variables: systemd override on Linux (needs sudo; if there's no passwordless sudo, the commands are shown), `setx` on Windows and `launchctl setenv` on macOS.
- **Load:** `generate` with `keep_alive: '30m'` on the tuned model.

**Variants and load profiles (`variantSelect: true`).** Every Ollama tag is an independent model that loads by name, so the app picks the variant for the profile, measures it and loads it. The tuned model is created from the picked tag.

`listVariants` reads `/api/tags` and groups tags with a deliberately conservative rule. Two tags are variants of the same model only when all of these match:

| Must match | Source |
|---|---|
| Base name | The text before the `:` |
| Parameter size | `details.parameter_size` |
| Family | `details.family` |
| Tag stem | `tagStem`: the tag in lower case without its quantization segment (`details.quantization_level`) |

- Tuned copies (`-tuned-` in the tag) are never variants, and alias tags that share a digest are listed once.
- A model without `details.parameter_size` has itself as its only variant.
- **Why so strict:** a profile must never load a different model than the one chosen, and the names cannot prove that `14b` and `14b-instruct-q8_0` are the same model, so they are not grouped.
- **The cost:** automatic variant selection applies in fewer cases. When tags are not grouped, the model has one variant and `speed` and `quality` differ only in the KV types and the winner rule.

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
- **Key:** engine + model + context + profile. The model is the key the user chose, also when a profile loads another variant.
- **File:** one per key, with `{version, engine, model, ctx, profile, modelBytes, fingerprint, hardware, createdAt, candidate, bench, tried[]}`.

  | Profile | File name |
  |---|---|
  | `balanced` | `<engine>__<model>__<ctx>.json` (the name used before profiles existed) |
  | `speed`, `quality` | `<engine>__<model>__<ctx>__<profile>.json` |

- **Presets saved before profiles existed** have no `profile` field and are found as `balanced`. An unknown profile value is treated as `balanced` and never becomes part of a file name.
- **A `speed` or `quality` preset also stores** `variant` (`key`, `quant` and `sizeBytes` of the variant used) and `variants` (`key` and `sizeBytes` of every downloaded variant when it was measured, with `selected: true` on the one that was selected in the engine).
- **Hardware fingerprint:** sha256 of the CPU brand + (GPU name, VRAM in GB, generation and PCIe width) of each GPU.
- **Invalidated if:**

  | Change | Applies to | Reason |
  |---|---|---|
  | The hardware fingerprint | Every profile | `hardware` |
  | The model file size | `balanced`; also `speed` and `quality` when no variant list is available | `model` |
  | The list of downloaded variants or which one is selected (keys, file sizes and the selected entry, `variantsSignature`) | `speed`, `quality` | `variants` |

  Downloading or removing a variant, or selecting another one in LM Studio, therefore makes `speed` and `quality` measure again, and leaves `balanced` alone. A `speed` or `quality` preset saved before the selected entry was stored is measured once more. `--force` or the "Re-measure" checkbox ignore the preset.
- **Listing:** `listPresets` returns the profile and the variant key. `--presets` prints the profile, and the variant key when it differs from the model key.

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
- **The CLI crashes when `--lang` or `--theme` cannot be saved.** In `src/cli/index.js` the error handler uses the color helper `c` before its `const` is initialized, so a failed write ends in a `ReferenceError` and not in the intended warning. Not fixed yet.

### Load profiles: limits that remain

- **The profile preview plans with the VRAM free right now.** `profilePlan` unloads nothing, so a loaded model makes the recommended profile and the variant hints pessimistic, and the real load, which frees VRAM first, can pick differently. The `vramBusy` warning covers it, except on unified-memory hardware, where used VRAM is reported as 0. A preview that plans as if the engine's models were unloaded needs to know what is loaded; it belongs to the multi-model feature (§10).
- **A model loaded in the other engine is not unloaded.** Each engine's `prepare` unloads only its own models, so a model loaded in Ollama reduces the free VRAM a LM Studio measurement sees, and the other way around.
- **LM Studio with two or more variants of one model downloaded was only tested with fixtures** of `lms ls --json` and the model index. The reference machine has one variant per model.
- **No switch advice on a preset hit.** `recommendSwitch` is always `false` there: the advice to select another variant only appears in the preview and when measuring.
- **`loads` means two things on an engine without `variantSelect`.** In `profilePlan` it is the key of the selected variant; in the `variant-picked` event it is the key the user chose.
- **The variant hint is an estimate** (§4.5): the real file of the hinted quantization can be larger or smaller.
- **The web result panel does not show the profile or the variant,** and the status text for a missing preset (`status.searchNone`) only mentions the context.
- **Variant listing trusts the engine's answer.** Ollama's `listVariants` does not check the HTTP status when the body still carries `models`, and LM Studio's `listModels` assumes that `lms ls --json` returns an array.

---

## 10. Status and next steps

**Done and tested (Linux + NVIDIA + LM Studio):**
- Hardware and engine detection.
- GGUF reading.
- Calibrated estimator.
- Benchmark with llama-server.
- Presets.
- apply/load on LM Studio.
- CLI and desktop app (Electron) starting up.
- Unit tests (`npm test`).

**Implemented, verified with one real load on LM Studio:**
- Load profiles (`speed`, `balanced`, `quality`): rules, variant listing in both engines, presets per profile, the `--profile` flag and wizard step, and the selector in the web and desktop UI. The unit tests use fixtures and mock engines.
- Real check on the reference machine (LM Studio, Ministral 3 3B Q4_K_M, 8K context, 2026-10-04), each profile measured, saved, applied and loaded through the CLI:

  | Profile | KV types measured | Deep-context t/s (f16 / q8_0 / q4_0) | Winner | Preset file suffix |
  |---|---|---|---|---|
  | `quality` | `q8_0`, `f16` | 94.7 / 89.2 / not measured | `f16` | `__quality` |
  | `speed` | `q8_0`, `f16`, `q4_0` | 90.9 / 89.1 / 60.1 | `f16` | `__speed` |
  | `balanced` | `q8_0`, `f16`, `q4_0` | 94.9 / 86.1 / 60.1 | `f16` | none (legacy name) |

  A second `quality` load was a preset hit and loaded without measuring. On this model and hardware a quantized KV cache is slower, not faster, so the three profiles choose the same configuration; they differ in what they are allowed to measure.
- Not exercised on real hardware: the variant pick, because every model on the reference machine has a single downloaded variant; the quality fallback, because the model fits fully on GPU; and Ollama.

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
6. Tell the user when a newer version is on npm (notify only: version, changes and the install command).
   Before the first release: decide how CI publishes with 2FA (§11), and make the desktop start after a global install made with `sudo` (Electron unpacks its runtime into its own package folder, which is then read-only for the user; today the launcher fails with the network message).
7. Detect in the interface that a preset became stale and explain why (hardware or model) before measuring again.
8. Move presets between identical machines (export/import).
9. If LM Studio changes its internal formats: detect the version and warn instead of writing blindly.
10. Load each profile with a model that has two or more downloaded variants, and on Ollama. A real load per profile is done for LM Studio with a single-variant model (see "Implemented, verified with one real load on LM Studio" above).
11. **Next feature: keep more than one model loaded.** Today both engines unload every loaded model in `prepare()` and `load()`. Planning a second model against the remaining VRAM comes after load profiles. Owner requirement: LM Studio and Ollama stay separate engines but share the same VRAM, and one model may be loaded in each at the same time, so "what is loaded" must be checked across both engines, not only the one in use. This also lets the profile preview plan as if the engine's models were already unloaded (§9).
12. Deferred: download a hinted variant from the app. Today the app only shows the hint and never downloads anything.

**Current state of the reference machine:**
- LM Studio has Qwen 32B configured with 16K, KV q8_0, everything on GPU and 4 threads.
- In the hardware config: `gpuStrictVramCap=false` and priority [1,0].
- There's a saved preset for `lmstudio / qwen/qwen2.5-coder-32b / 16384`.
- Backups of the original configs are next to each file (`*.bak-20260925`, `*.bak-llm-tuner-*`).

## 11. Distribution and releases

npm is the only distribution channel. The package `llm-tuner` ships the CLI and the desktop app; there are no installers.

- `package.json` publishes only `src/`, `electron/` and the READMEs (`files`), and declares two commands: `llm-tuner` and `llm-tuner-desktop`.
- Electron is a regular dependency. Electron 44 has no install script: `require('electron')` downloads the runtime the first time the desktop starts. `electron/launch.js` adds no download code; it only reports a start failure in the saved language.
- The web UI in `src/web` is not a user-facing mode. It is the content of the desktop window: `electron/main.js` starts `startServer` on a random local port.

### Workflows

- `.github/workflows/ci.yml`: `npm test` on every pull request to `main` and on pushes to `main`, on Ubuntu with Node 22.
- `.github/workflows/release.yml`: on every push to `release`, runs the tests, stops if the version in `package.json` is already on npm, publishes, and creates the tag `vX.Y.Z` and the GitHub Release. The push that creates the `release` branch runs the tests but does not publish, so the first release also goes through a pull request.

### One-time setup (owner)

1. Create an npm account and enable two-factor authentication.
2. Decide how CI authenticates to npm (pending, see below) and create the credential it needs.
3. In the GitHub repository, create the environment `npm` and store the token there as the secret `NPM_TOKEN`. Required reviewers on that environment give a manual approval before publishing.
4. Create the `release` branch from `main` and protect it so changes arrive only through pull requests.

npm reserves the name `llm-tuner` only when the first version is published.

**Pending before the first release: how CI publishes with two-factor authentication.** `release.yml` runs `npm publish` with a token. With 2FA enabled, npm accepts that from CI only when the granular token is allowed to bypass 2FA, and npm's documentation discourages such tokens. The alternatives npm recommends are `npm stage publish` from CI followed by `npm stage approve` by the owner with 2FA, or a trust relationship (OIDC). Both need the package to exist on the registry, so with either one the first version is published by hand from the owner's machine.

### Each release

1. On `main`: `npm version patch|minor|major --no-git-tag-version`, then commit `package.json` and `package-lock.json`. Without that flag `npm version` creates a local tag `vX.Y.Z` that collides with the one the workflow creates on the merge commit.
2. Open a pull request from `main` into `release` and merge it.
3. The workflow publishes the version and creates the tag and the GitHub Release.

If the publish succeeds and the release creation fails, create it by hand with `gh release create vX.Y.Z --target <sha> --generate-notes`. Re-running the job would stop at the version check.
