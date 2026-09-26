import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_TUNER_CONFIG_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-settings-'));
const { readSettings, writeSettings, settingsPath } = await import('../src/core/settings.js');
const { configDir } = await import('../src/core/util.js');
const { presetsDir } = await import('../src/core/presets.js');

beforeEach(async () => { await fs.rm(settingsPath(), { force: true }); });

test('config dir honours LLM_TUNER_CONFIG_DIR and presets live under it', () => {
  assert.equal(configDir(), process.env.LLM_TUNER_CONFIG_DIR);
  assert.equal(settingsPath(), path.join(process.env.LLM_TUNER_CONFIG_DIR, 'settings.json'));
  assert.equal(presetsDir(), path.join(process.env.LLM_TUNER_CONFIG_DIR, 'presets'));
});

test('default language is en when there is no file', async () => {
  assert.deepEqual(await readSettings(), { lang: 'en' });
});

test('corrupt or hand-edited files fall back to en', async () => {
  for (const content of ['{not json', 'null', '[]', '"es"', '{"lang":"fr"}', '{"lang":42}']) {
    await fs.writeFile(settingsPath(), content);
    assert.deepEqual(await readSettings(), { lang: 'en' }, content);
  }
});

test('writeSettings saves the language and readSettings reads it back', async () => {
  assert.deepEqual(await writeSettings({ lang: 'es' }), { lang: 'es' });
  assert.deepEqual(await readSettings(), { lang: 'es' });
  assert.equal(JSON.parse(await fs.readFile(settingsPath(), 'utf8')).lang, 'es');
});

test('writeSettings normalizes an unknown language to en', async () => {
  await writeSettings({ lang: 'es' });
  assert.deepEqual(await writeSettings({ lang: 'xx' }), { lang: 'en' });
});

test('writeSettings creates the config dir if needed', async () => {
  await fs.rm(process.env.LLM_TUNER_CONFIG_DIR, { recursive: true, force: true });
  await writeSettings({ lang: 'es' });
  assert.deepEqual(await readSettings(), { lang: 'es' });
});
