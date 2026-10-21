import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('CLI JSON authorization is noninteractive and returns parseable success or failure with the correct exit code', async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-cli-auth-'));
  const loader = path.join(scratch, 'fake.mjs');
  const moduleUrl = (p) => new URL(p, import.meta.url).href;
  try {
    await fs.writeFile(path.join(scratch, 'update-check.json'), JSON.stringify({ lastChecked: Date.now(), latestVersion: '0.0.0' }));
    await fs.writeFile(loader, `
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { Tuner, ENGINES } from ${JSON.stringify(moduleUrl('../src/core/tuner.js'))};
import { authorizationIO } from ${JSON.stringify(moduleUrl('../src/platform/ollama-authorize.js'))};
ENGINES.ollama.detect = ENGINES.lmstudio.detect = async () => ({ installed: true });
authorizationIO.spawn = (bin, args, opts) => {
  if (bin !== '/usr/bin/sudo' || args[0] !== '-n' || opts.stdio[0] !== 'ignore') throw Error('interactive authorization in JSON mode');
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  queueMicrotask(() => { child.stdout.end('changed=0\\nrestarted=0\\nbackup=\\n'); child.emit('close', Number(process.env.FAKE_AUTH_CODE)); });
  return child;
};
Tuner.create = async () => ({ engine: { id: 'ollama', name: 'Ollama' }, listModels: async () => [], on() {},
  async load(model, ctx, opts) {
    await opts.authorizeOllama({ operation: 'ollama-service-env', env: { OLLAMA_FLASH_ATTENTION: '1', OLLAMA_KV_CACHE_TYPE: 'q8_0', OLLAMA_NUM_PARALLEL: '1' } });
    return { loaded: { ok: true, short: { genTps: 1 } } };
  }
});
`);
    for (const code of [0, 1]) {
      const r = spawnSync(process.execPath, ['--import', loader, CLI, '--engine', 'ollama', '--model', 'fake', '--ctx', '4096', '--profile', 'balanced', '--yes', '--json'], {
        env: { ...process.env, LLM_TUNER_CONFIG_DIR: scratch, FAKE_AUTH_CODE: String(code) }, encoding: 'utf8', timeout: 10000,
      });
      assert.equal(r.status, code, r.stderr);
      assert.equal(r.stderr, '');
      const output = JSON.parse(r.stdout);
      if (code === 0) assert.equal(output.loaded.ok, true);
      else { assert.equal(output.ok, false); assert.equal(output.code, 'errors.ollamaAuthorizationRequired'); }
    }
  } finally { await fs.rm(scratch, { recursive: true, force: true }); }
});

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
  return spawnSync(process.execPath, [CLI, ...cmdArgs], { input, env: { ...process.env, LLM_TUNER_CONFIG_DIR: dir }, encoding: 'utf8', timeout: 10000 });
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

test('help does not offer a web mode in either language', () => {
  assert.doesNotMatch(cli('--help').stdout, /--web/);
  assert.doesNotMatch(cli('--lang', 'es', '--help').stdout, /--web/);
});

test('--version and -v print the package version and exit 0', () => {
  const r1 = cli('--version');
  assert.equal(r1.status, 0);
  assert.match(r1.stdout.trim(), /^\d+\.\d+\.\d+/);

  const r2 = cli('-v');
  assert.equal(r2.status, 0);
  assert.equal(r2.stdout.trim(), r1.stdout.trim());
});

test('CLI displays update banner when update-check.json has a newer version', async () => {
  const cachePath = path.join(dir, 'update-check.json');
  await fs.writeFile(cachePath, JSON.stringify({ lastChecked: Date.now(), latestVersion: '99.0.0' }));
  const r = cli({ input: '\x03' });
  assert.match(r.stdout, /Update available/);
  assert.match(r.stdout, /99\.0\.0/);
});

