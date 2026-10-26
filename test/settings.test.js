import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_TUNER_CONFIG_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-settings-'));
const { readSettings, writeSettings, settingsPath, DEFAULT_SERVERS, DEFAULT_ACTIVE_SERVER_ID } = await import('../src/core/settings.js');
const { configDir } = await import('../src/core/util.js');
const { presetsDir } = await import('../src/core/presets.js');

const defaultExpected = (overrides = {}) => ({
  lang: 'en',
  theme: 'system',
  profile: null,
  servers: [...DEFAULT_SERVERS],
  activeServerId: DEFAULT_ACTIVE_SERVER_ID,
  ...overrides,
});

beforeEach(async () => { await fs.rm(settingsPath(), { force: true }); });

test('config dir honours LLM_TUNER_CONFIG_DIR and presets live under it', () => {
  assert.equal(configDir(), process.env.LLM_TUNER_CONFIG_DIR);
  assert.equal(settingsPath(), path.join(process.env.LLM_TUNER_CONFIG_DIR, 'settings.json'));
  assert.equal(presetsDir(), path.join(process.env.LLM_TUNER_CONFIG_DIR, 'presets'));
});

test('default language is en when there is no file', async () => {
  assert.deepEqual(await readSettings(), defaultExpected());
});

test('corrupt or hand-edited files fall back to en and system theme', async () => {
  for (const content of ['{not json', 'null', '[]', '"es"', '{"lang":"fr"}', '{"lang":42}', '{"theme":"neon"}', '{"theme":123}']) {
    await fs.writeFile(settingsPath(), content);
    assert.deepEqual(await readSettings(), defaultExpected(), content);
  }
});

test('writeSettings saves the language and readSettings reads it back', async () => {
  assert.deepEqual(await writeSettings({ lang: 'es' }), defaultExpected({ lang: 'es' }));
  assert.deepEqual(await readSettings(), defaultExpected({ lang: 'es' }));
  assert.equal(JSON.parse(await fs.readFile(settingsPath(), 'utf8')).lang, 'es');
});

test('writeSettings normalizes an unknown language to en', async () => {
  await writeSettings({ lang: 'es' });
  assert.deepEqual(await writeSettings({ lang: 'xx' }), defaultExpected({ lang: 'en' }));
});

test('writeSettings creates the config dir if needed', async () => {
  await fs.rm(process.env.LLM_TUNER_CONFIG_DIR, { recursive: true, force: true });
  await writeSettings({ lang: 'es' });
  assert.deepEqual(await readSettings(), defaultExpected({ lang: 'es' }));
});

test('writeSettings saves the theme and readSettings reads it back', async () => {
  assert.deepEqual(await writeSettings({ theme: 'dark', profile: null }), defaultExpected({ theme: 'dark' }));
  assert.deepEqual(await readSettings(), defaultExpected({ theme: 'dark' }));
  assert.equal(JSON.parse(await fs.readFile(settingsPath(), 'utf8')).theme, 'dark');
});

test('writeSettings normalizes an unknown theme to system', async () => {
  await writeSettings({ theme: 'dark', profile: null });
  assert.deepEqual(await writeSettings({ theme: 'invalid' }), defaultExpected());
  assert.deepEqual(await readSettings(), defaultExpected());
});

test('corrupt files fall back to theme: system', async () => {
  for (const content of ['{not json', 'null', '[]', '{"theme":"invalid"}', '{"theme":42}']) {
    await fs.writeFile(settingsPath(), content);
    assert.equal((await readSettings()).theme, 'system', content);
  }
});

test('profile is null when it was never chosen', async () => {
  assert.equal((await readSettings()).profile, null);
});

test('writeSettings saves the profile and readSettings reads it back', async () => {
  const expected = defaultExpected({ profile: 'quality' });
  assert.deepEqual(await writeSettings({ profile: 'quality' }), expected);
  assert.deepEqual(await readSettings(), expected);
  assert.deepEqual(JSON.parse(await fs.readFile(settingsPath(), 'utf8')), expected);
});

test('writeSettings ignores an invalid profile and keeps the stored one', async () => {
  const firstResult = await writeSettings({ profile: 'fast' });
  assert.equal(firstResult.profile, null);
  assert.equal(JSON.parse(await fs.readFile(settingsPath(), 'utf8')).profile, undefined);

  await writeSettings({ profile: 'speed' });

  for (const invalidValue of ['fast', 42, null, 'QUALITY']) {
    const result = await writeSettings({ profile: invalidValue });
    assert.equal(result.profile, 'speed');
    assert.equal((await readSettings()).profile, 'speed');
  }

  assert.deepEqual(await writeSettings({ lang: 'es' }), defaultExpected({ lang: 'es', profile: 'speed' }));
});

test('a corrupt or hand-edited profile reads as null', async () => {
  for (const content of ['{"profile":"fast"}', '{"profile":42}', '{"profile":null}', '[]', '{not json']) {
    await fs.writeFile(settingsPath(), content);
    assert.equal((await readSettings()).profile, null, content);
  }
});
