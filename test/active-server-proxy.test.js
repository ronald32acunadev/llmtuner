import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_TUNER_CONFIG_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-proxy-'));
const { writeSettings } = await import('../src/core/settings.js');
const { startServer } = await import('../src/web/server.js');

let remoteServer, remoteUrl;
let localServer, localUrl;

before(async () => {
  remoteServer = http.createServer((req, res) => {
    const auth = req.headers['authorization'];
    if (auth !== 'Bearer test-remote-token') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    if (req.url === '/api/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        hw: { gpus: [{ name: 'Remote RTX 5070' }] },
        engines: [{ id: 'lmstudio' }]
      }));
    } else if (req.url === '/api/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: ['remote-model-1'] }));
    } else if (req.url === '/api/plan') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ meta: { name: 'remote-plan' } }));
    } else if (req.url === '/api/jobs/job-123/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"type":"progress","percent":50}\n\n');
      res.write('data: {"type":"finished","ok":true}\n\n');
      res.end();
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  await new Promise((resolve) => remoteServer.listen(0, '127.0.0.1', () => {
    remoteUrl = `http://127.0.0.1:${remoteServer.address().port}`;
    resolve();
  }));

  await writeSettings({
    servers: [
      { id: 'local', name: 'Local', url: 'http://127.0.0.1:7860', token: null },
      { id: 'remote1', name: 'Remote GPU', url: remoteUrl, token: 'test-remote-token' }
    ],
    activeServerId: 'remote1'
  });

  const started = await startServer({ port: 0 });
  localServer = started.server;
  localUrl = started.url;
});

after(() => {
  localServer?.closeAllConnections?.();
  localServer?.close();
  remoteServer?.closeAllConnections?.();
  remoteServer?.close();
});

test('GET /api/state proxies to active remote server', async () => {
  const res = await fetch(localUrl + '/api/state');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.hw.gpus, [{ name: 'Remote RTX 5070' }]);
  assert.deepEqual(body.engines, [{ id: 'lmstudio' }]);
});

test('GET /api/models proxies to active remote server', async () => {
  const res = await fetch(localUrl + '/api/models');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.models, ['remote-model-1']);
});

test('GET /api/settings remains local and unproxied', async () => {
  const res = await fetch(localUrl + '/api/settings');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.activeServerId, 'remote1');
});

test('POST /api/plan proxies to active remote server', async () => {
  const res = await fetch(localUrl + '/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine: 'lmstudio', model: 'm1' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.meta?.name, 'remote-plan');
});

test('GET /api/jobs/:id/events proxies SSE stream from active remote server', async () => {
  const res = await fetch(localUrl + '/api/jobs/job-123/events');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const text = await res.text();
  assert.ok(text.includes('"type":"progress"'));
  assert.ok(text.includes('"type":"finished"'));
});
