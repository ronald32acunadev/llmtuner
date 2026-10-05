# Feature: Load Profiles (speed / balanced / quality)

Status: implemented on 2026-10-04 across five local slice branches; `npm test` 162/162. Open: the real-load check of `T-11` (needs the owner's go-ahead) and delivery (push and pull requests are the owner's). Where this document's design sections and the code differ, `docs/PROYECTO.md` and the code are the reference; the differences are listed under `T-10`.

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

- [x] `T-4`: `listVariants` in both engines
  - Scope: `src/core/engines/lmstudio.js`, `src/core/engines/ollama.js`, `test/engines.test.js` (new)
  - Route: delegated direct
  - Commit: `4eb7699`
  - Checks: RED 13/13 failing (`lmsVariants is not a function`, `listVariants is not a function`, missing `variantSelect`), then `node --test test/engines.test.js` passed 13/13; `node --test test/server.test.js` 10/10; `npm test` 92/92. No real engine was contacted: a fake `lms` script in a temp home and a mock Ollama server.
  - Notes for `T-6`: always pass the base model key to Ollama `listVariants`; a `-tuned-` tag passed as the key returns sibling tags with none selected. An Ollama key without a tag (`llama3.2`) returns `[]`; `listModels` always returns full names, so the normal flow is unaffected. LM Studio `listVariants` spawns `lms ls --json` on each call.

- [x] `T-3b`: Review follow-ups in the profile rules (added after the review of `T-2`/`T-3`)
  - Scope: `src/core/profiles.js`, `test/profiles.test.js`
  - Route: delegated direct, same writer as `T-5`
  - Commit: `e35358c`
  - Reason: the review left two warnings. `variantHints` could hint the quantization the file already is (rounded 8.50 against the 8.5008 target); fixed with `HINT_MIN_GAIN = 1.05`. The MoE rule in `fitsFullyOnGpu` was unproved; a MoE fixture now proves it (regression guard, no code change needed).
  - Checks: RED on the hint guard (`Q8_0` hinted for an 8.50 file), then `node --test test/profiles.test.js` passed 16/16.

- [x] `T-5`: Presets keyed by profile
  - Scope: `src/core/presets.js`, `test/presets.test.js` (new; `core.test.js` imports statically without `LLM_TUNER_CONFIG_DIR`, so preset tests there could reach the real config dir)
  - Route: delegated direct
  - Commit: `a703727`
  - Checks: RED 1 pass / 9 fail, then `node --test test/presets.test.js` passed 10/10; `npm test` passed 79/79. `balanced` keeps the legacy file name; a file with no `profile` field is found as `balanced`; `speed` and `quality` presets go stale with reason `variants` when the downloaded variant list changes.
  - Notes for `T-6`: pass `variants` to both `savePreset` and `findPreset` (a stored `variants: null` goes stale against any list); run `normalizeProfile` before calling presets (the profile becomes a file suffix unvalidated); pass the profile to `presetPath` in the `preset-hit` event; re-export `variantsSignature` from `src/core/index.js` if an interface needs it. For non-balanced profiles a matching variant signature replaces the `modelBytes` check, since sizes are part of the signature.

- [x] `T-4b`: Review follow-ups in presets and variant listing (added after the review of `T-3b`/`T-5`/`T-4`)
  - Scope: `src/core/presets.js`, `src/core/engines/lmstudio.js`, `src/core/engines/ollama.js`, `test/presets.test.js`, `test/engines.test.js`
  - Route: delegated direct
  - Commit: `ac1c55d`
  - Reason: four warnings and three suggestions. Fixed: the profile is normalized in `presetPath`, `findPreset` and `savePreset` (an unknown value no longer becomes a file suffix or escapes the presets directory); an empty variant list on both sides falls through to the `modelBytes` check; LM Studio `listVariants` returns `[]` for JSON that is not a list of models; a variant id without `@` has `quant: null`; an Ollama tuned key returns `[]`.
  - Decision recorded: Ollama tags are variants of one model only when base name, `details.parameter_size`, `details.family` and `tagStem` (the tag without its quantization segment) all match, and alias tags with the same digest are listed once. Deliberately conservative: `14b` and `14b-instruct-q8_0` are not grouped, because the names cannot prove they are the same model and a profile must never load a different model than the one chosen. The cost is that automatic variant selection in Ollama applies in fewer cases.
  - Checks: RED observed per fix, then `node --test test/presets.test.js` 14/14, `node --test test/engines.test.js` 22/22, `npm test` 105/105.
  - Left open: `lmstudio.listModels` has the same non-array JSON weakness (pre-existing, outside this feature); Ollama `listVariants` does not check the HTTP status when a body still carries `models`.

