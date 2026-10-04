# Feature: Load Profiles (speed / balanced / quality)

Status: design and this document approved by the owner on 2026-10-04. `T-1` done; its outcome changed the LM Studio scope (see "Variant selection per engine"). Chain strategy pending before the first commit.

## Objective
Let the user choose, before pressing Load, what the tuner optimizes for: maximum speed, a balance, or the best answer quality the hardware can run fully on GPU. Each profile applies a deterministic rule to pick the model variant and the load configuration.

## Problem
The tuner picks the winner with one fixed rule: deep-context generation t/s weighted by KV cache quality (`pickBest` in `src/core/tuner.js`). More tokens per second does not mean better answers. A user with strong hardware may want to spend the headroom on quality instead of speed, and today there is no way to say so.

## Governing rule
There are two kinds of optimization, and the profile only governs one of them.

- Lossless (layer placement across GPUs, GPU order, threads, batch sizes, flash attention): always applied, in every profile. They only add speed.
- Lossy (a more aggressive weight quantization, a quantized KV cache): they trade answer quality for speed or memory. The profile decides how much of this is allowed.

"Loss" is ordered with data read from the GGUF itself, not hand-made tables:

- Weights: bits per weight, computed from the file. More bits means less loss.
- KV cache: `f16` is lossless, `q8_0` nearly lossless, `q4_0` is the aggressive one.

## Profile rules

| Profile | Variant | KV types allowed | Winner |
|---|---|---|---|
| `speed` | lightest downloaded variant (lowest bits per weight) | `f16`, `q8_0`, `q4_0` | highest measured deep-context t/s |
| `balanced` | the variant the user selected | `f16`, `q8_0`, `q4_0` | t/s x KV quality (current behaviour, unchanged) |
| `quality` | heaviest downloaded variant that fits fully on GPU at the requested context | `f16`, `q8_0` | highest KV precision that keeps a full GPU offload; on a tie, highest t/s |

KV types are always intersected with the engine's `capabilities.kvTypes`.

### Variant selection per engine
Decided by the owner on 2026-10-04 after `T-1` showed that LM Studio cannot load a specific variant by key.

- Ollama (`capabilities.variantSelect: true`): the app picks the variant for the profile and loads it. Each tag is an independent model.
- LM Studio (`capabilities.variantSelect: false`): the profile governs the load configuration (KV type, GPU placement) of the variant currently selected in LM Studio. When another downloaded variant suits the profile better, the app recommends selecting it in LM Studio and does not switch it. Writing LM Studio's selected-variant state was rejected: it is another non-public internal file and could not even be observed on the owner's machine.

In the table above, the "Variant" column therefore describes the pick in Ollama and the recommendation in LM Studio.

Consequences:

- `balanced` is exactly today's behaviour. Existing presets stay valid as `balanced`.
- With a single downloaded variant, `speed` and `quality` differ only by KV type. The variant hint below covers that case.
- Edge case: if no variant fits fully on GPU, `quality` cannot keep its promise. It behaves as `balanced` and emits a `profile-fallback` event with a reason code.

Recommended profile: the highest-quality profile whose outcome stays fully on GPU (`quality`, else `balanced`, else `speed`). It is decided by the hardware, with no arbitrary t/s threshold.

Variant hint: when a heavier variant that is not downloaded would fit fully on GPU, the app says so (for example "Q8_0, about 15 GB, would fit fully on your GPUs"). The size is estimated from the GGUF already on disk: current weight bytes scaled by target bits per weight over current bits per weight, then checked with `placeLayers`. The app never downloads anything.

## Approach
Two stages:

1. The estimator picks the variant for the profile, without measuring.
2. The existing pipeline measures the configurations of that variant, restricted to the allowed KV types, and picks the winner with the profile's rule.

Measuring time stays the same as today. Measuring every variant and configuration was rejected: more exact, but two to three times slower because each variant is 10 to 20 GB to load from disk.

