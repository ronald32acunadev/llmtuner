import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KV_TYPES } from '../src/core/estimator.js';
import { rankGpus } from '../src/core/hardware.js';
import { PROFILES, DEFAULT_PROFILE, normalizeProfile, QUALITY_KV_TYPES, kvTypesFor, meetsQuality, pickBest, fitsFullyOnGpu, pickVariant, recommendProfile, HINT_TARGETS, variantHints } from '../src/core/profiles.js';

const MiB = 1024 ** 2;
const GiB = 1024 ** 3;
const ALL_KV = ['f16', 'q8_0', 'q4_0'];

// Qwen2.5-Coder-32B Q4_K_M, numbers read from the real GGUF (same fixture as test/core.test.js).
const qwen32 = {
  arch: 'qwen2', nLayers: 64, nEmbd: 5120, nHead: 40, nHeadKv: 8, keyLen: 128, valLen: 128, vocab: 152064,
  trainContext: 32768, layerBytes: Array(64).fill((17.48 * GiB) / 64), layerExpertBytes: Array(64).fill(0),
  outputBytes: 609 * MiB, embdBytes: 417 * MiB, kvHeadsPerLayer: Array(64).fill(8), slidingWindow: null, swaLayers: [],
  nExperts: 0, nExpertsUsed: 0, isMoE: false, fileBytes: Math.round(18.48 * GiB), bitsPerWeight: 4.85,
};