- [x] `T-6`: Tuner wiring
  - Scope: `src/core/tuner.js`, `src/core/settings.js`, `src/core/index.js`, `src/i18n/en.js`, `src/i18n/es.js` (`status.searchVariants`), `test/tuner.test.js` (new), `test/settings.test.js`, `test/server.test.js`
  - Route: delegated direct; the three `profile: null` expectations in `test/server.test.js` were a mechanical inline edit by the parent
  - Commits: `b119502` (tuner), `6199f6b` (settings), `d529d98` (fix below)
  - Checks: a regression test pins the balanced path (engine call sequence, event sequence, status codes, preset file name) and passed on the unchanged `tuner.js` before the change and after it. RED 1 pass / 8 fail, then `node --test test/tuner.test.js` 11/11; `node --test test/settings.test.js` 13/13; `node --test test/i18n.test.js` 14/14; `npm test` 120/120. Parent spot check: `npm test` 118/118 before `d529d98`.
  - Fix `d529d98`: `speed` and `quality` picked their variant with the hardware seen before the engine's models were unloaded, so a loaded model could make `quality` conclude that nothing fits. The pick now happens after freeing VRAM; a preset hit picks nothing, frees nothing and announces the stored variant with `profile.variant.preset`.
  - API for the interfaces: `Tuner.load(key, ctx, { profile })` returns `profile` and `variant`; `Tuner.profilePlan(key, ctx)` returns `{ variants, variantSelect, recommended, profiles: { speed, balanced, quality }, hints }` without measuring or unloading; `readSettings()` returns `profile` (`null` when never chosen).
  - Code authorship: `pumbastudio` generated the logic; tests 2 to 9 of `test/tuner.test.js` were written by the agent because LM Studio answered "No models loaded" twice.
  - Known limits, to carry into `T-8`/`T-9` and the docs: `profilePlan` is a preview with the hardware as it is, so a loaded model makes the recommendation pessimistic; on a preset hit `recommendSwitch` is always false; a profile preset was validated by the variant list only, not by which variant is selected in LM Studio (fixed in `T-9c`); `profilePlan().profiles[p].loads` is the selected variant key while the `variant-picked` event reports the chosen key; reason codes `profile.variant.*`, `profile.recommend.*` and `profile.fallback.noFullGpuConfig` have no catalog entries yet; `POST /api/settings` does not accept `profile` yet.

- [ ] `T-7`: i18n entries
  - Scope: `src/i18n/en.js`, `src/i18n/es.js`, `src/i18n/core.js`
  - Route: direct inline
  - Checks: `node --test test/i18n.test.js`