test('the CLI does not load the web server', async () => {
  const source = await fs.readFile(CLI, 'utf8');
  assert.doesNotMatch(source, /web\/server\.js/);
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

const stripAnsi = (str) => {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
};

test('/settings allows changing language and updates settings.json', async () => {
  await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [CLI, '/settings'], {
      env: { ...process.env, LLM_TUNER_CONFIG_DIR: dir },
    });

    let buf = '';
    let step = 0;
    const timeout = setTimeout(() => {
      p.kill();
      reject(new Error('Test timed out after 10 seconds'));
    }, 10000);

    p.stdout.on('data', (d) => {
      buf += stripAnsi(d.toString());

      if (step === 0 && buf.includes('Select an option')) {
        step = 1;
        buf = '';
        p.stdin.write('\n'); // Select Language
      } else if (step === 1 && buf.includes('? Language')) {
        step = 2;
        buf = '';
        p.stdin.write('\x1b[B\n'); // Select Español
      } else if (step === 2 && buf.includes('Selecciona una opción')) {
        step = 3;
        buf = '';
        p.stdin.write('\x1b[B\x1b[B\n'); // Select Guardar y volver
      }
    });

    p.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    p.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code}`));
        return;
      }
      resolve();
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

    let buf = '';
    let step = 0;
    const timeout = setTimeout(() => {
      p.kill();
      reject(new Error('Test timed out after 10 seconds'));
    }, 10000);

    p.stdout.on('data', (d) => {
      buf += stripAnsi(d.toString());

      if (step === 0 && buf.includes('Select an option')) {
        step = 1;
        buf = '';
        p.stdin.write('\x1b[B\n'); // Select Theme
      } else if (step === 1 && buf.includes('? Theme')) {
        step = 2;
        buf = '';
        p.stdin.write('\x1b[B\x1b[B\n'); // Select Dark
      } else if (step === 2 && buf.includes('Select an option')) {
        step = 3;
        buf = '';
        p.stdin.write('\x1b[B\x1b[B\n'); // Select Save and return
      }
    });

    p.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    p.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code}`));
        return;
      }
      resolve();
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

test('--presets leaves the variant out when it is the model itself', async () => {
  // LM Studio names a variant with the key of its model: repeating it adds nothing.
  await writePreset('lmstudio__qwen_qwen3-coder-30b__8192__quality.json', { engine: 'lmstudio', model: 'qwen/qwen3-coder-30b', ctx: 8192, profile: 'quality', variant: { key: 'qwen/qwen3-coder-30b', quant: 'Q4_K_M', sizeBytes: 1 } });
  await writePreset('lmstudio__qwen_qwen3-coder-30b__16384__quality.json', { engine: 'lmstudio', model: 'qwen/qwen3-coder-30b', profile: 'quality', variant: { key: 'qwen/qwen3-coder-30b@q8_0', quant: 'Q8_0', sizeBytes: 1 } });

  try {
    const r = cli('--presets');
    assert.equal(r.status, 0);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines.length, 2);
    assert.match(lines[0], /qwen\/qwen3-coder-30b {2}8K {2}quality {2}KV q8_0/);
    assert.doesNotMatch(lines[0], /\(/);
    assert.match(lines[1], /16K {2}quality \(qwen\/qwen3-coder-30b@q8_0\) {2}KV q8_0/);
  } finally {
    await fs.rm(path.join(dir, 'presets'), { recursive: true, force: true });
  }
});

// The pure helpers live in their own module: importing it never starts the CLI.
process.env.LLM_TUNER_CONFIG_DIR = dir;
const { profileChoices, profileNotes, profileSwitchNote, profileEventLines, shouldAskProfile, parseContext } = await import('../src/cli/profile.js');
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
  assert.deepEqual(en.map((l) => l.level), ['note', 'note']);
  assert.match(en[0].text, /^Quality is recommended/);
  assert.match(en[1].text, /^Estimate: Q6_K \(about 12\.00 GiB\) is not downloaded/);
  const es = profileNotes(PLAN, tr('es'));
  assert.match(es[0].text, /^Se recomienda Calidad/);
  assert.match(es[1].text, /^Estimación: Q6_K \(unos 12\.00 GiB\) no está descargada/);
  assert.deepEqual(profileNotes({ ...PLAN, hints: [] }, tr('en')), [{ text: en[0].text, level: 'note' }]);
});

