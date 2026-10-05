import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_TUNER_CONFIG_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-presets-'));
const { presetsDir, presetPath, variantsSignature, findPreset, savePreset, listPresets, hardwareFingerprint } = await import('../src/core/presets.js');

const GiB = 1024 ** 3;
const ENGINE = 'lmstudio';
const MODEL = 'qwen/qwen2.5-coder-32b';
const CTX = 16384;
const MODEL_BYTES = 19 * GiB;
const hw = {
  cpu: { brand: 'Ryzen 7 9700X' },
  gpus: [
    { index: 0, name: 'RTX 5070', totalBytes: 12 * GiB, pcieGen: 4, pcieWidth: 4 },
    { index: 1, name: 'RTX 5070', totalBytes: 12 * GiB, pcieGen: 5, pcieWidth: 16 },
  ],
};
const best = {
  candidate: { id: 'q8_0-65', kvType: 'q8_0', fullOffload: true, placement: { gpuLayers: 65 }, score: 21.9 },
  bench: { ok: true, short: { genTps: 25 }, deep: { genTps: 22 } },
};
const base = { engine: ENGINE, modelKey: MODEL, ctx: CTX, hw, modelBytes: MODEL_BYTES };
const save = (extra = {}) => savePreset({ ...base, best, results: [best], ...extra });
const find = (extra = {}) => findPreset({ ...base, ...extra });
// Downloaded variants of the model, as the engines will report them.
const Q4 = { key: 'm@q4_k_m', sizeBytes: 19 * GiB };
const Q6 = { key: 'm@q6_k', sizeBytes: 26 * GiB };
const Q8 = { key: 'm@q8_0', sizeBytes: 34 * GiB };

beforeEach(async () => {
  await fs.rm(presetsDir(), { recursive: true, force: true });
});

test('presetPath keeps the legacy file name for balanced', () => {
  const p = presetPath(ENGINE, MODEL, CTX);
  assert.equal(path.basename(p), 'lmstudio__qwen_qwen2.5-coder-32b__16384.json');
  assert.equal(presetPath(ENGINE, MODEL, CTX, 'balanced'), p);
  assert.equal(path.dirname(p), presetsDir());
});

test('presetPath adds the profile suffix for speed and quality', () => {
  assert.equal(path.basename(presetPath(ENGINE, MODEL, CTX, 'speed')), 'lmstudio__qwen_qwen2.5-coder-32b__16384__speed.json');
  assert.equal(path.basename(presetPath(ENGINE, MODEL, CTX, 'quality')), 'lmstudio__qwen_qwen2.5-coder-32b__16384__quality.json');
});

test('variantsSignature is order independent and empty for no variants', () => {
  assert.equal(variantsSignature([Q8, Q4]), variantsSignature([Q4, Q8]));
  assert.equal(variantsSignature([Q8, Q4]), `m@q4_k_m:${19 * GiB}|m@q8_0:${34 * GiB}`);
  assert.equal(variantsSignature(null), '');
  assert.equal(variantsSignature(undefined), '');
  assert.equal(variantsSignature([]), '');
  assert.ok(variantsSignature([Q4]) !== variantsSignature([{ ...Q4, sizeBytes: Q4.sizeBytes + 1 }]));
});

test('a preset saved without a profile is a balanced preset', async () => {
  const { file, preset } = await save();
  assert.equal(file, presetPath(ENGINE, MODEL, CTX));
  assert.equal(preset.profile, 'balanced');
  assert.equal(preset.version, 1);
  assert.ok(!('variant' in preset));
  assert.ok(!('variants' in preset));
  assert.equal(preset.fingerprint, hardwareFingerprint(hw));
  assert.deepEqual(preset.candidate, { id: 'q8_0-65', kvType: 'q8_0', fullOffload: true });
  assert.equal((await find()).reason, 'hit');
  const res = await find({ profile: 'balanced' });
  assert.equal(res.reason, 'hit');
  assert.deepEqual(res.preset, JSON.parse(await fs.readFile(file, 'utf8')));
});

test('a legacy file without a profile field is found as balanced', async () => {
  const { preset } = await save();
  const { profile, ...legacy } = preset;
  assert.equal(profile, 'balanced');
  await fs.writeFile(presetPath(ENGINE, MODEL, CTX), JSON.stringify(legacy, null, 2));
  assert.equal((await find()).reason, 'hit');
  const found = await find({ profile: 'balanced' });
  assert.equal(found.reason, 'hit');
  assert.ok(!('profile' in found.preset));
  assert.equal((await find({ profile: 'quality' })).reason, 'none');
});