- [x] `T-8`: CLI profile flag and wizard step
  - Scope: `src/cli/index.js`, `src/i18n/en.js`, `src/i18n/es.js`, `test/cli.test.js`, `test/i18n.test.js` (the `profile` namespace added to the allowlist, a mechanical inline edit by the parent)
  - Route: delegated direct
  - Commits: `55d5792` (flag, wizard step, presets listing, catalog keys), `f258b19` and `47666d4` (`T-8b` below)
  - Checks: RED 0 pass / 4 fail on the flag, help and presets tests and 7 failing helper tests, then `node --test test/cli.test.js` 22/22; `node --test test/i18n.test.js` 14/14; `npm test` 132/132. Smoke: `--profile bogus` prints `Unknown profile "bogus". Valid values: speed, balanced, quality` and exits 1, in `en` and `es`.
  - Behaviour: `--profile <speed|balanced|quality>`; without the flag, non-interactive runs (`--yes`, `--json`) use `balanced`; the wizard shows the three profiles with the recommended one marked, preselects the stored profile or the recommended one, and stores the choice. Only the interactive choice is stored; a `--profile` flag applies to that run only. `--presets` prints the profile id and the variant key.
  - `T-8b`: every `profile-fallback` event now carries its `variant`, so interfaces do not have to remember the previous event; with `--profile` on an engine that cannot select variants the CLI prints the "select this variant" advice from the `variant-picked` event.
  - `T-8c` (`74ff80e`, help text in `655dae2`): fixes from the independent verification below. The pure helpers moved to `src/cli/profile.js` and the fragile `isImported()` guard was removed, so the script runs unconditionally again. New rule `shouldAskProfile(args)`: the profile is asked only when `--profile`, `--yes` and `--json` are absent and at least one of engine, model and a numeric context is missing; a fully flagged run uses `balanced`, so invocations that never prompted still do not. `profileEventLines` returns no lines for an event without a variant. `--presets` prints the variant key only when it differs from the model key. Checks: RED 3 failing, then `node --test test/cli.test.js` 25/25; `npm test` 135/135. Code authorship: written by the agent as fallback, `pumbastudio` answered "Connection error" twice because the LM Studio local server was stopped.
  - Not covered by a test: the interactive prompt itself and the progress handler inside `main()`; their logic lives in the tested helpers `profileChoices`, `profileNotes`, `profileSwitchNote`, `profileEventLines` and `shouldAskProfile` in `src/cli/profile.js`.
  - Known limits: the wizard's advice comes from the preview (`profilePlan`), computed before VRAM is freed, so it can differ from what the load picks; on a preset hit no switch advice is shown; the CLI recognises a fallback pick through the reason code `profile.variant.noFullGpu`, since `variant-picked` has no `fallback` flag.
  - Incident: a manual smoke run by the writer, without `LLM_TUNER_CONFIG_DIR`, rewrote the owner's real `~/.config/llm-tuner/settings.json` to `{"lang":"en","theme":"system"}`. The CLI printed English before those calls and the theme is merged from the existing file, so the effective values are believed unchanged, but the previous content was not captured. Later writers are told never to run the CLI without a temp config dir.

- [x] `T-9`: Web and desktop profile selector
  - Scope: `src/web/server.js`, `src/web/public/index.html`, `src/web/public/app.js`, `src/web/public/style.css`, `src/web/public/profile.js` (new, pure view-model shared by the browser and Node tests), `src/i18n/en.js`, `src/i18n/es.js`, `test/server.test.js`, `test/web-profile.test.js` (new)
  - Route: delegated direct
  - Commits: `e742d1b` (endpoints), `07359eb` (selector), `a0e6363` and `a94660f` (`T-9b` below), `ea0151e` (fallback copy in the HTML, a mechanical inline edit by the parent)
  - Checks: RED 7 failing server tests and `ERR_MODULE_NOT_FOUND` for `profile.js`, then `node --test test/server.test.js` 15/15; `node --test test/web-profile.test.js` 13/13; `node --test test/i18n.test.js` 14/14; `npm test` 156/156 (parent re-run: 156/156).
  - Behaviour: `GET`/`POST /api/settings` carry `profile` and `profiles`; `POST /api/plan` adds `profiles` (the `profilePlan` result, or `null` if it fails); `POST /api/load` accepts `profile` and rejects an unknown one with `errors.unknownProfile` before creating a job. The UI shows an accessible radio group (`#profile-options`) under the context with the recommended option badged, detail lines (`#profile-detail`), preselects the stored profile or the recommended one, stores a change, sends the profile on Load, renders `variant-picked` and `profile-fallback` in the progress log, and looks presets up by context and profile.
  - Browser check by the parent on the owner's machine (temp config dir, Load never clicked): with LM Studio selected the three options render under the context chips, the recommended badge and the detail lines show, and the real settings file was untouched.
  - `T-9b`: found in that browser check. With an 18.6 GB model loaded, the preview recommended `speed` for a 2.8 GB model because it plans with the VRAM free right now, while a real load unloads the engine's models first. `profilePlan` now returns `vramBusy` (`vramInUse`: any GPU with more than 20% of its VRAM used) and the CLI and the UI show a warning that the preview is conservative. Making the preview plan as if the engine's models were already unloaded needs to know what is loaded and belongs to the multi-model feature.
  - Code authorship: `T-9` written by the agent as fallback (`pumbastudio` answered "Connection error" three times, LM Studio server stopped); `T-9b` generated by `pumbastudio` once it was reachable again.
  - Not covered by a test: DOM wiring and CSS in `app.js`/`style.css`; hint and switch lines and the progress events were not observed live, only through `test/web-profile.test.js`.
  - Open points: the Load button moved to the bottom of the card to keep the order context -> profile -> Load; while no profile is stored the selection follows the recommendation of each new plan; the result panel does not show the profile or variant; `status.searchNone` still says "for this context" only; the warning never shows on unified-memory hardware, where used VRAM is reported as 0.

