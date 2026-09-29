import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli', 'index.js');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-cli-'));
const settings = path.join(dir, 'settings.json');
const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { env: { ...process.env, LLM_TUNER_CONFIG_DIR: dir }, encoding: 'utf8' });

beforeEach(async () => { await fs.rm(settings, { force: true }); });

test('help is in English by default', () => {
  const r = cli('--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage: llm-tuner/);
  assert.match(r.stdout, /--lang <en\|es>/);
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
