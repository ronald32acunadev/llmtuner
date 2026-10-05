import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_TUNER_CONFIG_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-tuner-'));
const { Tuner, ENGINES } = await import('../src/core/tuner.js');
const { presetsDir, presetPath } = await import('../src/core/presets.js');
const { rankGpus } = await import('../src/core/hardware.js');

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;
const ALL_KV = ['f16', 'q8_0', 'q4_0'];
const CTX = 16384;

// Qwen2.5-Coder-32B Q4_K_M, numbers read from the real GGUF (same fixture as test/profiles.test.js).
const qwen32 = {
  arch: 'qwen2', nLayers: 64, nEmbd: 5120, nHead: 40, nHeadKv: 8, keyLen: 128, valLen: 128, vocab: 152064,
  trainContext: 32768, layerBytes: Array(64).fill((17.48 * GiB) / 64), layerExpertBytes: Array(64).fill(0),
  outputBytes: 609 * MiB, embdBytes: 417 * MiB, kvHeadsPerLayer: Array(64).fill(8), slidingWindow: null, swaLayers: [],
  nExperts: 0, nExpertsUsed: 0, isMoE: false, fileBytes: Math.round(18.48 * GiB), bitsPerWeight: 4.85,
};

// 2x RTX 5070 as seen by nvidia-smi with nothing loaded (GPU0 drives the display).
const HW = {
  cpu: { brand: 'Ryzen 7 9700X', physicalCores: 8, threads: 16 },
  ramBandwidthGBps: 45,
  gpus: rankGpus([
    { index: 0, name: 'RTX 5070', totalBytes: 12227 * MiB, usedBytes: 896 * MiB, freeBytes: 10876 * MiB, pcieGBps: 2, displayAttached: true, bandwidthGBps: 672 },
    { index: 1, name: 'RTX 5070', totalBytes: 12227 * MiB, usedBytes: 14 * MiB, freeBytes: 11761 * MiB, pcieGBps: 15.8, displayAttached: false, bandwidthGBps: 672 },
  ]),
};

// The same GPUs while another model is loaded in the engine: almost no free VRAM.
const HW_BUSY = {
  ...HW,
  gpus: rankGpus([
    { index: 0, name: 'RTX 5070', totalBytes: 12227 * MiB, usedBytes: 10851 * MiB, freeBytes: 1376 * MiB, pcieGBps: 2, displayAttached: true, bandwidthGBps: 672 },
    { index: 1, name: 'RTX 5070', totalBytes: 12227 * MiB, usedBytes: 10466 * MiB, freeBytes: 1761 * MiB, pcieGBps: 15.8, displayAttached: false, bandwidthGBps: 672 },
  ]),
};

// The same model at another weight quantization: weight bytes scale with bits per weight.
const requant = (meta, bpw) => ({
  ...meta,
  bitsPerWeight: bpw,
  layerBytes: meta.layerBytes.map((b) => b * (bpw / meta.bitsPerWeight)),
  outputBytes: meta.outputBytes * (bpw / meta.bitsPerWeight),
  embdBytes: meta.embdBytes * (bpw / meta.bitsPerWeight),
  fileBytes: Math.round(meta.fileBytes * (bpw / meta.bitsPerWeight)),
});

// On this hardware at 16K: q3 fits fully with f16 and q8_0, q4 fits fully with q8_0 and q4_0 (f16 is a
// partial offload), q6 never fits. The plan yields one candidate per KV type: `<kvType>-<gpuLayers>`.
const q3 = requant(qwen32, 3.9);
const q4 = qwen32;
const q6 = requant(qwen32, 6.56);

// A 12 GiB model: at 16K a Q8_0 requant does not fit, Q6_K and Q5_K_M do (same fixture as test/profiles.test.js).
const small = {
  ...qwen32,
  layerBytes: Array(64).fill((12 * GiB) / 64),
  outputBytes: 300 * MiB,
  embdBytes: 200 * MiB,
  fileBytes: Math.round(12.5 * GiB),
};