// 2x RTX 5070 as seen by nvidia-smi with nothing loaded (GPU0 drives the display).
const hw = {
  cpu: { physicalCores: 8, threads: 16 },
  ramBandwidthGBps: 45,
  gpus: rankGpus([
    { index: 0, name: 'RTX 5070', totalBytes: 12227 * MiB, usedBytes: 896 * MiB, freeBytes: 10876 * MiB, pcieGBps: 2, displayAttached: true, bandwidthGBps: 672 },
    { index: 1, name: 'RTX 5070', totalBytes: 12227 * MiB, usedBytes: 14 * MiB, freeBytes: 11761 * MiB, pcieGBps: 15.8, displayAttached: false, bandwidthGBps: 672 },
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

// On this hardware: q3 fits fully with f16/q8_0 at 16K and with q8_0 at 32K; q4 fits with q8_0 at 16K
// and only with q4_0 at 32K; q6 never fits.
const q3 = requant(qwen32, 3.9);
const q4 = qwen32;
const q6 = requant(qwen32, 6.56);
const variant = (key, meta, selected = false) => ({ key, meta, selected });

// A 12 GiB model: at 16K a Q8_0 requant does not fit, Q6_K and Q5_K_M do.
const small = {
  ...qwen32,
  layerBytes: Array(64).fill((12 * GiB) / 64),
  outputBytes: 300 * MiB,
  embdBytes: 200 * MiB,
  fileBytes: Math.round(12.5 * GiB),
};

const mk = (kvType, deep, { ok = true, fullOffload = true, cpuMoeLayers = 0, short = 25 } = {}) => ({
  candidate: { kvType, fullOffload, cpuMoeLayers },
  bench: {
    ok,
    short: { genTps: short },
    deep: deep == null ? undefined : { genTps: deep },
  },
});

// The scoring pickBest had in src/core/tuner.js before profiles existed.
const legacyPickBest = (results) => {
  const ok = results.filter((r) => r.bench?.ok);
  const score = (r) => (r.bench.deep?.genTps ?? r.bench.short.genTps) * KV_TYPES[r.candidate.kvType].quality;
  return ok.sort((a, b) => score(b) - score(a))[0] || null;
};

test('profiles: constants and normalizeProfile', () => {
  assert.deepEqual(PROFILES, ['speed', 'balanced', 'quality']);
  assert.equal(Object.isFrozen(PROFILES), true);
  assert.equal(DEFAULT_PROFILE, 'balanced');
  assert.deepEqual(QUALITY_KV_TYPES, ['f16', 'q8_0']);
  assert.equal(Object.isFrozen(QUALITY_KV_TYPES), true);
  for (const [input, expected] of [['speed', 'speed'], ['balanced', 'balanced'], ['quality', 'quality'], [undefined, 'balanced'], [null, 'balanced'], ['fast', 'balanced'], ['QUALITY', 'balanced']]) {
    assert.equal(normalizeProfile(input), expected);
  }
});

test('kvTypesFor restricts only the quality profile', () => {
  assert.deepEqual(kvTypesFor('quality', ALL_KV), ['f16', 'q8_0']);
  assert.deepEqual(kvTypesFor('quality', ['q8_0', 'q4_0', 'f16']), ['q8_0', 'f16']);
  const only = ['q4_0'];
  assert.equal(kvTypesFor('quality', only), only);
  assert.equal(kvTypesFor('speed', ALL_KV), ALL_KV);
  assert.equal(kvTypesFor('balanced', ALL_KV), ALL_KV);
});

test('meetsQuality needs a full GPU offload and a precise KV cache', () => {
  for (const [candidate, expected] of [[{ fullOffload: true, cpuMoeLayers: 0, kvType: 'f16' }, true], [{ fullOffload: true, cpuMoeLayers: 0, kvType: 'q8_0' }, true], [{ fullOffload: true, kvType: 'f16' }, true], [{ fullOffload: true, cpuMoeLayers: 0, kvType: 'q4_0' }, false], [{ fullOffload: false, cpuMoeLayers: 0, kvType: 'f16' }, false], [{ fullOffload: true, cpuMoeLayers: 3, kvType: 'q8_0' }, false]]) {
    assert.equal(meetsQuality(candidate), expected, JSON.stringify(candidate));
  }
});

test('pickBest balanced keeps the scoring it had before profiles', () => {
  // Fastest ok result is q4_0, best score is q8_0: 23.5 * 0.93 = 21.855 < 22.2 * 0.99 = 21.978.
  const results = [mk('q4_0', 23.5), mk('q8_0', 22.2), mk('f16', 21), mk('f16', 30, { ok: false })];
  const expected = legacyPickBest(results);
  assert.equal(expected, results[1]);
  assert.equal(pickBest(results), expected);
  assert.equal(pickBest(results, 'balanced'), expected);
  const noDeep = [mk('q8_0', null, { short: 10 }), mk('q8_0', 5)];
  assert.equal(pickBest(noDeep), noDeep[0]);
  assert.equal(pickBest(noDeep), legacyPickBest(noDeep));
});

test('pickBest speed ignores KV quality', () => {
  const results = [mk('q4_0', 23.5), mk('q8_0', 22.2), mk('f16', 21), mk('f16', 30, { ok: false })];
  assert.equal(pickBest(results, 'speed'), results[0]);
  assert.equal(pickBest(results, 'balanced'), results[1]);
});

test('pickBest quality never picks q4_0 or a partial offload while a qualifying result exists', () => {
  const results = [mk('q4_0', 40), mk('q8_0', 35, { fullOffload: false }), mk('f16', 33, { cpuMoeLayers: 4 }), mk('q8_0', 22.2), mk('f16', 20), mk('f16', 21), mk('f16', 50, { ok: false })];
  assert.equal(pickBest(results, 'quality'), results[5]);
  assert.equal(pickBest([mk('q4_0', 40), mk('q8_0', 10)], 'quality').candidate.kvType, 'q8_0');
});

test('pickBest quality falls back to the balanced rule when nothing qualifies', () => {
  const results = [mk('q4_0', 23.5), mk('q8_0', 22.2, { fullOffload: false })];
  assert.equal(pickBest(results, 'quality'), results[1]);
  assert.equal(pickBest(results, 'quality'), pickBest(results, 'balanced'));
});

test('pickBest skips failed results and does not mutate its input', () => {
  for (const profile of PROFILES) {
    assert.equal(pickBest([], profile), null);
    assert.equal(pickBest([mk('q8_0', 1, { ok: false })], profile), null);
  }
  const results = [mk('f16', 10), mk('q4_0', 30), mk('q8_0', 20)];
  const before = [...results];
  for (const profile of PROFILES) {
    pickBest(results, profile);
    assert.equal(results.length, before.length);
    assert.ok(results.every((r, i) => r === before[i]), profile);
  }
});

test('fitsFullyOnGpu is true when any allowed KV type gives a full offload', () => {
  const table = [
    [q4, 16384, ['f16'], false],
    [q4, 16384, ['f16', 'q8_0'], true],
    [q4, 32768, ['f16', 'q8_0'], false],
    [q4, 32768, ALL_KV, true],
    [q6, 8192, ALL_KV, false],
    [q4, 16384, [], false],
  ];
  for (const [meta, ctx, kvTypes, expected] of table) {
    assert.equal(fitsFullyOnGpu(meta, hw, { ctx, kvTypes }), expected, `${ctx} ${kvTypes}`);
  }
  assert.equal(fitsFullyOnGpu(q4, { ...hw, gpus: [] }, { ctx: 8192, kvTypes: ALL_KV }), false);
});

test('pickVariant applies the rule of each profile', () => {
  const variants = [variant('m:q3', q3), variant('m:q6', q6, true), variant('m:q4', q4)];
  const opts = { ctx: 16384, kvTypes: ALL_KV };
  const table = [
    ['balanced', 1, 'profile.variant.selected'],
    ['speed', 0, 'profile.variant.lightest'],
    ['quality', 2, 'profile.variant.heaviestFit'],
  ];
  for (const [profile, index, reasonCode] of table) {
    const picked = pickVariant(profile, variants, hw, opts);
    assert.equal(picked.variant, variants[index], profile);
    assert.equal(picked.reasonCode, reasonCode);
    assert.equal(picked.fallback, false);
  }
  // At 32K q4 only fits with a q4_0 KV cache, which quality does not allow.
  assert.equal(pickVariant('quality', variants, hw, { ctx: 32768, kvTypes: ALL_KV }).variant, variants[0]);
  const unselected = variants.map((v) => ({ ...v, selected: false }));
  assert.equal(pickVariant('balanced', unselected, hw, opts).variant, unselected[0]);
});

test('pickVariant quality falls back to the selected variant when nothing fits fully on GPU', () => {
  const variants = [variant('m:q6', q6), variant('m:q4', q4, true)];
  assert.deepEqual(pickVariant('quality', variants, hw, { ctx: 32768, kvTypes: ALL_KV }), { variant: variants[1], reasonCode: 'profile.variant.noFullGpu', fallback: true });
  for (const profile of PROFILES) {
    assert.deepEqual(pickVariant(profile, [], hw, { ctx: 16384, kvTypes: ALL_KV }), { variant: null, reasonCode: 'profile.variant.none', fallback: false });
  }
});

test('pickVariant orders by file size when a variant has no bits per weight', () => {
  const opts = { ctx: 16384, kvTypes: ALL_KV };
  // By bits per weight alone the lightest would be 'c'.
  const variants = [
    variant('a', { fileBytes: 10 * GiB, bitsPerWeight: 8 }),
    variant('b', { fileBytes: 20 * GiB }),
    variant('c', { fileBytes: 30 * GiB, bitsPerWeight: 3 }, true),
  ];
  assert.equal(pickVariant('speed', variants, hw, opts).variant, variants[0]);
  const sized = [
    variant('big', { ...q4, bitsPerWeight: 1 }),
    variant('small', { ...q3, bitsPerWeight: null }, true),
  ];
  assert.equal(pickVariant('quality', sized, hw, opts).variant, sized[0]);
  assert.equal(pickVariant('speed', sized, hw, opts).variant, sized[1]);
});

test('recommendProfile picks the highest-quality profile that stays fully on GPU', () => {
  for (const [variants, ctx, expected] of [
    [[variant('m:q4', q4, true)], 16384, { profile: 'quality', reasonCode: 'profile.recommend.qualityFits' }],
    [[variant('m:q3', q3), variant('m:q6', q6, true)], 16384, { profile: 'quality', reasonCode: 'profile.recommend.qualityFits' }],
    [[variant('m:q4', q4, true)], 32768, { profile: 'balanced', reasonCode: 'profile.recommend.balancedFits' }],
    [[variant('m:q6', q6, true)], 16384, { profile: 'speed', reasonCode: 'profile.recommend.partialOffload' }],
  ]) {
    assert.deepEqual(recommendProfile(variants, hw, { ctx, kvTypes: ALL_KV }), expected);
  }
});

test('variantHints lists heavier quantizations that would fit fully on GPU', () => {
  assert.deepEqual(HINT_TARGETS, [
    { quant: 'Q8_0', bitsPerWeight: 8.5008 },
    { quant: 'Q6_K', bitsPerWeight: 6.5633 },
    { quant: 'Q5_K_M', bitsPerWeight: 5.7036 },
  ]);
  assert.equal(Object.isFrozen(HINT_TARGETS), true);
  const opts = { ctx: 16384, kvTypes: ALL_KV };
  const est = (meta, bpw) => Math.round(meta.fileBytes * (bpw / meta.bitsPerWeight));
  const layersBefore = [...small.layerBytes];
  // A Q8_0 requant of this model does not fit at 16K.
  assert.deepEqual(variantHints(small, hw, opts), [
    { quant: 'Q6_K', bitsPerWeight: 6.5633, estimatedBytes: est(small, 6.5633) },
    { quant: 'Q5_K_M', bitsPerWeight: 5.7036, estimatedBytes: est(small, 5.7036) },
  ]);
  assert.deepEqual(small.layerBytes, layersBefore);
  assert.deepEqual(variantHints(small, hw, { ...opts, downloadedQuants: ['q6_k'] }).map((h) => h.quant), ['Q5_K_M']);
  assert.deepEqual(variantHints({ ...small, bitsPerWeight: 6 }, hw, opts).map((h) => h.quant), ['Q8_0', 'Q6_K']);
  assert.deepEqual(variantHints(q4, hw, opts), []);
  assert.deepEqual(variantHints({ ...small, bitsPerWeight: null }, hw, opts), []);
});
