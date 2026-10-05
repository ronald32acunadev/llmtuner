import { EventEmitter } from 'node:events';
import { detectHardware } from './hardware.js';
import { planCandidates, maxFullOffloadContext } from './estimator.js';
import { findPreset, savePreset, presetPath } from './presets.js';
import { PROFILES, DEFAULT_PROFILE, normalizeProfile, kvTypesFor, meetsQuality, pickBest, pickVariant, recommendProfile, variantHints } from './profiles.js';
import { lmstudio } from './engines/lmstudio.js';
import { ollama } from './engines/ollama.js';
import { TunerError, benchError } from './errors.js';

export { pickBest };
export const ENGINES = { lmstudio, ollama };

/** Detect both engines and recommend one. */
export async function detectEngines(hw) {
  const out = [];
  for (const e of Object.values(ENGINES)) {
    let detection;
    try { detection = await e.detect(); } catch (err) { detection = { installed: false, error: String(err.message || err) }; }
    out.push({ id: e.id, name: e.name, detection });
  }
  const installed = out.filter((e) => e.detection.installed);
  let recommended = null;
  let reasonCode;
  let reasonParams = {};
  if (installed.length === 1) {
    recommended = installed[0].id;
    reasonCode = 'engine.reason.onlyInstalled';
    reasonParams = { name: installed[0].name };
  } else if (installed.length === 2) {
    // LM Studio lets us fix KV type and GPU order per model and benchmarks the exact
    // binary it will run; Ollama makes those server-wide. Prefer LM Studio for multi-GPU.
    const multiGpu = (hw?.gpus?.length || 0) > 1;
    recommended = multiGpu ? 'lmstudio' : 'ollama';
    reasonCode = multiGpu ? 'engine.reason.multiGpu' : 'engine.reason.singleGpu';
  } else {
    recommended = (hw?.gpus?.length || 0) > 1 ? 'lmstudio' : 'ollama';
    reasonCode = 'engine.reason.noneInstalled';
  }
  return { engines: out, recommended, reasonCode, reasonParams };
}

export class Tuner extends EventEmitter {
  constructor(engineId, detection, hw) {
    super();
    this.engine = ENGINES[engineId];
    if (!this.engine) throw new TunerError('errors.unknownEngine', { engine: engineId });
    this.ctx = { detection, hw };
    this.hw = hw;
  }

  static async create(engineId) {
    if (!ENGINES[engineId]) throw new TunerError('errors.unknownEngine', { engine: engineId });
    const hw = await detectHardware();
    const detection = await ENGINES[engineId].detect();
    return new Tuner(engineId, detection, hw);
  }

  log(type, data = {}) { this.emit('progress', { type, ...data, at: Date.now() }); }

  listModels() { return this.engine.listModels(this.ctx); }

  async modelInfo(key) {
    const meta = await this.engine.modelMeta(this.ctx, key);
    return { key, meta };
  }

  chat(model, messages) {
    return this.engine.chat(this.ctx, model, messages);
  }

  /** Downloaded variants of a model with their metadata; never empty: at least the chosen key itself. */
  async variants(key) {
    const listed = (await this.engine.listVariants?.(this.ctx, key)) ?? [];
    const out = [];
    for (const item of listed) {
      try {
        const meta = await this.engine.modelMeta(this.ctx, item.key);
        out.push({ key: item.key, quant: item.quant, sizeBytes: item.sizeBytes, selected: item.selected, meta });
      } catch {
        // A variant whose file cannot be read is not a candidate.
      }
    }
    if (out.length > 0) {
      return out;
    }
    const { meta } = await this.modelInfo(key);
    return [{ key, quant: null, sizeBytes: meta.fileBytes, selected: true, meta }];
  }

  /** What each profile would load for a model and context, without measuring or unloading anything. */
  async profilePlan(key, ctx) {
    const variants = await this.variants(key);
    const { kvTypes } = this.engine.capabilities;
    const variantSelect = !!this.engine.capabilities.variantSelect;
    const selected = variants.find((v) => v.selected) ?? variants[0];
    const opts = { ctx, kvTypes };
    const profiles = {};
    // An engine that cannot select variants loads the selected one and only recommends the pick.
    for (const profile of PROFILES) {
      const pick = pickVariant(profile, variants, this.hw, opts);
      profiles[profile] = {
        variant: pick.variant.key,
        quant: pick.variant.quant,
        reasonCode: pick.reasonCode,
        fallback: pick.fallback,
        kvTypes: kvTypesFor(profile, kvTypes),
        loads: variantSelect ? pick.variant.key : selected.key,
        recommendSwitch: !variantSelect && pick.variant.key !== selected.key,
      };
    }
    return {
      variants: variants.map((v) => ({ key: v.key, quant: v.quant, sizeBytes: v.sizeBytes, selected: v.selected, bitsPerWeight: v.meta.bitsPerWeight ?? null })),
      variantSelect,
      recommended: recommendProfile(variants, this.hw, opts),
      profiles,
      hints: variantHints(selected.meta, this.hw, { ...opts, downloadedQuants: variants.map((v) => v.quant).filter(Boolean) }),
    };
  }