// Model meta per key. `m:*` are Ollama-like tags (each one loads by its own key); `fam` is an LM Studio-like
// family key whose variants (`fam@*`) cannot be loaded by key.
const METAS = { 'm:q3': q3, 'm:q4': q4, 'm:q6': q6, 'm:small': small, fam: q3, 'fam@q3': q3, 'fam@q4': q4 };
// Deep-context tokens per second the fake engine reports per KV cache type.
const TPS = { f16: 20, q8_0: 22.2, q4_0: 23.5 };

const calls = [];
const events = [];
const state = { variants: [], failFullOffload: false, hw: HW, hwAfterPrepare: null };

/** Tuner re-detects the real hardware after engine.prepare; the accessor pins the fixture so the tests do not depend on the machine. */
function pinHardware(tuner) {
  const descriptor = {
    get() { return state.hw; },
    set() {},
    configurable: true,
    enumerable: true,
  };
  Object.defineProperty(tuner, 'hw', descriptor);
  Object.defineProperty(tuner.ctx, 'hw', descriptor);
}

const fake = {
  id: 'fake',
  name: 'Fake',
  capabilities: { kvTypes: ALL_KV, cpuMoe: false, variantSelect: true },
  async detect() {
    calls.push(['detect']);
    return { installed: true };
  },
  async modelMeta(ctx, key) {
    calls.push(['modelMeta', key]);
    if (!METAS[key]) {
      throw new Error(`unknown model ${key}`);
    }
    return METAS[key];
  },
  async prepare() {
    calls.push(['prepare']);
    if (state.hwAfterPrepare !== null) {
      state.hw = state.hwAfterPrepare;
    }
  },
  async benchmark(ctx, model, candidate) {
    calls.push(['benchmark', model.key, candidate.id]);
    if (state.failFullOffload && candidate.fullOffload) {
      return { ok: false, error: 'load failed' };
    }
    return {
      ok: true,
      short: { genTps: TPS[candidate.kvType] + 3 },
      deep: { genTps: TPS[candidate.kvType] },
    };
  },
  async apply(ctx, model, candidate, opts = {}) {
    calls.push(['apply', model.key, candidate.id, !!opts.dryRun]);
    return { ok: true };
  },
  async load(ctx, model, opts) {
    calls.push(['load', model.key, opts.candidate.id]);
    return { ok: true, short: { genTps: 1 } };
  },
  async listVariants(ctx, key) {
    calls.push(['listVariants', key]);
    return state.variants.map(({ key, quant, sizeBytes, selected }) => ({
      key,
      quant,
      sizeBytes,
      selected,
    }));
  },
};

ENGINES.fake = fake;
ENGINES.bare = { ...fake, id: 'bare', listVariants: undefined };

/** Initializes state and the tuner instance for a test case. */
function setup({ engine = 'fake', variantSelect = true, variants = [], failFullOffload = false, hw = HW, hwAfterPrepare = null } = {}) {
  calls.length = 0;
  events.length = 0;
  ENGINES[engine].capabilities = { ...fake.capabilities, variantSelect };
  state.variants = variants;
  state.failFullOffload = failFullOffload;
  state.hw = hw;
  state.hwAfterPrepare = hwAfterPrepare;
  const tuner = new Tuner(engine, { installed: true }, hw);
  pinHardware(tuner);
  tuner.on('progress', (e) => events.push(e));
  return tuner;
}

/** Helper to create a variant object. */
function variant(key, quant, selected = false) {
  return { key, quant, sizeBytes: METAS[key].fileBytes, selected };
}

/** Filters calls by their first element. */
function named(name) {
  return calls.filter((c) => c[0] === name);
}

beforeEach(async () => {
  await fs.rm(presetsDir(), { recursive: true, force: true });
});

