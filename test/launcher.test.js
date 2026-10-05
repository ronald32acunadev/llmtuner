import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAUNCH = path.join(ROOT, 'electron', 'launch.js');
const CLI = path.join(ROOT, 'src', 'cli', 'index.js');
const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-launch-'));
const emptyDist = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-dist-'));
const dataHome = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-data-'));
const settings = path.join(configDir, 'settings.json');

// Starts the launcher with a runtime directory that holds no executable.
const launch = () => spawnSync(process.execPath, [LAUNCH], { env: { ...process.env, LLM_TUNER_CONFIG_DIR: configDir, ELECTRON_OVERRIDE_DIST_PATH: emptyDist, XDG_DATA_HOME: dataHome }, encoding: 'utf8', timeout: 20000 });

beforeEach(async () => {
  await fs.rm(settings, { force: true });
});

test('both commands start with a shebang so npm can install them', async () => {
  for (const file of [LAUNCH, CLI]) {
    const content = await fs.readFile(file, 'utf8');
    const firstLine = content.split('\n')[0];
    assert.equal(firstLine, '#!/usr/bin/env node', path.relative(ROOT, file));
  }
});

test('a runtime that cannot start fails with exit code 1 and a clear message', () => {
  const r = launch();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Could not start the desktop app/);
  assert.match(r.stderr, /llm-tuner-desktop/);
  assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack trace');
});

test('the failure message follows the saved language', async () => {
  await fs.writeFile(settings, JSON.stringify({ lang: 'es' }));
  const r = launch();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No se pudo iniciar la aplicación de escritorio/);
});