  /** Resolve what a non-balanced profile measures and loads, and announce the picked variant. */
  async profileTarget(key, ctx, profile, model) {
    const variants = await this.variants(key);
    const { kvTypes } = this.engine.capabilities;
    const canSelect = !!this.engine.capabilities.variantSelect;
    const pick = pickVariant(profile, variants, this.hw, { ctx, kvTypes });
    const selected = variants.find((v) => v.selected);

    // An engine that cannot select variants always loads the one selected in the engine, under the chosen key.
    const targetKey = canSelect ? pick.variant.key : key;
    const loaded = canSelect ? pick.variant : (selected ?? { quant: null, sizeBytes: model.meta.fileBytes });

    this.log('variant-picked', {
      profile,
      variant: {
        key: pick.variant.key,
        quant: pick.variant.quant,
        sizeBytes: pick.variant.sizeBytes,
      },
      reasonCode: pick.reasonCode,
      loads: targetKey,
      recommendSwitch: !canSelect && pick.variant.key !== (selected?.key ?? key),
    });

    if (pick.fallback) {
      this.log('profile-fallback', { profile, reasonCode: pick.reasonCode });
    }

    return {
      key: targetKey,
      canSelect,
      fallback: pick.fallback,
      variant: { key: targetKey, quant: loaded.quant, sizeBytes: loaded.sizeBytes },
      listed: variants.map(({ key, sizeBytes }) => ({ key, sizeBytes })),
      metas: new Map(variants.map((v) => [v.key, v.meta])),
    };
  }

  /**
   * Estimate candidates for a context length. With `unload`, the engine's loaded
   * models are unloaded first so the free-VRAM snapshot is realistic.
   * The profile restricts the KV cache types.
   */
  async plan(key, ctx, { unload = false, profile = DEFAULT_PROFILE } = {}) {
    if (unload) {
      this.log('status', { code: 'status.freeingVram' });
      await this.engine.prepare(this.ctx);
      this.hw = this.ctx.hw = await detectHardware();
    }
    const model = await this.modelInfo(key);
    const engineKvTypes = this.engine.capabilities.kvTypes;
    // The profile restricts the KV cache types that are planned; the context limits cover every engine type.
    const kvTypes = kvTypesFor(normalizeProfile(profile), engineKvTypes);
    const candidates = planCandidates(model.meta, this.hw, { ctx, kvTypes, allowCpuMoe: this.engine.capabilities.cpuMoe });
    const maxContext = Object.fromEntries(engineKvTypes.map((k) => [k, maxFullOffloadContext(model.meta, this.hw, k)]));
    return { model, candidates, maxContext, hw: this.hw };
  }

  /** Estimate, benchmark the top candidates for real, and return a report. The profile decides the winner. */
  async run(key, ctx, { maxCandidates = 3, depthFraction = 0.5, genTokens = 200, profile: requested = DEFAULT_PROFILE } = {}) {
    const profile = normalizeProfile(requested);
    this.log('status', { code: 'status.engine', params: { name: this.engine.name } });
    const { model, candidates, maxContext } = await this.plan(key, ctx, { unload: true, profile });
    const model2 = { key, meta: model.meta };
    const toTest = candidates.slice(0, maxCandidates);
    this.log('plan', { candidates: toTest.map(slim), maxContext });

    const depthTokens = Math.floor(ctx * depthFraction);
    const results = [];
    for (const [i, c] of toTest.entries()) {
      this.log('candidate-start', { index: i, total: toTest.length, candidate: slim(c) });
      let bench;
      try {
        bench = await this.engine.benchmark(this.ctx, model2, c, {
          depthTokens, genTokens,
          onProgress: (p) => this.log('bench-progress', { index: i, ...p }),
        });
      } catch (err) {
        bench = err?.name === 'TunerError' ? benchError(err.code, err.params) : { ok: false, error: String(err.message || err) };
      }
      results.push({ candidate: c, bench });
      this.log('candidate-done', { index: i, candidate: slim(c), bench });
    }
    const best = pickBest(results, profile);
    const report = { engine: this.engine.id, model: key, ctx, profile, hw: this.hw, maxContext, results: results.map((r) => ({ candidate: slim(r.candidate), bench: r.bench })), best: best ? { candidate: best.candidate, bench: best.bench } : null };
    this.log('done', { best: report.best && { candidate: slim(best.candidate), bench: best.bench } });
    this.lastReport = { ...report, modelObj: model2 };
    return report;
  }