test('balanced load keeps the engine calls, events and preset file it had before profiles', async () => {
  const tuner = setup();
  const first = await tuner.load('m:q4', CTX);
  assert.deepEqual(calls, [['modelMeta', 'm:q4'], ['prepare'], ['modelMeta', 'm:q4'], ['benchmark', 'm:q4', 'q8_0-65'], ['benchmark', 'm:q4', 'q4_0-65'], ['benchmark', 'm:q4', 'f16-62'], ['apply', 'm:q4', 'q8_0-65', true], ['apply', 'm:q4', 'q8_0-65', false], ['detect'], ['load', 'm:q4', 'q8_0-65']]);
  assert.deepEqual(events.map((e) => e.type), ['status', 'status', 'status', 'plan', 'candidate-start', 'candidate-done', 'candidate-start', 'candidate-done', 'candidate-start', 'candidate-done', 'done', 'preset-saved', 'status', 'applied', 'status', 'loaded']);
  assert.deepEqual(events.filter((e) => e.type === 'status').map((e) => e.code), ['status.searchNone', 'status.engine', 'status.freeingVram', 'status.applying', 'status.loading']);
  assert.equal(first.source, 'benchmark');
  assert.equal(first.candidate.id, 'q8_0-65');
  assert.deepEqual(await fs.readdir(presetsDir()), ['fake__m_q4__16384.json']);
  const preset = JSON.parse(await fs.readFile(presetPath('fake', 'm:q4', CTX)));
  assert.deepEqual(Object.keys(preset), ['version', 'engine', 'model', 'ctx', 'profile', 'modelBytes', 'fingerprint', 'hardware', 'createdAt', 'candidate', 'bench', 'tried']);
  assert.equal(preset.profile, 'balanced');
  assert.equal(preset.candidate.id, 'q8_0-65');

  // A second load is a preset hit: nothing is measured.
  calls.length = 0;
  events.length = 0;
  const second = await tuner.load('m:q4', CTX);

  assert.deepEqual(calls, [['modelMeta', 'm:q4'], ['apply', 'm:q4', 'q8_0-65', true], ['apply', 'm:q4', 'q8_0-65', false], ['detect'], ['load', 'm:q4', 'q8_0-65']]);
  assert.equal(second.source, 'preset');
  assert.equal(events[0].type, 'preset-hit');
  assert.equal(events[0].file, presetPath('fake', 'm:q4', CTX));
  assert.deepEqual(named('listVariants'), []);
});

test('an omitted or unknown profile loads as balanced', async () => {
  for (const options of [{}, { profile: 'balanced' }, { profile: 'fastest' }, { profile: null }]) {
    await fs.rm(presetsDir(), { recursive: true, force: true });
    const tuner = setup({ variants: [variant('m:q3', 'Q3_K_M'), variant('m:q4', 'Q4_K_M', true)] });
    const result = await tuner.load('m:q4', CTX, options);
    const label = JSON.stringify(options);
    assert.equal(result.profile, 'balanced', label);
    assert.equal(result.variant, 'm:q4', label);
    assert.equal(result.candidate.id, 'q8_0-65', label);
    assert.deepEqual(named('listVariants'), [], label);
    assert.deepEqual(named('benchmark').map((c) => c[2]), ['q8_0-65', 'q4_0-65', 'f16-62'], label);
    assert.deepEqual(await fs.readdir(presetsDir()), ['fake__m_q4__16384.json'], label);
    assert.deepEqual(events.filter((e) => e.type === 'variant-picked' || e.type === 'profile-fallback'), [], label);
  }
});

test('speed measures, applies and loads the lightest variant when the engine can select variants', async () => {
  const tuner = setup({ variantSelect: true, variants: [variant('m:q3', 'Q3_K_M'), variant('m:q4', 'Q4_K_M', true)] });
  const result = await tuner.load('m:q4', CTX, { profile: 'speed' });
  assert.deepEqual(named('listVariants'), [['listVariants', 'm:q4']]);
  assert.deepEqual(named('benchmark'), [['benchmark', 'm:q3', 'q8_0-65'], ['benchmark', 'm:q3', 'f16-65'], ['benchmark', 'm:q3', 'q4_0-65']]);
  assert.deepEqual(named('apply'), [['apply', 'm:q3', 'q4_0-65', true], ['apply', 'm:q3', 'q4_0-65', false]]);
  assert.deepEqual(named('load'), [['load', 'm:q3', 'q4_0-65']]);
  const picked = events.filter((e) => e.type === 'variant-picked');
  assert.equal(picked.length, 1);
  const { type, at, ...data } = picked[0];
  assert.deepEqual(data, { profile: 'speed', variant: { key: 'm:q3', quant: 'Q3_K_M', sizeBytes: q3.fileBytes }, reasonCode: 'profile.variant.lightest', loads: 'm:q3', recommendSwitch: false });
  assert.deepEqual(events.filter((e) => e.type === 'profile-fallback'), []);
  // The preset belongs to the key the user chose, under the profile's file name.
  assert.deepEqual(await fs.readdir(presetsDir()), ['fake__m_q4__16384__speed.json']);
  assert.equal(events.find((e) => e.type === 'preset-saved').file, presetPath('fake', 'm:q4', CTX, 'speed'));
  const preset = JSON.parse(await fs.readFile(presetPath('fake', 'm:q4', CTX, 'speed'), 'utf8'));
  assert.equal(preset.profile, 'speed');
  assert.equal(preset.model, 'm:q4');
  assert.deepEqual(preset.variant, { key: 'm:q3', quant: 'Q3_K_M', sizeBytes: q3.fileBytes });
  assert.deepEqual(preset.variants, [{ key: 'm:q3', sizeBytes: q3.fileBytes }, { key: 'm:q4', sizeBytes: q4.fileBytes }]);
  assert.equal(result.profile, 'speed');
  assert.equal(result.variant, 'm:q3');
  assert.equal(result.source, 'benchmark');
  assert.equal(result.candidate.id, 'q4_0-65');
  assert.equal(result.report.profile, 'speed');
});

