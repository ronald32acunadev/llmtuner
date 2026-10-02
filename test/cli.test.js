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