test('profileNotes warns that the preview is conservative only when VRAM is in use', () => {
  const busy = { ...PLAN, vramBusy: true };
  const en = profileNotes(busy, tr('en'));
  assert.deepEqual(en.map((l) => l.level), ['note', 'warn', 'note']);
  assert.equal(en[1].text, "VRAM is in use right now, so this preview is conservative. Loading first unloads this engine's models and then makes the real choice.");
  assert.match(en[0].text, /^Quality is recommended/);
  assert.match(en[2].text, /^Estimate: Q6_K/);
  assert.deepEqual(profileNotes(busy, tr('es'))[1], { text: 'La VRAM está en uso en este momento, así que esta vista previa es conservadora. Al cargar, primero se descargan los modelos de este motor y después se hace la elección real.', level: 'warn' });
  // Idle or unknown VRAM: no warning.
  for (const plan of [PLAN, { ...PLAN, vramBusy: false }]) {
    assert.equal(profileNotes(plan, tr('en')).some((l) => l.level === 'warn'), false);
  }
});

test('profileSwitchNote tells which variant to select in the engine, only when a switch is recommended', () => {
  assert.match(profileSwitchNote(PLAN, 'quality', tr('en'), 'LM Studio'), /^The Q8_0 variant suits this profile better: select it in LM Studio/);
  assert.match(profileSwitchNote(PLAN, 'quality', tr('es'), 'LM Studio'), /^La variante Q8_0 se ajusta mejor a este perfil: selecciónala en LM Studio/);
  assert.equal(profileSwitchNote(PLAN, 'balanced', tr('en'), 'LM Studio'), null);
});

test('profileEventLines renders the variant and fallback events from their own variant', () => {
  const picked = { type: 'variant-picked', reasonCode: 'profile.variant.heaviestFit', variant: { key: 'm:q8', quant: 'Q8_0' }, recommendSwitch: false };
  assert.deepEqual(profileEventLines(picked, null, tr('en'), 'LM Studio'), [{ text: 'Variant Q8_0 (m:q8): the heaviest one downloaded that fits fully on GPU.', level: 'note' }]);

  const unknown = { type: 'variant-picked', reasonCode: 'profile.variant.selected', variant: { key: 'm', quant: null }, recommendSwitch: false };
  assert.deepEqual(profileEventLines(unknown, null, tr('es'), 'LM Studio'), [{ text: 'Variante ? (m): la seleccionada.', level: 'note' }]);

  // A fallback needs no earlier event: it carries the variant itself.
  const noFit = { type: 'profile-fallback', reasonCode: 'profile.variant.noFullGpu', variant: { key: 'm:q4', quant: 'Q4_K_M' } };
  assert.deepEqual(profileEventLines(noFit, null, tr('en'), 'LM Studio'), [{ text: 'No downloaded variant fits fully on GPU: the quality profile uses the balanced rule with Q4_K_M (m:q4).', level: 'warn' }]);
  assert.deepEqual(profileEventLines(noFit, null, tr('es'), 'LM Studio'), [{ text: 'Ninguna variante descargada cabe por completo en GPU: el perfil de calidad usa la regla del equilibrado con Q4_K_M (m:q4).', level: 'warn' }]);

  const measured = { type: 'profile-fallback', reasonCode: 'profile.fallback.noFullGpuConfig', variant: { key: 'm:q4', quant: 'Q4_K_M' } };
  assert.deepEqual(profileEventLines(measured, picked, tr('en'), 'LM Studio'), [{ text: 'No fully-on-GPU configuration passed the measurement: the quality profile used the balanced rule.', level: 'warn' }]);
  assert.deepEqual(profileEventLines(measured, picked, tr('es'), 'LM Studio'), [{ text: 'Ninguna configuración con todo en GPU superó la medición: el perfil de calidad usó la regla del equilibrado.', level: 'warn' }]);
});

