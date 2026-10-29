import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_TUNER_CONFIG_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-settings-ui-'));
const { startServer } = await import('../src/web/server.js');

let server, url;
before(async () => {
  ({ server, url } = await startServer({ port: 0 }));
});
after(() => {
  server?.closeAllConnections?.();
  server?.close();
});

test('web UI index.html contains servers section and add-server modal', async () => {
  const res = await fetch(url + '/');
  const html = await res.text();

  assert.match(html, /id="server-select"/);
  assert.match(html, /id="add-server-btn"/);
  assert.match(html, /id="server-modal"/);
  assert.match(html, /id="server-form"/);
  assert.match(html, /data-i18n="web\.servers"/);
  assert.match(html, /data-i18n="web\.addServer"/);
});

test('web UI app.js contains server management logic', async () => {
  const res = await fetch(url + '/app.js');
  const js = await res.text();

  assert.match(js, /renderServerList/);
  assert.match(js, /#server-select/);
  assert.match(js, /#add-server-btn/);
  assert.match(js, /#server-form/);
});

test('API allows adding a remote server and switching activeServerId via POST /api/settings', async () => {
  const newServer = {
    id: 'gpu-box-1',
    name: 'GPU Box 1',
    url: 'http://192.168.1.100:7860',
    token: 'test-token-secret'
  };

  const postRes = await fetch(url + '/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      servers: [{ id: 'local', name: 'Local Machine', url: 'http://127.0.0.1:7860', token: null }, newServer],
      activeServerId: 'gpu-box-1'
    })
  });

  assert.strictEqual(postRes.status, 200);
  const data = await postRes.json();
  assert.strictEqual(data.activeServerId, 'gpu-box-1');
  const found = data.servers.find(s => s.id === 'gpu-box-1');
  assert.ok(found);
  assert.strictEqual(found.name, 'GPU Box 1');

  // Verify GET /api/settings reflects the change
  const getRes = await fetch(url + '/api/settings');
  const getData = await getRes.json();
  assert.strictEqual(getData.activeServerId, 'gpu-box-1');
});
