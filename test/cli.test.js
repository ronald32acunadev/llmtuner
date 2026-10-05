import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli', 'index.js');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-cli-'));
const settings = path.join(dir, 'settings.json');
const cli = (...args) => {
  let input;
  let cmdArgs = args;
  if (args.length > 0 && typeof args.at(-1) === 'object' && args.at(-1) !== null && !Array.isArray(args.at(-1))) {
    input = args.at(-1).input;
    cmdArgs = args.slice(0, -1);
  }
  return spawnSync(process.execPath, [CLI, ...cmdArgs], { input, env: { ...process.env, LLM_TUNER_CONFIG_DIR: dir }, encoding: 'utf8' });
};

beforeEach(async () => { await fs.rm(settings, { force: true }); });

test('help is in English by default', () => {
  const r = cli('--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage: llm-tuner/);
  assert.match(r.stdout, /--lang <en\|es>/);
  assert.match(r.stdout, /--theme <system\|light\|dark>/);
  assert.match(r.stdout, /\/settings/);
});

test('--lang es switches to Spanish and is remembered', async () => {
  const r = cli('--lang', 'es', '--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Uso: llm-tuner/);
  assert.equal(JSON.parse(await fs.readFile(settings, 'utf8')).lang, 'es');
  assert.match(cli('--help').stdout, /Uso: llm-tuner/);
  assert.match(cli('--lang', 'en', '--help').stdout, /Usage: llm-tuner/);
});

test('an unknown or missing --lang fails in English and saves nothing', async () => {
  for (const args of [['--lang', 'fr', '--help'], ['--help', '--lang']]) {
    const r = cli(...args);
    assert.equal(r.status, 1, args.join(' '));
    assert.match(r.stderr, /Unknown language/);
    assert.match(r.stderr, /en, es/);
    await assert.rejects(fs.access(settings));
  }
});

test('--theme dark switches theme and is remembered', async () => {
  const r = cli('--theme', 'dark', '--help');
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(await fs.readFile(settings, 'utf8')).theme, 'dark');
  cli('--theme', 'light', '--help');
  assert.equal(JSON.parse(await fs.readFile(settings, 'utf8')).theme, 'light');
});

test('an unknown or missing --theme fails and saves nothing', async () => {
  for (const args of [['--theme', 'neon', '--help'], ['--help', '--theme']]) {
    const r = cli(...args);
    assert.equal(r.status, 1, args.join(' '));
    assert.match(r.stderr, /Unknown theme/);
    assert.match(r.stderr, /system, light, dark/);
    await assert.rejects(fs.access(settings));
  }
});

test('/settings exits cleanly with 0 and confirms saved settings', () => {
  const r = cli('/settings', { input: '\x1b[B\x1b[B\n' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Select an option to configure/);
  assert.match(r.stdout, /Settings saved\./);
});

test('/setting and --settings also trigger interactive settings', () => {
  const r1 = cli('/setting', { input: '\x1b[B\x1b[B\n' });
  assert.equal(r1.status, 0);
  assert.match(r1.stdout, /Settings saved\./);

  const r2 = cli('--settings', { input: '\x1b[B\x1b[B\n' });
  assert.equal(r2.status, 0);
  assert.match(r2.stdout, /Settings saved\./);
});

test('/settings allows changing language and updates settings.json', async () => {
  await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [CLI, '/settings'], {
      env: { ...process.env, LLM_TUNER_CONFIG_DIR: dir },
    });
    let step = 0;
    p.stdout.on('data', (d) => {
      const str = d.toString();
      if (step === 0 && str.includes('Select an option')) {
        step = 1;
        p.stdin.write('\n'); // Select Language
      } else if (step === 1 && str.includes('? Language')) {
        step = 2;
        p.stdin.write('\x1b[B\n'); // Select Español
      } else if (step === 2 && str.includes('Selecciona una opción')) {
        step = 3;
        p.stdin.write('\x1b[B\x1b[B\n'); // Select Guardar y volver
      }
    });
    p.on('error', reject);
    p.on('exit', (code) => {
      try {
        assert.equal(code, 0);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });

  const saved = JSON.parse(await fs.readFile(settings, 'utf8'));
  assert.equal(saved.lang, 'es');
});

test('/settings allows changing theme and updates settings.json', async () => {
  await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [CLI, '/settings'], {
      env: { ...process.env, LLM_TUNER_CONFIG_DIR: dir },
    });
    let step = 0;
    p.stdout.on('data', (d) => {
      const str = d.toString();
      if (step === 0 && str.includes('Select an option')) {
        step = 1;
        p.stdin.write('\x1b[B\n'); // Select Theme
      } else if (step === 1 && str.includes('? Theme')) {
        step = 2;
        p.stdin.write('\x1b[B\x1b[B\n'); // Select Dark
      } else if (step === 2 && str.includes('Select an option')) {
        step = 3;
        p.stdin.write('\x1b[B\x1b[B\n'); // Select Save and return
      }
    });
    p.on('error', reject);
    p.on('exit', (code) => {
      try {
        assert.equal(code, 0);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });

  const saved = JSON.parse(await fs.readFile(settings, 'utf8'));
  assert.equal(saved.theme, 'dark');
});

test('/settings exits with code 130 when cancelled with Ctrl+C', () => {
  const r = cli('/settings', { input: '\x03' });
  assert.equal(r.status, 130);
});

test('an unknown or missing --profile fails with a translated message', async () => {
  for (const args of [['--profile', 'bogus'], ['--help', '--profile']]) {
    const r = cli(...args);
    assert.equal(r.status, 1, args.join(' '));
    assert.match(r.stderr, /Unknown profile/);
    assert.match(r.stderr, /speed, balanced, quality/);
  }
});

test('an unknown --profile fails in Spanish with --lang es', async () => {
  const r = cli('--lang', 'es', '--profile', 'bogus');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Perfil desconocido "bogus"/);
  assert.match(r.stderr, /speed, balanced, quality/);
});

test('help documents --profile in both languages', async () => {
  const regex = /--profile <speed\|balanced\|quality>/;
  assert.match(cli('--help').stdout, regex);
  assert.match(cli('--lang', 'es', '--help').stdout, regex);
});

// Writes a preset file into the temp config dir; `extra` is merged into the preset JSON.
async function writePreset(file, extra) {
  const presetDir = path.join(dir, 'presets');
  await fs.mkdir(presetDir, { recursive: true });
  const presetPath = path.join(presetDir, file);
  const preset = {
    engine: 'ollama',
    model: 'qwen2.5-coder:14b',
    ctx: 16384,
    createdAt: '2026-10-04T10:00:00.000Z',
    fingerprint: 'fp',
    candidate: { kvType: 'q8_0', fullOffload: true },
    bench: { short: { genTps: 41.5 } },
    ...extra,
  };
  await fs.writeFile(presetPath, JSON.stringify(preset));
}

test('--presets shows the profile and the variant of each preset', async () => {
  await writePreset('ollama__qwen2.5-coder_14b__8192.json', { ctx: 8192 });
  await writePreset('ollama__qwen2.5-coder_14b__16384__quality.json', { profile: 'quality', variant: { key: 'qwen2.5-coder:14b-q8_0', quant: 'Q8_0', sizeBytes: 1 } });

  try {
    const r = cli('--presets');
    assert.equal(r.status, 0);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines.length, 2);
    assert.match(lines[0], /8K {2}balanced {2}KV q8_0/);
    assert.match(lines[1], /16K {2}quality \(qwen2\.5-coder:14b-q8_0\) {2}KV q8_0/);
    assert.doesNotMatch(lines[0], /\(/);
  } finally {
    await fs.rm(path.join(dir, 'presets'), { recursive: true, force: true });
  }
});

// The helpers are imported in-process: the CLI stays idle when it is not the entry script.
process.env.LLM_TUNER_CONFIG_DIR = dir;
const { profileChoices, profileNotes, profileSwitchNote, profileEventText } = await import('../src/cli/index.js');
const { t: translate } = await import('../src/i18n/index.js');
const tr = (lang) => (key, params) => translate(lang, key, params);

const KV_ALL = ['f16', 'q8_0', 'q4_0'];
const PLAN = {
  variants: [
    { key: 'm:q4', quant: 'Q4_K_M', sizeBytes: 9e9, selected: true, bitsPerWeight: 4.8 },
    { key: 'm:q8', quant: 'Q8_0', sizeBytes: 15e9, selected: false, bitsPerWeight: 8.5 },
  ],
  variantSelect: false,
  recommended: { profile: 'quality', reasonCode: 'profile.recommend.qualityFits' },
  profiles: {
    speed: { variant: 'm:q4', quant: 'Q4_K_M', reasonCode: 'profile.variant.lightest', fallback: false, kvTypes: KV_ALL, loads: 'm:q4', recommendSwitch: false },
    balanced: { variant: 'm:q4', quant: 'Q4_K_M', reasonCode: 'profile.variant.selected', fallback: false, kvTypes: KV_ALL, loads: 'm:q4', recommendSwitch: false },
    quality: { variant: 'm:q8', quant: 'Q8_0', reasonCode: 'profile.variant.heaviestFit', fallback: false, kvTypes: ['f16', 'q8_0'], loads: 'm:q4', recommendSwitch: true },
  },
  hints: [{ quant: 'Q6_K', bitsPerWeight: 6.5633, estimatedBytes: 12 * 1024 ** 3 }],
};

test('profileChoices lists the three profiles with what each one would use', () => {
  const { choices, default: preselected } = profileChoices(PLAN, tr('en'));
  assert.deepEqual(choices.map((c) => c.value), ['speed', 'balanced', 'quality']);
  assert.deepEqual(choices.map((c) => c.short), ['Speed', 'Balanced', 'Quality']);
  assert.equal(choices[0].name, 'Speed  fastest tokens per second; accepts lossy optimizations · Q4_K_M · KV f16, q8_0, q4_0');
  // Quality loads the selected variant: this engine cannot switch variants.
  assert.equal(choices[2].name, 'Quality  least loss that still runs fully on GPU · Q4_K_M · KV f16, q8_0  recommended');
  assert.equal(preselected, 'quality');
});

test('profileChoices preselects the stored profile and marks only the recommended one', () => {
  const { choices, default: preselected } = profileChoices(PLAN, tr('es'), { stored: 'speed', mark: (s) => `<${s}>`, dim: (s) => `[${s}]` });
  assert.equal(preselected, 'speed');
  assert.equal(choices[2].name, 'Calidad  [la menor pérdida que aún se ejecuta por completo en GPU · Q4_K_M · KV f16, q8_0]<  recomendado>');
  assert.doesNotMatch(choices[0].name, /</);
  assert.doesNotMatch(choices[1].name, /</);
  assert.match(choices[1].name, /^Equilibrado {2}\[/);
});

test('profileChoices omits the quantization when it is unknown', () => {
  const plan = { ...PLAN, variants: [{ key: 'm:q4', quant: null, sizeBytes: 9e9, selected: true, bitsPerWeight: null }] };
  assert.equal(profileChoices(plan, tr('en')).choices[1].name, 'Balanced  speed weighted by quality; the default behaviour · KV f16, q8_0, q4_0');
});

test('profileNotes gives the reason of the recommendation and one estimate per hint', () => {
  const en = profileNotes(PLAN, tr('en'));
  assert.equal(en.length, 2);
  assert.match(en[0], /^Quality is recommended/);
  assert.match(en[1], /^Estimate: Q6_K \(about 12\.00 GiB\) is not downloaded/);
  const es = profileNotes(PLAN, tr('es'));
  assert.match(es[0], /^Se recomienda Calidad/);
  assert.match(es[1], /^Estimación: Q6_K \(unos 12\.00 GiB\) no está descargada/);
  assert.deepEqual(profileNotes({ ...PLAN, hints: [] }, tr('en')), [en[0]]);
});

test('profileSwitchNote tells which variant to select in the engine, only when a switch is recommended', () => {
  assert.match(profileSwitchNote(PLAN, 'quality', tr('en'), 'LM Studio'), /^The Q8_0 variant suits this profile better: select it in LM Studio/);
  assert.match(profileSwitchNote(PLAN, 'quality', tr('es'), 'LM Studio'), /^La variante Q8_0 se ajusta mejor a este perfil: selecciónala en LM Studio/);
  assert.equal(profileSwitchNote(PLAN, 'balanced', tr('en'), 'LM Studio'), null);
});

test('profileEventText translates the variant and fallback events', () => {
  const picked = { type: 'variant-picked', reasonCode: 'profile.variant.heaviestFit', variant: { key: 'm:q8', quant: 'Q8_0' } };
  assert.equal(profileEventText(picked, null, tr('en')), 'Variant Q8_0 (m:q8): the heaviest one downloaded that fits fully on GPU.');
  const unknown = { type: 'variant-picked', reasonCode: 'profile.variant.selected', variant: { key: 'm', quant: null } };
  assert.equal(profileEventText(unknown, null, tr('es')), 'Variante ? (m): la seleccionada.');
  const measured = { type: 'profile-fallback', reasonCode: 'profile.fallback.noFullGpuConfig' };
  assert.match(profileEventText(measured, picked, tr('en')), /^No fully-on-GPU configuration passed the measurement/);
  assert.match(profileEventText(measured, picked, tr('es')), /^Ninguna configuración con todo en GPU superó la medición/);
});

test('profileEventText does not repeat a fallback reason the variant line already gave', () => {
  const noFit = { type: 'variant-picked', reasonCode: 'profile.variant.noFullGpu', variant: { key: 'm:q4', quant: 'Q4_K_M' } };
  const fallback = { type: 'profile-fallback', reasonCode: 'profile.variant.noFullGpu' };
  assert.match(profileEventText(noFit, null, tr('en')), /uses the balanced rule with Q4_K_M \(m:q4\)/);
  assert.equal(profileEventText(fallback, noFit, tr('en')), null);
  // Without a matching variant line the fallback is still filled with the last picked variant.
  const other = { ...noFit, reasonCode: 'profile.variant.selected' };
  assert.match(profileEventText(fallback, other, tr('es')), /con Q4_K_M \(m:q4\)/);
  assert.doesNotMatch(profileEventText(fallback, null, tr('en')) ?? '', /undefined/);
});