- [x] `T-9c`: Fixes from the independent verification of the desktop slice and from the documentation pass
  - Scope: `src/core/presets.js`, `src/core/tuner.js`, `src/web/public/app.js`, `src/web/public/profile.js`, `src/i18n/en.js`, `src/i18n/es.js`, `test/presets.test.js`, `test/tuner.test.js`, `test/web-profile.test.js`
  - Route: delegated direct; the catalog typo was a mechanical inline edit by the parent
  - Commits: `51daba4` (missing space after the colon in `web.benchIntro`), `b8010c6`, `ae5bf62`
  - Fixed: on an engine that cannot select variants, a `speed` or `quality` preset stayed valid after the user selected another downloaded variant, so a configuration measured on one file was applied to another; the variant signature now includes the selected entry (`key:sizeBytes:selected`), and a preset saved before that is measured once more. In the UI, a plan answer for a model that is no longer selected is ignored, and the `aria-live` detail region is only rewritten when its content changes.
  - Checks: RED reproduced the preset defect (`expected: 'benchmark'`, `actual: 'preset'`), then `node --test test/presets.test.js` 17/17, `node --test test/tuner.test.js` 13/13, `node --test test/web-profile.test.js` 15/15; `npm test` 162/162 (parent re-run: 162/162). Code generated by `pumbastudio`.
  - Left open from that verification: `POST /api/load` checks `busy` before two awaits and sets it after them, so two simultaneous requests are both accepted (pre-existing); `POST /api/plan` now lists variants on every call, which runs `lms ls --json` on each model or context change; the light-theme warning colour has a contrast of about 3.2:1 on white; the VRAM warning also shows when the memory is held by something the load will not free; a stored profile cannot be cleared through the API.

- [x] `T-10`: Documentation
  - Scope: `docs/PROYECTO.md`, `README.md`, `README.es.md`
  - Route: delegated direct (three non-trivial files)
  - Commits: `38479fb`, plus the parent's follow-up edit recording the selected-variant fix
  - Checks: structural readback by the writer (consistent outline, every table with equal column counts, no placeholders, every identifier found in `src/` with `rg`).
  - Corrections the documentation pass made to this document's earlier wording, where the code is the reference: the quality fallback only changes the winner rule, so `q4_0` is still never measured under `quality`; there are two fallback points, `profile.variant.noFullGpu` before measuring and `profile.fallback.noFullGpuConfig` after it; Ollama tags are grouped by base name, parameter size, family and `tagStem`; `kvTypesFor('quality')` returns the engine's full list when the engine has neither `f16` nor `q8_0`; on a `speed`/`quality` miss VRAM is freed twice (in `load`, then in `run`).

- [ ] `T-11`: Full verification
  - Scope: `npm test`, CLI smoke in `en` and `es`, manual load of each profile on the real LM Studio and Ollama
  - Route: direct inline
  - Done: `npm test` 162/162 by the parent; CLI smoke (`--help`, `--profile bogus`, `--presets`) in `en` and `es` in a temp config dir by two independent verifiers; desktop UI opened on the owner's machine against the real engines, preview only.
  - Pending, needs the owner's go-ahead: a real load with each profile. It unloads whatever model the engine has loaded (the one `pumbastudio` serves, in LM Studio) and measures for several minutes per profile. No real load has been run with `speed` or `quality` yet.

