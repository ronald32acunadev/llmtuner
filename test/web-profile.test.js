import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t } from '../src/i18n/index.js';
import { initialProfile, profileOptions, profileDetailLines, profileEventLines, presetsFor, presetFor, isCurrentModel, isCurrentPlan } from '../src/web/public/profile.js';

// The browser builds its `t` from the catalog the server sends; here the real catalogs are used directly.
const tr = (lang) => (key, params) => t(lang, key, params);
const formatBytes = (b) => `${(b / 1024 ** 3).toFixed(1)} GB`;
const opts = { engineName: 'LM Studio', formatBytes };

const KV_ALL = ['f16', 'q8_0', 'q4_0'];
// The `profiles` object of POST /api/plan for an engine that cannot select variants: quality would rather load Q8_0.
const PLAN = {
  variants: [
    { key: 'm@q4_k_m', quant: 'Q4_K_M', sizeBytes: 9e9, selected: true, bitsPerWeight: 4.85 },
    { key: 'm@q8_0', quant: 'Q8_0', sizeBytes: 15e9, selected: false, bitsPerWeight: 8.5 },
  ],
  variantSelect: false,
  recommended: { profile: 'quality', reasonCode: 'profile.recommend.qualityFits' },
  profiles: {
    speed: { variant: 'm@q4_k_m', quant: 'Q4_K_M', reasonCode: 'profile.variant.lightest', fallback: false, kvTypes: KV_ALL, loads: 'm@q4_k_m', recommendSwitch: false },
    balanced: { variant: 'm@q4_k_m', quant: 'Q4_K_M', reasonCode: 'profile.variant.selected', fallback: false, kvTypes: KV_ALL, loads: 'm@q4_k_m', recommendSwitch: false },
    quality: { variant: 'm@q8_0', quant: 'Q8_0', reasonCode: 'profile.variant.heaviestFit', fallback: false, kvTypes: ['f16', 'q8_0'], loads: 'm@q4_k_m', recommendSwitch: true },
  },
  hints: [{ quant: 'Q6_K', bitsPerWeight: 6.5633, estimatedBytes: 12 * 1024 ** 3 }],
};

test('initialProfile prefers the stored profile, then the recommended one, then balanced', () => {
  assert.equal(initialProfile('speed', PLAN), 'speed');
  assert.equal(initialProfile(null, PLAN), 'quality');
  assert.equal(initialProfile(undefined, PLAN), 'quality');
  assert.equal(initialProfile(null, null), 'balanced');
  assert.equal(initialProfile(null, { ...PLAN, recommended: null }), 'balanced');
});

test('profileOptions lists the three profiles and flags only the recommended one', () => {
  assert.deepEqual(profileOptions(PLAN, tr('en')), [
    { id: 'speed', name: 'Speed', description: 'fastest tokens per second; accepts lossy optimizations', recommended: false },
    { id: 'balanced', name: 'Balanced', description: 'speed weighted by quality; the default behaviour', recommended: false },
    { id: 'quality', name: 'Quality', description: 'least loss that still runs fully on GPU', recommended: true },
  ]);
  const es = profileOptions({ ...PLAN, recommended: { profile: 'speed', reasonCode: 'profile.recommend.partialOffload' } }, tr('es'));
  assert.deepEqual(es.map((o) => o.name), ['Velocidad', 'Equilibrado', 'Calidad']);
  assert.deepEqual(es.map((o) => o.recommended), [true, false, false]);
});

test('profileOptions still offers the three profiles, none recommended, without a plan', () => {
  const options = profileOptions(null, tr('en'));
  assert.deepEqual(options.map((o) => o.id), ['speed', 'balanced', 'quality']);
  assert.deepEqual(options.map((o) => o.recommended), [false, false, false]);
});

