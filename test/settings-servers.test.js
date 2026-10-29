import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_TUNER_CONFIG_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-settings-servers-'));

const { 
  readSettings, 
  writeSettings, 
  settingsPath, 
  getActiveServer, 
  DEFAULT_SERVERS, 
  DEFAULT_ACTIVE_SERVER_ID 
} = await import('../src/core/settings.js');

beforeEach(async () => {
  await fs.rm(settingsPath(), { force: true });
});

test('default settings contains default servers and activeServerId', async () => {
  const settings = await readSettings();
  assert.deepEqual(settings.servers, DEFAULT_SERVERS);
  assert.strictEqual(settings.activeServerId, DEFAULT_ACTIVE_SERVER_ID);
});

test('adding a remote server strips trailing slash and updates active server', async () => {
  const remoteServer = { 
    id: 'remote1', 
    name: 'Remote GPU', 
    url: 'http://192.168.1.50:7860/', 
    token: 'tok123' 
  };

  const settingsToSave = {
    servers: [...DEFAULT_SERVERS, remoteServer],
    activeServerId: 'remote1'
  };

  await writeSettings(settingsToSave);
  const settings = await readSettings();

  const savedRemote = settings.servers.find(s => s.id === 'remote1');
  assert.strictEqual(savedRemote.url, 'http://192.168.1.50:7860');
  assert.strictEqual(settings.servers.length, DEFAULT_SERVERS.length + 1);
  assert.strictEqual(settings.activeServerId, 'remote1');
  
  const active = getActiveServer(settings);
  assert.strictEqual(active.id, 'remote1');
});

test('invalid activeServerId falls back to local', () => {
  const settings = {
    servers: DEFAULT_SERVERS,
    activeServerId: 'non-existent'
  };
  
  const active = getActiveServer(settings);
  assert.strictEqual(active.id, 'local');
});

test('legacy settings file without servers reads back defaults and preserves other fields', async () => {
  const legacyData = {
    lang: 'es',
    theme: 'dark'
  };

  await fs.writeFile(settingsPath(), JSON.stringify(legacyData));

  const settings = await readSettings();
  assert.deepEqual(settings.servers, DEFAULT_SERVERS);
  assert.strictEqual(settings.activeServerId, DEFAULT_ACTIVE_SERVER_ID);
  assert.strictEqual(settings.lang, 'es');
  assert.strictEqual(settings.theme, 'dark');
});