## Review record
Receipt-driven development is on (global). Reviewed boundary starts at the tracker branch point.

- Range tracker..`fab0ab1` (`T-2`, `T-3`, feature document): assessed `medium`, due (`slice_budget_reached`, 573 lines). Consent granted by the owner. One lens (`review-reliability`): approved and acknowledged, lineage `review-adda041ec2b3e469`. Five advisory findings, none blocking; the two warnings were fixed in `T-3b`. Three suggestions left open: `kvTypesFor('quality')` returns the full list when an engine has neither `f16` nor `q8_0`; `bitsPerWeight` is not asserted through the real-buffer reader test; `pickVariant` does not guard a variant with no `meta`.
- Whole branch against `main` (54 files, 9,243 lines, risk `high`), raised by the stop hook: consent granted by the owner, but START refused with `lens_context_budget_exceeded`. No review authority was created. The features that predate this one are not reviewed against `main`; they would have to be reviewed as smaller candidates. Not part of this feature. Raised again at 56 files and 9,969 lines: declined by the owner for that candidate.
- Range `fab0ab1`..`01ee498` (`T-3b`, `T-5`, `T-4`): assessed `medium`, due (`slice_budget_reached`, 559 lines). Consent granted by the owner. One lens (`review-reliability`): approved and acknowledged, lineage `review-b1259c14be70b663`. Four warnings and three suggestions, none blocking, addressed in `T-4b`.

- Range `01ee498`..`cf91f6e` (`T-4b`, `T-6`): assessed `medium`, due (`slice_budget_reached`, 989 lines). Declined by the owner for that candidate; no review record. Verification of record: the writers' reported commands plus the parent's `npm test` 120/120.

- Range `cf91f6e`..`368b047` (`T-8`, `T-8b`, CLI slice): assessed `high` (`process_boundary` in `src/cli/index.js`), due. Declined by the owner for that candidate; no review record. Because the tier is high, an independent read-only verifier ran instead: verdict "pass with findings", `npm test` 132/132, CLI smoke runs in a temp config dir, real settings file untouched. Its findings were fixed in `T-8c`. Left open: a pre-existing crash when `--lang`/`--theme` cannot be saved (`c` is used before its `const` is initialised in `src/cli/index.js`), outside this feature. The verifier's own probe started the wizard once by mistake; it ran only read-only hardware and engine detection in a temp config dir, and the owner's loaded model was confirmed still loaded afterwards.

- Range `e37cf1d`..`9483356` (`T-8c`, `T-9`, `T-9b`, desktop slice): assessed `high` (`process_boundary` in `src/cli/index.js`), due. Declined by the owner for that candidate; no review record. An independent read-only verifier ran instead: verdict "pass with findings", `npm test` 156/156, live endpoint checks against a mock with a temp config dir, real settings file untouched. Its findings that were defects are fixed in `T-9c`; the rest are listed there as left open.

## Progress
Slices 1 to 4 complete: `T-1` to `T-6`, `T-8` and `T-9` done, with their follow-ups `T-3b`, `T-4b`, `T-8b`, `T-8c` and `T-9b`. The profile can be chosen from the CLI and from the desktop UI. Running authored changed lines: about 3,260 (2,345 through `47666d4`, 228 in `74ff80e` and `655dae2`, 691 in slice 4), feature document excluded; tests are more than half of that. The original forecast of 900 to 1,200 was low by a factor of about three: it did not count the tests each task needed nor the five follow-up units that reviews and verification added. Slice 5 (`feat/load-profiles-05-docs`) adds the documentation and the `T-9c` fixes, 499 more lines (327 documentation, 172 code and tests). Every task is done except the real-load part of `T-11`, which waits for the owner. Nothing has been pushed and no pull request has been opened.