test('quality keeps the selected variant and recommends a better one when the engine cannot select variants', async () => {
  const tuner = setup({ variantSelect: false, variants: [variant('fam@q3', 'Q3_K_M', true), variant('fam@q4', 'Q4_K_M')] });
  const result = await tuner.load('fam', CTX, { profile: 'quality' });
  const { type, at, ...data } = events.find((e) => e.type === 'variant-picked');
  assert.deepEqual(data, { profile: 'quality', variant: { key: 'fam@q4', quant: 'Q4_K_M', sizeBytes: q4.fileBytes }, reasonCode: 'profile.variant.heaviestFit', loads: 'fam', recommendSwitch: true });
  // The key the user chose is what is measured, applied and loaded.
  assert.deepEqual(named('benchmark'), [['benchmark', 'fam', 'q8_0-65'], ['benchmark', 'fam', 'f16-65']]);
  assert.deepEqual(named('apply'), [['apply', 'fam', 'f16-65', true], ['apply', 'fam', 'f16-65', false]]);
  assert.deepEqual(named('load'), [['load', 'fam', 'f16-65']]);
  assert.equal(result.profile, 'quality');
  assert.equal(result.variant, 'fam');
  const preset = JSON.parse(await fs.readFile(presetPath('fake', 'fam', CTX, 'quality'), 'utf8'));
  assert.deepEqual(preset.variant, { key: 'fam', quant: 'Q3_K_M', sizeBytes: q3.fileBytes });

  // When the heaviest variant that fits is the selected one there is nothing to recommend.
  // The preset of the first load is removed: a preset hit announces the stored variant instead of picking.
  await fs.rm(presetsDir(), { recursive: true, force: true });
  const same = setup({ variantSelect: false, variants: [variant('fam@q3', 'Q3_K_M'), variant('fam@q4', 'Q4_K_M', true)] });
  await same.load('fam', CTX, { profile: 'quality' });
  const again = events.find((e) => e.type === 'variant-picked');
  assert.equal(again.variant.key, 'fam@q4');
  assert.equal(again.loads, 'fam');
  assert.equal(again.recommendSwitch, false);
});

test('quality never measures a q4_0 KV cache and keeps a full GPU offload', async () => {
  const tuner = setup({ variants: [variant('m:q3', 'Q3_K_M'), variant('m:q4', 'Q4_K_M', true)] });
  const result = await tuner.load('m:q4', CTX, { profile: 'quality' });
  // The heaviest variant that fits fully on GPU is measured, with the precise KV types only.
  assert.deepEqual(events.find((e) => e.type === 'plan').candidates.map((c) => c.kvType), ['q8_0', 'f16']);
  assert.deepEqual(named('benchmark'), [['benchmark', 'm:q4', 'q8_0-65'], ['benchmark', 'm:q4', 'f16-62']]);
  assert.equal(result.variant, 'm:q4');
  assert.equal(result.candidate.id, 'q8_0-65');
  assert.equal(result.candidate.fullOffload, true);
  assert.equal(result.report.profile, 'quality');
  assert.deepEqual(events.filter((e) => e.type === 'profile-fallback'), []);
});