## Scope

Core:
- `src/core/profiles.js` (new, pure, no I/O): `PROFILES`, `DEFAULT_PROFILE`, `normalizeProfile`, `kvTypesFor(profile, engineKvTypes)`, `pickVariant(profile, variants, hw, ctx)`, `pickBest(results, profile)`, `recommendProfile(...)`, `variantHints(...)`.
- `src/core/gguf.js`: add `bitsPerWeight` to the summary.
- `src/core/tuner.js`: `Tuner.load(key, ctx, { profile })`, `run` and `plan` take the profile; `pickBest` moves to `profiles.js` and stays re-exported. New progress events `variant-picked` and `profile-fallback`, carrying codes only.
- `src/core/engines/lmstudio.js`, `ollama.js`: new `listVariants(ctx, key)` and a `variantSelect` capability. LM Studio reads `variants` and `selectedVariant` from `lms ls --json` and resolves each variant's GGUF through `model-index-cache.json`; Ollama groups tags with the same base name and `details.parameter_size`.
- `src/core/presets.js`: the profile is part of the key. `balanced` keeps the current file name; `speed` and `quality` add a suffix. The preset stores the variant used and the list of downloaded variants; a change in that list invalidates `speed` and `quality` presets (new reason `variants`).
- `src/core/settings.js`: `profile` holds the last profile used.
- `src/core/estimator.js`: formulas are not changed. `planCandidates` already accepts `kvTypes`.

Interfaces:
- Flow: engine -> model -> context -> profile -> Load.
- Web and desktop (`src/web/public/`, `src/web/server.js`): three-option selector under the context with a "Recommended" badge, one line describing what the profile will do for this model, and the variant hint. `POST /api/plan` returns the per-profile summary without measuring; `POST /api/load` accepts `profile`.
- CLI (`src/cli/index.js`): `--profile <speed|balanced|quality>`, a wizard step with the recommended profile preselected, profile and variant in `--json` and `--presets`.
- Preselection: interactive uses the last profile used, or the recommended one when none was chosen. Non-interactive without the flag uses `balanced`, so existing scripts behave as today.

Text and docs:
- Every user-facing string goes through `src/i18n` in `en` and `es`; the core emits codes.
- `docs/PROYECTO.md`, `README.md`, `README.es.md`.

## Out of scope
- Downloading variants from the app. Only the hint is shown.
- Keeping more than one model loaded. Today both engines unload every loaded model in `load()` and `prepare()`; planning a second model against the remaining VRAM is a separate feature that follows this one. Owner requirement for that feature (2026-10-04): LM Studio and Ollama stay separate engines but share the same VRAM, so one model may be loaded in each at the same time. "What is loaded" must therefore be checked across both engines, not only the one in use. Today each engine unloads only its own models, so a model loaded in the other engine silently reduces the free VRAM a measurement sees.
- Any change to estimator formulas or their calibration.
- Sampling parameters (temperature, top-p).

## Constraints
- No LLM decides the configuration; every rule is deterministic.
- `src/core` does not depend on any interface and emits codes, never translated text.
- A backup is saved before modifying engine config files. LM Studio's `hardware-config.json` is never written with the app open.
- Code authorship: source and tests are generated by `pumbastudio` first; the agent writes them only when it is unavailable. Docs, i18n strings and commit messages are written by the agent.
- English for code, comments, docs and commit messages; the `es` catalog and `README.es.md` are the exceptions.

