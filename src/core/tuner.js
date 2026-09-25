import { EventEmitter } from 'node:events';
import { detectHardware } from './hardware.js';
import { planCandidates, maxFullOffloadContext, KV_TYPES } from './estimator.js';
import { findPreset, savePreset, presetPath } from './presets.js';
import { lmstudio } from './engines/lmstudio.js';
import { ollama } from './engines/ollama.js';

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
  let reason = '';
  if (installed.length === 1) {
    recommended = installed[0].id;
    reason = `${installed[0].name} es el único instalado.`;
  } else if (installed.length === 2) {
    // LM Studio lets us fix KV type and GPU order per model and benchmarks the exact
    // binary it will run; Ollama makes those server-wide. Prefer LM Studio for multi-GPU.
    const multiGpu = (hw?.gpus?.length || 0) > 1;
    recommended = multiGpu ? 'lmstudio' : 'ollama';
    reason = multiGpu
      ? 'Tienes varias GPUs: LM Studio permite fijar el orden de GPUs y el tipo de KV por modelo.'
      : 'Con una sola GPU ambos rinden igual; Ollama es más ligero y funciona como servicio.';
  } else {
    recommended = (hw?.gpus?.length || 0) > 1 ? 'lmstudio' : 'ollama';
    reason = 'No hay ningún motor instalado; se puede instalar automáticamente.';
  }
  return { engines: out, recommended, reason };
}

/** Pick the winner: fastest deep-context decode, weighted by KV quality. */
export function pickBest(results) {
  const ok = results.filter((r) => r.bench?.ok);
  const score = (r) => (r.bench.deep?.genTps ?? r.bench.short.genTps) * KV_TYPES[r.candidate.kvType].quality;
  return ok.sort((a, b) => score(b) - score(a))[0] || null;
}

export class Tuner extends EventEmitter {
  constructor(engineId, detection, hw) {
    super();
    this.engine = ENGINES[engineId];
    if (!this.engine) throw new Error(`Motor desconocido: ${engineId}`);
    this.ctx = { detection, hw };
    this.hw = hw;
  }

  static async create(engineId) {
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

  /**
   * Estimate candidates for a context length. With `unload`, the engine's loaded
   * models are unloaded first so the free-VRAM snapshot is realistic.
   */
  async plan(key, ctx, { unload = false } = {}) {
    if (unload) {
      this.log('status', { message: 'Liberando VRAM (descargando modelos cargados)…' });
      await this.engine.prepare(this.ctx);
      this.hw = this.ctx.hw = await detectHardware();
    }
    const model = await this.modelInfo(key);
    const kvTypes = this.engine.capabilities.kvTypes;
    const candidates = planCandidates(model.meta, this.hw, { ctx, kvTypes, allowCpuMoe: this.engine.capabilities.cpuMoe });
    const maxContext = Object.fromEntries(kvTypes.map((k) => [k, maxFullOffloadContext(model.meta, this.hw, k)]));
    return { model, candidates, maxContext, hw: this.hw };
  }

  /** Estimate, benchmark the top candidates for real, and return a report. */
  async run(key, ctx, { maxCandidates = 3, depthFraction = 0.5, genTokens = 200 } = {}) {
    this.log('status', { message: `Motor: ${this.engine.name}` });
    const { model, candidates, maxContext } = await this.plan(key, ctx, { unload: true });
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
        bench = { ok: false, error: String(err.message || err) };
      }
      results.push({ candidate: c, bench });
      this.log('candidate-done', { index: i, candidate: slim(c), bench });
    }
    const best = pickBest(results);
    const report = { engine: this.engine.id, model: key, ctx, hw: this.hw, maxContext, results: results.map((r) => ({ candidate: slim(r.candidate), bench: r.bench })), best: best ? { candidate: best.candidate, bench: best.bench } : null };
    this.log('done', { best: report.best && { candidate: slim(best.candidate), bench: best.bench } });
    this.lastReport = { ...report, modelObj: model2 };
    return report;
  }

  /**
   * Main flow behind the "Cargar" button:
   * preset for (model, ctx, hardware)? -> apply + load.
   * Otherwise benchmark -> save preset -> apply + load.
   */
  async load(key, ctx, { force = false, dryRun = false, maxCandidates = 3, depthFraction = 0.5, measure = true, confirmApply = async () => true } = {}) {
    const model = await this.modelInfo(key);
    const modelBytes = model.meta.fileBytes;
    let source = 'preset';
    let candidate;
    let report = null;
    let found = force ? { preset: null, reason: 'forced' } : await findPreset({ engine: this.engine.id, modelKey: key, ctx, hw: this.hw, modelBytes });

    if (found.preset) {
      candidate = found.preset.candidate;
      this.log('preset-hit', { preset: found.preset, file: presetPath(this.engine.id, key, ctx) });
    } else {
      source = 'benchmark';
      const why = { none: 'No hay preset para este contexto', hardware: 'El hardware cambió desde el último preset', model: 'El archivo del modelo cambió', forced: 'Nueva medición solicitada' }[found.reason];
      this.log('status', { message: `${why}: buscando la mejor configuración…` });
      report = await this.run(key, ctx, { maxCandidates, depthFraction });
      if (!report.best) throw new Error('Ninguna configuración funcionó con este contexto. Prueba con uno menor.');
      candidate = report.best.candidate;
      if (!dryRun) {
        const saved = await savePreset({ engine: this.engine.id, modelKey: key, ctx, hw: this.hw, modelBytes, best: report.best, results: this.lastReport.results });
        this.log('preset-saved', { file: saved.file, preset: saved.preset });
      }
    }

    const modelObj = { key, meta: model.meta };
    const preview = await this.engine.apply(this.ctx, modelObj, candidate, { dryRun: true });
    if (dryRun) return { source, candidate: slim(candidate), report, preview };
    if (!(await confirmApply(preview))) return { source, candidate: slim(candidate), report, preview, applied: false };

    this.log('status', { message: 'Aplicando configuración…' });
    const applied = await this.engine.apply(this.ctx, modelObj, candidate, { useSudo: true, skipIfApplied: source === 'preset' });
    this.log('applied', { result: applied });
    if (applied.pendingCommands?.length) return { source, candidate: slim(candidate), report, applied, loaded: null };

    this.log('status', { message: 'Cargando el modelo…' });
    this.ctx.detection = await this.engine.detect();
    const loaded = await this.engine.load(this.ctx, modelObj, { candidate, depthTokens: 0, genTokens: measure ? 200 : 1, onProgress: (p) => this.log('bench-progress', p) });
    this.log('loaded', { bench: loaded });
    return { source, candidate: slim(candidate), report, applied, loaded };
  }
}

/** Candidate without the bulky placement internals, for UIs and logs. */
export function slim(c) {
  const { placement, score, ...rest } = c;
  return { ...rest, kvBytes: placement?.kvBytes, layersPerGpu: placement?.layersPerGpu };
}