test('profileDetailLines says what loads, why, the recommendation and one estimate per hint', () => {
  assert.deepEqual(profileDetailLines(PLAN, 'speed', tr('en'), opts), [
    { kind: 'detail', level: 'note', text: 'Will load Q4_K_M; KV cache types allowed: f16, q8_0, q4_0. Variant Q4_K_M (m@q4_k_m): the lightest one downloaded.' },
    { kind: 'recommend', level: 'note', text: 'Quality is recommended: a downloaded variant fits fully on GPU with a precise KV cache.' },
    { kind: 'hint', level: 'note', text: 'Estimate: Q6_K (about 12.0 GB) is not downloaded and would fit fully on your GPUs.' },
  ]);
  assert.deepEqual(profileDetailLines(PLAN, 'speed', tr('es'), opts).map((l) => l.text), [
    'Se cargará Q4_K_M; tipos de caché KV permitidos: f16, q8_0, q4_0. Variante Q4_K_M (m@q4_k_m): la más ligera de las descargadas.',
    'Se recomienda Calidad: una variante descargada cabe por completo en GPU con una caché KV precisa.',
    'Estimación: Q6_K (unos 12.0 GB) no está descargada y cabría por completo en tus GPUs.',
  ]);
  // No hints: only the detail and the recommendation.
  assert.deepEqual(profileDetailLines({ ...PLAN, hints: [] }, 'balanced', tr('en'), opts).map((l) => l.kind), ['detail', 'recommend']);
});

test('profileDetailLines adds the switch advice when the engine cannot load the pick itself', () => {
  const en = profileDetailLines(PLAN, 'quality', tr('en'), opts);
  assert.deepEqual(en.map((l) => l.kind), ['detail', 'recommend', 'hint', 'switch']);
  // What loads is the selected variant; the reason and the advice name the pick.
  assert.equal(en[0].text, 'Will load Q4_K_M; KV cache types allowed: f16, q8_0. Variant Q8_0 (m@q8_0): the heaviest one downloaded that fits fully on GPU.');
  assert.deepEqual(en[3], { kind: 'switch', level: 'note', text: 'The Q8_0 variant suits this profile better: select it in LM Studio to use it. The one selected now is the one that will be loaded.' });
  const es = profileDetailLines(PLAN, 'quality', tr('es'), opts);
  assert.equal(es[3].text, 'La variante Q8_0 se ajusta mejor a este perfil: selecciónala en LM Studio para usarla. Se cargará la que está seleccionada ahora.');
  assert.equal(profileDetailLines(PLAN, 'balanced', tr('en'), opts).some((l) => l.kind === 'switch'), false);
});

test('profileDetailLines warns that the preview is conservative only when VRAM is in use', () => {
  const busy = { ...PLAN, vramBusy: true };
  const en = profileDetailLines(busy, 'quality', tr('en'), opts);
  assert.deepEqual(en.map((l) => l.kind), ['detail', 'recommend', 'busy', 'hint', 'switch']);
  assert.deepEqual(en[2], { kind: 'busy', level: 'warn', text: "VRAM is in use right now, so this preview is conservative. Loading first unloads this engine's models and then makes the real choice." });
  assert.deepEqual(profileDetailLines(busy, 'quality', tr('es'), opts)[2], { kind: 'busy', level: 'warn', text: 'La VRAM está en uso en este momento, así que esta vista previa es conservadora. Al cargar, primero se descargan los modelos de este motor y después se hace la elección real.' });
  // Without a recommendation the warning still follows the detail.
  assert.deepEqual(profileDetailLines({ ...busy, recommended: null, hints: [] }, 'balanced', tr('en'), opts).map((l) => l.kind), ['detail', 'busy']);
  // Idle or unknown VRAM: no warning.
  for (const plan of [PLAN, { ...PLAN, vramBusy: false }]) {
    assert.equal(profileDetailLines(plan, 'quality', tr('en'), opts).some((l) => l.kind === 'busy'), false);
  }
});