test('quality falls back and says why when nothing stays fully on GPU', async () => {
  const fallbacks = () => events.filter((e) => e.type === 'profile-fallback').map(({ profile, reasonCode, variant }) => ({ profile, reasonCode, variant }));
  const pickedVariant = () => events.find((e) => e.type === 'variant-picked')?.variant;
  // No downloaded variant fits: the fallback is known before measuring and is reported once.
  let tuner = setup({ variants: [variant('m:q6', 'Q6_K', true)] });
  let result = await tuner.load('m:q6', CTX, { profile: 'quality' });
  assert.deepEqual(fallbacks(), [{ profile: 'quality', reasonCode: 'profile.variant.noFullGpu', variant: { key: 'm:q6', quant: 'Q6_K', sizeBytes: q6.fileBytes } }]);
  // A fallback event is self-contained: it carries the variant the variant line announced.
  assert.deepEqual(fallbacks()[0].variant, pickedVariant());
  assert.equal(result.variant, 'm:q6');
  assert.equal(result.candidate.id, 'q8_0-52');

  // The variant fits on paper but its full offload fails for real: the fallback is known after measuring.
  tuner = setup({ variants: [variant('m:q4', 'Q4_K_M', true)], failFullOffload: true });
  result = await tuner.load('m:q4', CTX, { profile: 'quality' });
  assert.deepEqual(fallbacks(), [{ profile: 'quality', reasonCode: 'profile.fallback.noFullGpuConfig', variant: { key: 'm:q4', quant: 'Q4_K_M', sizeBytes: q4.fileBytes } }]);
  assert.deepEqual(fallbacks()[0].variant, pickedVariant());
  assert.equal(result.candidate.id, 'f16-62');
});

test('quality picks the variant after freeing VRAM, not with the hardware seen before', async () => {
  const tuner = setup({ variantSelect: true, hw: HW_BUSY, hwAfterPrepare: HW, variants: [variant('m:q3', 'Q3_K_M', true), variant('m:q4', 'Q4_K_M')] });
  let preparedAtPick = null;
  tuner.on('progress', (e) => {
    if (e.type === 'variant-picked') {
      preparedAtPick = named('prepare').length;
    }
  });
  const result = await tuner.load('m:q3', CTX, { profile: 'quality' });
  // The engine's models are unloaded before the variant is picked.
  assert.equal(preparedAtPick, 1);
  assert.deepEqual(events.slice(0, 3).map((e) => e.code ?? e.type), ['status.searchNone', 'status.freeingVram', 'variant-picked']);
  // With the VRAM free the heavier variant fits fully on GPU, so it is the one measured and loaded.
  const picked = events.filter((e) => e.type === 'variant-picked');
  assert.equal(picked.length, 1);
  assert.equal(picked[0].reasonCode, 'profile.variant.heaviestFit');
  assert.equal(picked[0].variant.key, 'm:q4');
  assert.equal(picked[0].loads, 'm:q4');
  assert.deepEqual(events.filter((e) => e.type === 'profile-fallback'), []);
  assert.deepEqual(named('benchmark').map((c) => c[1]), ['m:q4', 'm:q4']);
  assert.deepEqual(named('load'), [['load', 'm:q4', 'q8_0-65']]);
  assert.equal(result.variant, 'm:q4');
  assert.equal(result.source, 'benchmark');
});