  /**
   * Main flow behind the "Load" button:
   * preset for (model, ctx, hardware, profile)? -> apply + load.
   * Otherwise benchmark -> save preset -> apply + load.
   * Balanced measures and loads the key the user chose; speed and quality resolve a variant first.
   */
  async load(key, ctx, { force = false, dryRun = false, maxCandidates = 3, depthFraction = 0.5, measure = true, confirmApply = async () => true, profile: requested = DEFAULT_PROFILE } = {}) {
    const profile = normalizeProfile(requested);
    const model = await this.modelInfo(key);
    const modelBytes = model.meta.fileBytes;
    const target = profile === DEFAULT_PROFILE ? null : await this.profileTarget(key, ctx, profile, model);
    // A profile preset is keyed by the key the user chose plus the profile, and goes stale with the variant list.
    const keyed = target ? { profile, variants: target.listed } : {};
    let loadKey = target ? target.key : key;
    let source = 'preset';
    let candidate;
    let report = null;
    let found = force ? { preset: null, reason: 'forced' } : await findPreset({ engine: this.engine.id, modelKey: key, ctx, hw: this.hw, modelBytes, ...keyed });

    if (found.preset) {
      candidate = found.preset.candidate;
      // The preset remembers which variant it measured.
      if (target?.canSelect) loadKey = found.preset.variant?.key ?? key;
      this.log('preset-hit', { preset: found.preset, file: presetPath(this.engine.id, key, ctx, profile) });
    } else {
      source = 'benchmark';
      const code = { none: 'status.searchNone', hardware: 'status.searchHardware', model: 'status.searchModel', forced: 'status.searchForced', variants: 'status.searchVariants' }[found.reason];
      this.log('status', { code });
      report = await this.run(loadKey, ctx, { maxCandidates, depthFraction, profile });
      if (!report.best) throw new TunerError('errors.noConfigWorked');
      candidate = report.best.candidate;
      // Quality found no configuration that keeps its promise: say so once.
      if (profile === 'quality' && !target.fallback && !meetsQuality(candidate)) this.log('profile-fallback', { profile, reasonCode: 'profile.fallback.noFullGpuConfig' });
      if (!dryRun) {
        const saved = await savePreset({ engine: this.engine.id, modelKey: key, ctx, hw: this.hw, modelBytes, best: report.best, results: this.lastReport.results, ...(target ? { profile, variant: target.variant, variants: target.listed } : {}) });
        this.log('preset-saved', { file: saved.file, preset: saved.preset });
      }
    }

    // The variant a profile picked is applied and loaded with its own metadata.
    const meta = loadKey === key ? model.meta : target.metas.get(loadKey) ?? (await this.modelInfo(loadKey)).meta;
    const modelObj = { key: loadKey, meta };
    const preview = await this.engine.apply(this.ctx, modelObj, candidate, { dryRun: true });
    if (dryRun) return { source, candidate: slim(candidate), report, preview, profile, variant: loadKey };
    if (!(await confirmApply(preview))) return { source, candidate: slim(candidate), report, preview, applied: false, profile, variant: loadKey };

    this.log('status', { code: 'status.applying' });
    const applied = await this.engine.apply(this.ctx, modelObj, candidate, { useSudo: true, skipIfApplied: source === 'preset' });
    this.log('applied', { result: applied });
    if (applied.pendingCommands?.length) return { source, candidate: slim(candidate), report, applied, loaded: null, profile, variant: loadKey };

    this.log('status', { code: 'status.loading' });
    this.ctx.detection = await this.engine.detect();
    const loaded = await this.engine.load(this.ctx, modelObj, { candidate, depthTokens: 0, genTokens: measure ? 200 : 1, onProgress: (p) => this.log('bench-progress', p) });
    this.log('loaded', { bench: loaded });
    return { source, candidate: slim(candidate), report, applied, loaded, profile, variant: loadKey };
  }
}

/** Candidate without the bulky placement internals, for UIs and logs. */
export function slim(c) {
  const { placement, score, ...rest } = c;
  return { ...rest, kvBytes: placement?.kvBytes, layersPerGpu: placement?.layersPerGpu };
}