test('profileEventLines prints a fallback reason once, as a warning', () => {
  const variant = { key: 'm:q4', quant: 'Q4_K_M' };
  const noFit = { type: 'variant-picked', reasonCode: 'profile.variant.noFullGpu', variant, recommendSwitch: false };
  const fallback = { type: 'profile-fallback', reasonCode: 'profile.variant.noFullGpu', variant };
  const other = { ...noFit, reasonCode: 'profile.variant.selected' };
  const expected = { en: 'No downloaded variant fits fully on GPU: the quality profile uses the balanced rule with Q4_K_M (m:q4).', es: 'Ninguna variante descargada cabe por completo en GPU: el perfil de calidad usa la regla del equilibrado con Q4_K_M (m:q4).' };

  for (const lang of ['en', 'es']) {
    const line = { text: expected[lang], level: 'warn' };
    // The variant line explains that the quality profile could not be honoured: it is a warning.
    assert.deepEqual(profileEventLines(noFit, null, tr(lang), 'LM Studio'), [line], lang);
    // The fallback that follows it repeats the same reason: nothing more is printed.
    assert.deepEqual(profileEventLines(fallback, noFit, tr(lang), 'LM Studio'), [], lang);
    // After a different line, or with none before, the fallback prints its reason.
    assert.deepEqual(profileEventLines(fallback, other, tr(lang), 'LM Studio'), [line], lang);
    assert.deepEqual(profileEventLines(fallback, null, tr(lang), 'LM Studio'), [line], lang);
  }
});

test('profileEventLines adds the switch advice when the event recommends another variant', () => {
  const picked = { type: 'variant-picked', reasonCode: 'profile.variant.heaviestFit', variant: { key: 'fam@q8', quant: 'Q8_0' }, loads: 'fam', recommendSwitch: true };
  assert.deepEqual(profileEventLines(picked, null, tr('en'), 'LM Studio'), [
    { text: 'Variant Q8_0 (fam@q8): the heaviest one downloaded that fits fully on GPU.', level: 'note' },
    { text: 'The Q8_0 variant suits this profile better: select it in LM Studio to use it. The one selected now is the one that will be loaded.', level: 'note' },
  ]);
  assert.deepEqual(profileEventLines(picked, null, tr('es'), 'Ollama'), [
    { text: 'Variante Q8_0 (fam@q8): la más pesada de las descargadas que cabe por completo en GPU.', level: 'note' },
    { text: 'La variante Q8_0 se ajusta mejor a este perfil: selecciónala en Ollama para usarla. Se cargará la que está seleccionada ahora.', level: 'note' },
  ]);
  // Without a quantization the advice names the variant by its key.
  const unnamed = { ...picked, variant: { key: 'fam@q8', quant: null } };
  assert.equal(profileEventLines(unnamed, null, tr('en'), 'LM Studio')[1].text, 'The fam@q8 variant suits this profile better: select it in LM Studio to use it. The one selected now is the one that will be loaded.');
  // No advice when the engine loads the pick itself.
  assert.equal(profileEventLines({ ...picked, recommendSwitch: false }, null, tr('en'), 'LM Studio').length, 1);
  // No advice without an engine name: the wizard already gave it with the profile prompt.
  assert.equal(profileEventLines(picked, null, tr('en')).length, 1);
  assert.equal(profileEventLines(picked, null, tr('es'), null).length, 1);
});