test('a profile preset hit loads the stored variant without freeing VRAM or picking again', async () => {
  const options = { variantSelect: true, hw: HW_BUSY, hwAfterPrepare: HW, variants: [variant('m:q3', 'Q3_K_M', true), variant('m:q4', 'Q4_K_M')] };
  await setup(options).load('m:q3', CTX, { profile: 'quality' });
  // The model is loaded now, so the free VRAM is low again: picking here would fall back to the selected variant.
  const tuner = setup(options);
  const hit = await tuner.load('m:q3', CTX, { profile: 'quality' });
  assert.equal(hit.source, 'preset');
  assert.equal(hit.variant, 'm:q4');
  assert.deepEqual(named('prepare'), []);
  assert.deepEqual(named('benchmark'), []);
  assert.deepEqual(named('load'), [['load', 'm:q4', 'q8_0-65']]);
  const picked = events.filter((e) => e.type === 'variant-picked');
  assert.equal(picked.length, 1);
  const { type, at, ...data } = picked[0];
  assert.deepEqual(data, { profile: 'quality', variant: { key: 'm:q4', quant: 'Q4_K_M', sizeBytes: q4.fileBytes }, reasonCode: 'profile.variant.preset', loads: 'm:q4', recommendSwitch: false });
  assert.deepEqual(events.filter((e) => e.type === 'profile-fallback'), []);
  assert.deepEqual(events.map((e) => e.type).slice(0, 2), ['preset-hit', 'variant-picked']);
});

test('a profile preset is reused until the downloaded variants change', async () => {
  let tuner = setup({ variants: [variant('m:q3', 'Q3_K_M'), variant('m:q4', 'Q4_K_M', true)] });
  await tuner.load('m:q4', CTX, { profile: 'speed' });
  calls.length = 0;
  events.length = 0;
  const hit = await tuner.load('m:q4', CTX, { profile: 'speed' });
  assert.equal(hit.source, 'preset');
  assert.equal(hit.profile, 'speed');
  assert.equal(hit.variant, 'm:q3');
  assert.deepEqual(named('prepare'), []);
  assert.deepEqual(named('benchmark'), []);
  // The variant stored in the preset is the one applied and loaded.
  assert.deepEqual(named('apply'), [['apply', 'm:q3', 'q4_0-65', true], ['apply', 'm:q3', 'q4_0-65', false]]);
  assert.deepEqual(named('load'), [['load', 'm:q3', 'q4_0-65']]);
  assert.equal(events.find((e) => e.type === 'preset-hit').file, presetPath('fake', 'm:q4', CTX, 'speed'));

  // Removing a downloaded variant makes the profile measure again.
  tuner = setup({ variants: [variant('m:q4', 'Q4_K_M', true)] });
  const again = await tuner.load('m:q4', CTX, { profile: 'speed' });
  assert.equal(again.source, 'benchmark');
  assert.equal(events.find((e) => e.type === 'status').code, 'status.searchVariants');
  assert.deepEqual(named('benchmark').map((c) => c[1]), ['m:q4', 'm:q4', 'm:q4']);
  assert.equal(again.variant, 'm:q4');
});

test('profilePlan summarizes every profile without measuring', async () => {
  const tuner = setup({ variantSelect: true, variants: [variant('m:q3', 'Q3_K_M'), variant('m:q4', 'Q4_K_M', true)] });
  const plan = await tuner.profilePlan('m:q4', CTX);
  assert.deepEqual(plan.variants, [
    { key: 'm:q3', quant: 'Q3_K_M', sizeBytes: q3.fileBytes, selected: false, bitsPerWeight: 3.9 },
    { key: 'm:q4', quant: 'Q4_K_M', sizeBytes: q4.fileBytes, selected: true, bitsPerWeight: 4.85 },
  ]);
  assert.equal(plan.variantSelect, true);
  assert.deepEqual(plan.recommended, { profile: 'quality', reasonCode: 'profile.recommend.qualityFits' });
  assert.deepEqual(plan.profiles, {
    speed: { variant: 'm:q3', quant: 'Q3_K_M', reasonCode: 'profile.variant.lightest', fallback: false, kvTypes: ['f16', 'q8_0', 'q4_0'], loads: 'm:q3', recommendSwitch: false },
    balanced: { variant: 'm:q4', quant: 'Q4_K_M', reasonCode: 'profile.variant.selected', fallback: false, kvTypes: ['f16', 'q8_0', 'q4_0'], loads: 'm:q4', recommendSwitch: false },
    quality: { variant: 'm:q4', quant: 'Q4_K_M', reasonCode: 'profile.variant.heaviestFit', fallback: false, kvTypes: ['f16', 'q8_0'], loads: 'm:q4', recommendSwitch: false },
  });
  assert.deepEqual(plan.hints, []);
  for (const name of ['prepare', 'benchmark', 'apply', 'load', 'detect']) assert.deepEqual(named(name), [], name);
  assert.deepEqual(events, []);

  // An engine that cannot select variants always loads the selected one and only recommends.
  const fixed = setup({ variantSelect: false, variants: [variant('fam@q3', 'Q3_K_M', true), variant('fam@q4', 'Q4_K_M')] });
  const recommended = await fixed.profilePlan('fam', CTX);
  assert.equal(recommended.variantSelect, false);
  assert.deepEqual(recommended.profiles.speed, { variant: 'fam@q3', quant: 'Q3_K_M', reasonCode: 'profile.variant.lightest', fallback: false, kvTypes: ['f16', 'q8_0', 'q4_0'], loads: 'fam@q3', recommendSwitch: false });
  assert.deepEqual(recommended.profiles.quality, { variant: 'fam@q4', quant: 'Q4_K_M', reasonCode: 'profile.variant.heaviestFit', fallback: false, kvTypes: ['f16', 'q8_0'], loads: 'fam@q3', recommendSwitch: true });

  // Heavier quantizations that are not downloaded and would fit are hinted; downloaded ones are not.
  const hinted = setup({ variants: [variant('m:small', 'Q4_K_M', true)] });
  assert.deepEqual((await hinted.profilePlan('m:small', CTX)).hints.map((h) => h.quant), ['Q6_K', 'Q5_K_M']);
  const downloaded = setup({ variants: [variant('m:small', 'Q4_K_M', true), variant('m:q6', 'Q6_K')] });
  assert.deepEqual((await downloaded.profilePlan('m:small', CTX)).hints.map((h) => h.quant), ['Q5_K_M']);
  assert.deepEqual(named('benchmark'), []);
});