test('profileDetailLines warns when the profile falls back and names the key when the quantization is unknown', () => {
  const noFit = { ...PLAN, profiles: { ...PLAN.profiles, quality: { ...PLAN.profiles.balanced, reasonCode: 'profile.variant.noFullGpu', fallback: true, kvTypes: ['f16', 'q8_0'] } } };
  assert.deepEqual(profileDetailLines(noFit, 'quality', tr('en'), opts)[0], {
    kind: 'detail',
    level: 'warn',
    text: 'Will load Q4_K_M; KV cache types allowed: f16, q8_0. No downloaded variant fits fully on GPU: the quality profile uses the balanced rule with Q4_K_M (m@q4_k_m).',
  });

  const single = {
    ...PLAN,
    variants: [{ key: 'm', quant: null, sizeBytes: 9e9, selected: true, bitsPerWeight: null }],
    profiles: { ...PLAN.profiles, balanced: { ...PLAN.profiles.balanced, variant: 'm', quant: null, loads: 'm' } },
  };
  assert.equal(profileDetailLines(single, 'balanced', tr('en'), opts)[0].text, 'Will load m; KV cache types allowed: f16, q8_0, q4_0. Variant ? (m): the one selected.');
});

test('profileDetailLines has nothing to say without a plan or for an unknown profile', () => {
  assert.deepEqual(profileDetailLines(null, 'balanced', tr('en'), opts), []);
  assert.deepEqual(profileDetailLines(undefined, 'balanced', tr('es'), opts), []);
  assert.deepEqual(profileDetailLines(PLAN, 'turbo', tr('en'), opts), []);
});

test('profileEventLines renders a picked variant as a note', () => {
  const picked = { type: 'variant-picked', reasonCode: 'profile.variant.heaviestFit', variant: { key: 'm:q8', quant: 'Q8_0' }, recommendSwitch: false };
  assert.deepEqual(profileEventLines(picked, tr('en'), opts), [{ text: 'Variant Q8_0 (m:q8): the heaviest one downloaded that fits fully on GPU.', level: 'note' }]);
  const unknown = { type: 'variant-picked', reasonCode: 'profile.variant.selected', variant: { key: 'm', quant: null }, recommendSwitch: false };
  assert.deepEqual(profileEventLines(unknown, tr('es'), opts), [{ text: 'Variante ? (m): la seleccionada.', level: 'note' }]);
});

test('profileEventLines renders a fallback as a warning, once', () => {
  const variant = { key: 'm:q4', quant: 'Q4_K_M' };
  const picked = { type: 'variant-picked', reasonCode: 'profile.variant.noFullGpu', variant, recommendSwitch: false };
  const noFit = { type: 'profile-fallback', reasonCode: 'profile.variant.noFullGpu', variant };
  const text = 'No downloaded variant fits fully on GPU: the quality profile uses the balanced rule with Q4_K_M (m:q4).';
  assert.deepEqual(profileEventLines(noFit, tr('en'), opts), [{ text, level: 'warn' }]);
  assert.deepEqual(profileEventLines(noFit, tr('es'), opts), [{ text: 'Ninguna variante descargada cabe por completo en GPU: el perfil de calidad usa la regla del equilibrado con Q4_K_M (m:q4).', level: 'warn' }]);
  // The pick that could not honour the profile is already a warning, and the fallback right after it does not repeat the line.
  assert.deepEqual(profileEventLines(picked, tr('en'), opts), [{ text, level: 'warn' }]);
  assert.deepEqual(profileEventLines(noFit, tr('en'), { ...opts, previous: picked }), []);

  const measured = { type: 'profile-fallback', reasonCode: 'profile.fallback.noFullGpuConfig', variant };
  assert.deepEqual(profileEventLines(measured, tr('en'), { ...opts, previous: picked }), [{ text: 'No fully-on-GPU configuration passed the measurement: the quality profile used the balanced rule.', level: 'warn' }]);
});