## Risks and open points
- Resolved by `T-1`: LM Studio does not accept per-variant keys in `lms load`, so it only recommends a variant. See "Variant selection per engine".
- Still unverified: LM Studio behaviour with two or more variants of one model downloaded (no such model exists on the owner's machine). `listVariants` for LM Studio is covered with fixtures of `lms ls --json` and the model index.
- Resolved in `T-3`: the hint targets use the bits per weight documented in llama.cpp `tools/quantize/README.md` for Llama-3.1-8B (Q8_0 8.5008, Q6_K 6.5633, Q5_K_M 5.7036). They are still an approximation for other models, so the hint is worded as an estimate.
- On the owner's machine every model has one downloaded variant, so the variant-selection path cannot be exercised end to end there without downloading a second variant. Unit tests cover it with fixtures.

## Acceptance criteria
- `balanced` produces the same winner and the same preset file as before the change, for the same inputs.
- `speed` never applies a quality weight to the winner; `quality` never picks `q4_0` KV and never picks a partially offloaded configuration while a fully offloaded one exists.
- A `quality` request that cannot be fully on GPU falls back to `balanced` and reports why.
- In Ollama the picked variant is the one loaded. In LM Studio the selected variant is the one loaded, and a better downloaded variant is reported as a recommendation, never switched.
- Presets are found per profile; downloading or removing a variant makes `speed` and `quality` re-measure.
- The recommended profile and the variant hint are shown before loading, in the CLI and the desktop UI, in `en` and `es`.
- `npm test` passes with no regressions.

## Route & Delegation
- Route: delegated direct for multi-file tasks, direct inline for single-file and verification tasks.
- TDD: test-first with `node --test` wherever a runnable deterministic test exists.
- Delivery strategy: `ask-on-risk`. Forecast is about 900 to 1,200 authored changed lines, above the 400-line budget.
- Chain strategy: `feature-branch-chain`, chosen by the owner on 2026-10-04. `main` is 29 commits behind and every earlier feature branch is merged into the tip of `feat/settings-drawer-cli`, so the tracker branch starts there.
- Branches and slices (each slice is a child branch with its own PR; push and PR creation stay with the owner):
  - Tracker: `feat/load-profiles` (from `feat/settings-drawer-cli` at `8a00f00`).
  - Slice 1 `feat/load-profiles-01-core` -> tracker: `T-2`, `T-3`, `T-5`.
  - Slice 2 `feat/load-profiles-02-engines` -> slice 1: `T-4`, `T-6`.
  - Slice 3 `feat/load-profiles-03-cli` -> slice 2: `T-8` with its i18n entries.
  - Slice 4 `feat/load-profiles-04-desktop` -> slice 3: `T-9` with its i18n entries.
  - Slice 5 `feat/load-profiles-05-docs` -> slice 4: `T-10`, `T-11`.
  - `T-7` (i18n) is split across the slices that introduce each string, so tests and strings land with the behaviour they belong to.
- Code authorship observed so far: `pumbastudio` generated the code of `T-2` and `T-3`; it times out on answers above roughly 100 lines, so code is requested in chunks.

## Tasks

- [x] `T-1`: Verify variant handling in the real engines
  - Scope: read-only checks against LM Studio and Ollama; no source change. Record findings in this document.
  - Route: direct inline
  - Checks: `lms load <key>@<variant>` behaviour, where the per-model config lands for a variant, how Ollama tags of one model relate.
  - Outcome (2026-10-04, observed with `lms load ... --estimate-only -y`, nothing was loaded):
    - LM Studio rejects every per-variant identifier. `qwen/qwen2.5-coder-14b` is accepted; `qwen/qwen2.5-coder-14b@q4_k_m` (the variant that is downloaded), the concrete GGUF path and the concrete default identifier all return "Model not found". The design assumption was wrong.
    - `GET /api/v0/models` lists only the family id, with the quantization of the selected variant.
    - `model-index-cache.json` does hold one entry per variant (`defaultIdentifier` `model@q4_k_m`, `virtual.baseChain`, concrete file), so the GGUF of any downloaded variant can be resolved and measured with `llama-server`. Only loading through LM Studio is limited to the selected variant.
    - Per-model config files are stored by family key (`user-concrete-model-default-config/qwen/qwen3-coder-30b.json`), with no variant in the name.
    - Not verifiable on this machine: behaviour with two or more variants downloaded, and where `selectedVariant` is persisted.
    - Ollama: every tag is an independent model that loads by name; `/api/tags` gives `details.family`, `details.parameter_size` and `details.quantization_level`, enough to group tags of one model.
  - Consequence: variant selection by the app is possible in Ollama and not in LM Studio through `lms load`. Scope decision pending with the owner before `T-4` and `T-6`.

- [x] `T-2`: `bitsPerWeight` in the GGUF summary
  - Scope: `src/core/gguf.js`, `test/core.test.js`
  - Route: delegated direct, together with `T-3` (one writer; reading the test conventions prepared both writes)
  - Commit: `ae418ef`
  - Checks: RED `undefined !== 16`, then `node --test test/core.test.js` passed 10/10.

- [x] `T-3`: Profile rules module
  - Scope: `src/core/profiles.js` (new), `test/profiles.test.js` (new), `src/core/tuner.js` and `src/core/index.js` re-exports
  - Route: delegated direct
  - Commit: `b3a84c1`
  - Checks: RED `ERR_MODULE_NOT_FOUND` for `profiles.js` (module-level, the module is new), then `node --test test/profiles.test.js` passed 14/14, including the regression case proving `pickBest` in `balanced` matches the previous scoring; `npm test` passed 67/67. Parent spot check: `node --test test/profiles.test.js` 14/14.
  - Notes for later tasks: `recommendProfile` with no variants returns `speed`; callers always pass at least the selected variant. On equal weight `pickVariant` returns the first variant for `speed` and the last for `quality`. A MoE model that only reaches full offload with experts in RAM counts as "does not fit fully on GPU", consistent with `meetsQuality`.

- [ ] `T-4`: `listVariants` in both engines
  - Scope: `src/core/engines/lmstudio.js`, `src/core/engines/ollama.js`, `test/server.test.js` or a focused engine test with mocked hosts
  - Route: delegated direct
  - Checks: focused test file, then `npm test`

- [ ] `T-5`: Presets keyed by profile
  - Scope: `src/core/presets.js`, `test/core.test.js`
  - Route: direct inline
  - Checks: `node --test test/core.test.js`; `balanced` file name unchanged; invalidation on variant-list change.

- [ ] `T-6`: Tuner wiring
  - Scope: `src/core/tuner.js`, `src/core/settings.js`, `test/core.test.js`, `test/settings.test.js`
  - Route: delegated direct
  - Checks: focused tests, then `npm test`

- [ ] `T-7`: i18n entries
  - Scope: `src/i18n/en.js`, `src/i18n/es.js`, `src/i18n/core.js`
  - Route: direct inline
  - Checks: `node --test test/i18n.test.js`

- [ ] `T-8`: CLI profile flag and wizard step
  - Scope: `src/cli/index.js`, `test/cli.test.js`
  - Route: delegated direct
  - Checks: `node --test test/cli.test.js`

- [ ] `T-9`: Web and desktop profile selector
  - Scope: `src/web/server.js`, `src/web/public/index.html`, `src/web/public/app.js`, `src/web/public/style.css`, `test/server.test.js`
  - Route: delegated direct
  - Checks: `node --test test/server.test.js`

- [ ] `T-10`: Documentation
  - Scope: `docs/PROYECTO.md`, `README.md`, `README.es.md`
  - Route: direct inline
  - Checks: structural readback

- [ ] `T-11`: Full verification
  - Scope: `npm test`, CLI smoke in `en` and `es`, manual load of each profile on the real LM Studio and Ollama
  - Route: direct inline
  - Checks: all suites passing; manual results recorded here.

## Progress
`T-1`, `T-2` and `T-3` done. Running authored changed lines: 374 (17 in `ae418ef`, 357 in `b3a84c1`). Next step: `T-5` (presets keyed by profile), which closes slice 1.