test('speed and quality presets do not overwrite the balanced one', async () => {
  const variants = [Q8, Q4];
  const balanced = await save();
  const speed = await save({ profile: 'speed', variant: Q4, variants });
  const quality = await save({ profile: 'quality', variant: Q8, variants });
  assert.equal(new Set([balanced.file, speed.file, quality.file]).size, 3);
  assert.equal((await fs.readdir(presetsDir())).length, 3);
  assert.equal(speed.preset.profile, 'speed');
  assert.deepEqual(speed.preset.variant, Q4);
  assert.deepEqual(quality.preset.variants, [Q4, Q8]);
  for (const profile of ['balanced', 'speed', 'quality']) {
    const found = await find({ profile, variants });
    assert.equal(found.reason, 'hit', profile);
    assert.equal(found.preset.profile, profile, profile);
  }
  await fs.rm(quality.file);
  assert.equal((await find({ profile: 'quality', variants })).reason, 'none');
  assert.equal((await find({ profile: 'speed', variants })).reason, 'hit');
  assert.equal((await find()).reason, 'hit');
});

test('quality presets go stale when the downloaded variants change', async () => {
  const { preset } = await save({ profile: 'quality', variant: Q6, variants: [Q4, Q6] });
  assert.equal((await find({ profile: 'quality', variants: [Q6, Q4] })).reason, 'hit');
  const table = [
    ['added', [Q4, Q6, Q8]],
    ['removed', [Q4]],
    ['resized', [Q4, { ...Q6, sizeBytes: Q6.sizeBytes + 1 }]],
    ['emptied', []],
  ];
  for (const [label, variants] of table) {
    const found = await find({ profile: 'quality', variants });
    assert.equal(found.reason, 'variants', label);
    assert.equal(found.preset, null, label);
    assert.deepEqual(found.stale, preset, label);
  }
  // Without a variant list the model file size is still checked.
  assert.equal((await find({ profile: 'quality' })).reason, 'hit');
  assert.equal((await find({ profile: 'quality', modelBytes: MODEL_BYTES + 1 })).reason, 'model');
});

test('balanced ignores the variant list and still checks the model file', async () => {
  await save();
  assert.equal((await find({ variants: [Q4, Q6, Q8] })).reason, 'hit');
  assert.equal((await find({ profile: 'balanced', variants: [] })).reason, 'hit');
  const changed = await find({ modelBytes: MODEL_BYTES + 1, variants: [Q4] });
  assert.equal(changed.reason, 'model');
  assert.equal(changed.preset, null);
  assert.equal(changed.stale.profile, 'balanced');
});

test('a hardware change invalidates the presets of every profile', async () => {
  const variants = [Q4, Q8];
  await save();
  await save({ profile: 'speed', variant: Q4, variants });
  await save({ profile: 'quality', variant: Q8, variants });
  const otherHw = { ...hw, gpus: [hw.gpus[1]] };
  for (const profile of ['balanced', 'speed', 'quality']) {
    const found = await find({ profile, variants, hw: otherHw });
    assert.equal(found.reason, 'hardware', profile);
    assert.equal(found.preset, null, profile);
    assert.equal(found.stale.profile, profile, profile);
  }
  // Hardware is checked before the variant list.
  assert.equal((await find({ profile: 'quality', variants: [Q4], hw: otherHw })).reason, 'hardware');
});

test('listPresets reports profile and variant, ordered by context then profile', async () => {
  await save({ ctx: 32768, profile: 'speed', variant: Q4, variants: [Q4, Q8] });
  await save({ profile: 'speed', variant: Q4, variants: [Q4, Q8] });
  await save({ profile: 'quality', variant: Q8, variants: [Q4, Q8] });
  await save({ ctx: 32768 });
  const { file, preset } = await save();
  // A legacy file has no profile field.
  const { profile, ...legacy } = preset;
  assert.equal(profile, 'balanced');
  await fs.writeFile(file, JSON.stringify(legacy));
  await save({ modelKey: 'other/model', profile: 'quality', variant: Q8, variants: [Q8] });
  const list = await listPresets({ engine: ENGINE, modelKey: MODEL });
  assert.deepEqual(list.map((p) => [p.ctx, p.profile, p.variant]), [
    [16384, 'balanced', null],
    [16384, 'quality', 'm@q8_0'],
    [16384, 'speed', 'm@q4_k_m'],
    [32768, 'balanced', null],
    [32768, 'speed', 'm@q4_k_m'],
  ]);
  assert.equal(list[0].file, file);
  assert.equal(list[0].kvType, 'q8_0');
  assert.equal((await listPresets()).length, 6);
});