test('profileEventLines adds the switch advice to a pick the engine cannot load itself', () => {
  const picked = { type: 'variant-picked', reasonCode: 'profile.variant.heaviestFit', variant: { key: 'm@q8_0', quant: 'Q8_0' }, recommendSwitch: true };
  assert.deepEqual(profileEventLines(picked, tr('en'), opts), [
    { text: 'Variant Q8_0 (m@q8_0): the heaviest one downloaded that fits fully on GPU.', level: 'note' },
    { text: 'The Q8_0 variant suits this profile better: select it in LM Studio to use it. The one selected now is the one that will be loaded.', level: 'note' },
  ]);
  assert.equal(profileEventLines(picked, tr('es'), opts)[1].text, 'La variante Q8_0 se ajusta mejor a este perfil: selecciónala en LM Studio para usarla. Se cargará la que está seleccionada ahora.');
  // A fallback never carries the advice, and without the engine name it is left out.
  assert.equal(profileEventLines({ ...picked, type: 'profile-fallback' }, tr('en'), opts).length, 1);
  assert.equal(profileEventLines(picked, tr('en')).length, 1);
});

test('profileEventLines ignores an event without a variant', () => {
  assert.deepEqual(profileEventLines({ type: 'variant-picked', reasonCode: 'profile.variant.selected', recommendSwitch: true }, tr('en'), opts), []);
  assert.deepEqual(profileEventLines({ type: 'profile-fallback', reasonCode: 'profile.fallback.noFullGpuConfig', variant: null }, tr('es'), opts), []);
});

test('presetFor picks the preset of a context and profile; an entry without a profile is balanced', () => {
  const presets = [
    { ctx: 8192, shortTps: 50 },
    { ctx: 8192, profile: 'quality', shortTps: 30 },
    { ctx: 16384, profile: 'speed', shortTps: 70 },
  ];
  assert.equal(presetFor(presets, 8192, 'balanced'), presets[0]);
  assert.equal(presetFor(presets, 8192, 'quality'), presets[1]);
  assert.equal(presetFor(presets, 8192, 'speed'), null);
  assert.equal(presetFor(presets, 16384, 'speed'), presets[2]);
  assert.equal(presetFor(presets, 16384, 'balanced'), null);
  assert.equal(presetFor([], 8192, 'balanced'), null);
  assert.deepEqual(presetsFor(presets, 'balanced'), [presets[0]]);
  assert.deepEqual(presetsFor(presets, 'speed'), [presets[2]]);
});

test('isCurrentModel accepts an answer only for the engine and model still selected', () => {
  const requested = { engine: 'lmstudio', model: 'a', ctx: 8192 };
  assert.equal(isCurrentModel(requested, { ...requested }), true);
  // The context is not part of the model.
  assert.equal(isCurrentModel(requested, { ...requested, ctx: 16384 }), true);
  // The user switched to another model while the answer was on its way.
  assert.equal(isCurrentModel(requested, { ...requested, model: 'b' }), false);
  assert.equal(isCurrentModel(requested, { ...requested, engine: 'ollama' }), false);
  // Nothing is selected any more.
  assert.equal(isCurrentModel(requested, { engine: undefined, model: '', ctx: 8192 }), false);
});

test('isCurrentPlan also requires the context still selected', () => {
  const requested = { engine: 'lmstudio', model: 'a', ctx: 8192 };
  assert.equal(isCurrentPlan(requested, { ...requested }), true);
  assert.equal(isCurrentPlan(requested, { ...requested, ctx: 16384 }), false);
  assert.equal(isCurrentPlan(requested, { ...requested, model: 'b' }), false);
  assert.equal(isCurrentPlan(requested, { ...requested, engine: 'ollama' }), false);
  // A context read from an input as a string is not the requested number.
  assert.equal(isCurrentPlan(requested, { ...requested, ctx: '8192' }), false);
});