test('profilePlan flags a conservative preview when VRAM is in use', async () => {
  const variants = [variant('m:q3', 'Q3_K_M'), variant('m:q4', 'Q4_K_M', true)];
  const idle = await setup({ variants }).profilePlan('m:q4', CTX);
  assert.equal(idle.vramBusy, false);

  // Another model is loaded: the plan is made with the little VRAM that is free, and says so.
  const busy = await setup({ variants, hw: HW_BUSY }).profilePlan('m:q4', CTX);
  assert.equal(busy.vramBusy, true);
  assert.deepEqual(busy.recommended, { profile: 'speed', reasonCode: 'profile.recommend.partialOffload' });

  // The preview still does not unload or measure.
  for (const name of ['prepare', 'benchmark', 'apply', 'load']) assert.deepEqual(named(name), [], name);
  assert.deepEqual(events, []);
});

test('variants lists each downloaded variant with its meta and always includes the chosen key', async () => {
  const tuner = setup({ variants: [variant('m:q3', 'Q3_K_M'), variant('m:q4', 'Q4_K_M', true)] });
  assert.deepEqual(await tuner.variants('m:q4'), [
    { key: 'm:q3', quant: 'Q3_K_M', sizeBytes: q3.fileBytes, selected: false, meta: q3 },
    { key: 'm:q4', quant: 'Q4_K_M', sizeBytes: q4.fileBytes, selected: true, meta: q4 },
  ]);
  // A variant whose file cannot be read is skipped.
  const ghost = { key: 'm:ghost', quant: 'Q8_0', sizeBytes: 1, selected: false };
  state.variants = [ghost, variant('m:q4', 'Q4_K_M', true)];
  assert.deepEqual((await tuner.variants('m:q4')).map((v) => v.key), ['m:q4']);

  // Nothing listed, nothing readable, or an engine that cannot list variants: the chosen key alone.
  const alone = [{ key: 'm:q4', quant: null, sizeBytes: q4.fileBytes, selected: true, meta: q4 }];
  state.variants = [];
  assert.deepEqual(await tuner.variants('m:q4'), alone);
  state.variants = [ghost];
  assert.deepEqual(await tuner.variants('m:q4'), alone);
  const bare = setup({ engine: 'bare' });
  assert.deepEqual(await bare.variants('m:q4'), alone);
  const result = await bare.load('m:q4', CTX, { profile: 'speed' });
  assert.equal(result.variant, 'm:q4');
  assert.equal(result.candidate.id, 'q4_0-65');
  assert.deepEqual(named('listVariants'), []);
});
