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
  assert.deepEqual(await readSettings(), { lang: 'en', theme: 'system' });
});

test('corrupt or hand-edited files fall back to en and system theme', async () => {
  for (const content of ['{not json', 'null', '[]', '"es"', '{"lang":"fr"}', '{"lang":42}', '{"theme":"neon"}', '{"theme":123}']) {
    await fs.writeFile(settingsPath(), content);
    assert.deepEqual(await readSettings(), { lang: 'en', theme: 'system' }, content);
  }
});

test('writeSettings saves the language and readSettings reads it back', async () => {
  assert.deepEqual(await writeSettings({ lang: 'es' }), { lang: 'es', theme: 'system' });
  assert.deepEqual(await readSettings(), { lang: 'es', theme: 'system' });
  assert.equal(JSON.parse(await fs.readFile(settingsPath(), 'utf8')).lang, 'es');
});

test('writeSettings normalizes an unknown language to en', async () => {
  await writeSettings({ lang: 'es' });
  assert.deepEqual(await writeSettings({ lang: 'xx' }), { lang: 'en', theme: 'system' });
});

test('writeSettings creates the config dir if needed', async () => {
  await fs.rm(process.env.LLM_TUNER_CONFIG_DIR, { recursive: true, force: true });
  await writeSettings({ lang: 'es' });
  assert.deepEqual(await readSettings(), { lang: 'es', theme: 'system' });
});

test('writeSettings saves the theme and readSettings reads it back', async () => {
  assert.deepEqual(await writeSettings({ theme: 'dark' }), { lang: 'en', theme: 'dark' });
  assert.deepEqual(await readSettings(), { lang: 'en', theme: 'dark' });
  assert.equal(JSON.parse(await fs.readFile(settingsPath(), 'utf8')).theme, 'dark');
});

test('writeSettings normalizes an unknown theme to system', async () => {
  await writeSettings({ theme: 'dark' });
  assert.deepEqual(await writeSettings({ theme: 'invalid' }), { lang: 'en', theme: 'system' });
  assert.deepEqual(await readSettings(), { lang: 'en', theme: 'system' });
});

test('corrupt files fall back to theme: system', async () => {
  for (const content of ['{not json', 'null', '[]', '{"theme":"invalid"}', '{"theme":42}']) {
    await fs.writeFile(settingsPath(), content);
    assert.equal((await readSettings()).theme, 'system', content);
  }
});