test('profileEventLines prints nothing for an event without a variant', () => {
  // The progress listener must never throw: that would reject the load in the middle of a run.
  for (const type of ['variant-picked', 'profile-fallback']) {
    for (const lang of ['en', 'es']) {
      assert.deepEqual(profileEventLines({ type, reasonCode: 'profile.variant.noFullGpu', recommendSwitch: true }, null, tr(lang), 'LM Studio'), [], `${type} ${lang}`);
      assert.deepEqual(profileEventLines({ type, reasonCode: 'profile.variant.selected', variant: null }, null, tr(lang)), [], `${type} ${lang} null`);
    }
  }
});

test('shouldAskProfile asks only in the wizard, never on a fully flagged or non-interactive run', () => {
  const all = { engine: 'lmstudio', model: 'qwen/qwen3-coder-30b', ctx: '16384' };
  const cases = [
    // The bare wizard and every run that still has a question to ask.
    [{}, true],
    [{ engine: 'ollama' }, true],
    [{ model: 'qwen2.5-coder:14b' }, true],
    [{ ctx: '8192' }, true],
    [{ engine: 'ollama', model: 'qwen2.5-coder:14b' }, true],
    [{ engine: 'ollama', ctx: '8192' }, true],
    [{ model: 'qwen2.5-coder:14b', ctx: '8192' }, true],
    [{ engine: 'ollama', model: 'qwen2.5-coder:14b', force: true, 'dry-run': true }, true],
    // A context that is not a number is asked again, so the run is still a wizard.
    [{ ...all, ctx: 'abc' }, true],
    [{ ...all, ctx: undefined }, true],
    // Engine, model and context from flags: the run asked nothing before the profiles existed.
    [all, false],
    [{ ...all, 'dry-run': true }, false],
    [{ ...all, force: true, candidates: '2' }, false],
    // An explicit profile is never asked again.
    [{ profile: 'speed' }, false],
    [{ profile: 'quality', engine: 'ollama' }, false],
    [{ ...all, profile: 'balanced' }, false],
    // Non-interactive runs.
    [{ yes: true }, false],
    [{ json: true }, false],
    [{ yes: true, engine: 'ollama' }, false],
    [{ json: true, engine: 'ollama', model: 'qwen2.5-coder:14b' }, false],
    [{ ...all, yes: true }, false],
    [{ ...all, json: true }, false],
    [{ yes: true, json: true, profile: 'speed' }, false],
  ];
  for (const [args, expected] of cases) {
    assert.strictEqual(shouldAskProfile(args), expected, JSON.stringify(args));
  }
});

test('parseContext handles numbers and k/m suffixes, enforcing boundaries', () => {
  assert.equal(parseContext(8192), 8192);
  assert.equal(parseContext('8192'), 8192);
  assert.equal(parseContext('8k'), 8192);
  assert.equal(parseContext('8K'), 8192);
  assert.equal(parseContext('16k'), 16384);
  assert.equal(parseContext('32k'), 32768);
  assert.equal(parseContext('32768'), 32768);
  assert.equal(parseContext(' 16k '), 16384);
  assert.equal(parseContext('1m'), 1024 * 1024);
  // Boundary checks: minimum 512
  assert.equal(parseContext('512'), 512);
  assert.equal(parseContext('511'), null);
  assert.equal(parseContext('0'), null);
  assert.equal(parseContext('-16k'), null);
  // Limit checking
  assert.equal(parseContext('32k', 16384), null);
  assert.equal(parseContext('16k', 16384), 16384);
  // Invalid inputs
  assert.equal(parseContext('abc'), null);
  assert.equal(parseContext(''), null);
  assert.equal(parseContext(null), null);
  assert.equal(parseContext(undefined), null);
});

test('shouldAskProfile accepts context shorthand without prompting', () => {
  const all = { engine: 'lmstudio', model: 'qwen/qwen3-coder-30b', ctx: '16k' };
  assert.equal(shouldAskProfile(all), false);
  assert.equal(shouldAskProfile({ ...all, ctx: '32K' }), false);
});

