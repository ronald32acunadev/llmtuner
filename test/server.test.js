import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_TUNER_CONFIG_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-server-'));
const { startServer } = await import('../src/web/server.js');

let server, url;
before(async () => { ({ server, url } = await startServer({ port: 0 })); });
after(() => server.close());

const get = (p) => fetch(url + p);
const post = (p, body) => fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? '' : JSON.stringify(body) });

test('settings default to English and system theme and can be changed', async () => {
  assert.deepEqual(await (await get('/api/settings')).json(), { lang: 'en', theme: 'system', locales: ['en', 'es'], themes: ['system', 'light', 'dark'] });
  const r = await post('/api/settings', { lang: 'es' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { lang: 'es', theme: 'system', locales: ['en', 'es'], themes: ['system', 'light', 'dark'] });
  assert.equal((await (await get('/api/settings')).json()).lang, 'es');
  await post('/api/settings', { lang: 'en' });
});

test('an unknown or missing language is rejected and nothing changes', async () => {
  for (const body of [{ lang: 'fr' }, {}, undefined]) {
    const r = await post('/api/settings', body);
    assert.equal(r.status, 400, JSON.stringify(body));
    const data = await r.json();
    assert.equal(data.code, 'errors.unknownLocale');
    assert.match(data.error, /Unknown language/);
  }
  assert.equal((await (await get('/api/settings')).json()).lang, 'en');
});

test('theme can be changed via POST /api/settings', async () => {
  const r = await post('/api/settings', { theme: 'dark' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { lang: 'en', theme: 'dark', locales: ['en', 'es'], themes: ['system', 'light', 'dark'] });
  assert.equal((await (await get('/api/settings')).json()).theme, 'dark');
  await post('/api/settings', { theme: 'system' });
});

test('an unknown theme is rejected with errors.unknownTheme and nothing changes', async () => {
  const r = await post('/api/settings', { theme: 'invalid' });
  assert.equal(r.status, 400);
  const data = await r.json();
  assert.equal(data.code, 'errors.unknownTheme');
  assert.match(data.error, /Unknown theme/);
  assert.equal((await (await get('/api/settings')).json()).theme, 'system');
});

test('catalog endpoint merges English under the locale', async () => {
  const es = await (await get('/api/i18n/es')).json();
  assert.equal(es.lang, 'es');
  assert.equal(es.messages['status.loading'], 'Cargando el modelo…');
  assert.equal((await get('/api/i18n/fr')).status, 404);
});

test('only /i18n/core.js is served from src/i18n', async () => {
  const r = await get('/i18n/core.js');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.match(await r.text(), /export function format/);
  assert.equal((await get('/i18n/en.js')).status, 404);
  assert.equal((await get('/i18n/../core/settings.js')).status, 404);
});

test('POST /api/chat rejects missing or invalid parameters', async () => {
  for (const body of [{}, { engine: 'ollama' }, { engine: 'ollama', model: 'test' }, { engine: 'ollama', model: 'test', messages: [] }]) {
    const r = await post('/api/chat', body);
    assert.equal(r.status, 400);
    const data = await r.json();
    assert.equal(data.code, 'errors.invalidChatRequest');
  }
});

test('POST /api/chat forwards messages to ollama and returns assistant reply', async () => {
  let receivedBody = null;
  const mockServer = http.createServer(async (req, res) => {
    let buf = '';
    for await (const chunk of req) buf += chunk;
    if (buf) {
      try { receivedBody = JSON.parse(buf); } catch {}
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url === '/api/version') {
      res.end(JSON.stringify({ version: '0.1.0' }));
    } else {
      res.end(JSON.stringify({ message: { role: 'assistant', content: 'Hello from mock Ollama!' } }));
    }
  });
  await new Promise((r) => mockServer.listen(0, '127.0.0.1', r));
  const mockPort = mockServer.address().port;
  process.env.OLLAMA_HOST = `127.0.0.1:${mockPort}`;
  try {
    const r = await post('/api/chat', {
      engine: 'ollama',
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hello!' }],
    });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.deepEqual(data, { message: { role: 'assistant', content: 'Hello from mock Ollama!' } });
    assert.equal(receivedBody.model, 'test-model');
    assert.deepEqual(receivedBody.messages, [{ role: 'user', content: 'Hello!' }]);
  } finally {
    mockServer.close();
    delete process.env.OLLAMA_HOST;
  }
});

test('POST /api/chat forwards messages to lmstudio and returns assistant reply', async () => {
  let receivedBody = null;
  const mockServer = http.createServer(async (req, res) => {
    let buf = '';
    for await (const chunk of req) buf += chunk;
    if (buf) {
      try { receivedBody = JSON.parse(buf); } catch {}
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url === '/api/v0/models') {
      res.end(JSON.stringify({ data: [] }));
    } else {
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Hello from mock LM Studio!' } }] }));
    }
  });
  await new Promise((r) => mockServer.listen(0, '127.0.0.1', r));
  const mockPort = mockServer.address().port;
  process.env.LM_STUDIO_HOST = `http://127.0.0.1:${mockPort}`;
  try {
    const r = await post('/api/chat', {
      engine: 'lmstudio',
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hello LM Studio!' }],
    });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.deepEqual(data, { message: { role: 'assistant', content: 'Hello from mock LM Studio!' } });
    assert.equal(receivedBody.model, 'test-model');
    assert.deepEqual(receivedBody.messages, [{ role: 'user', content: 'Hello LM Studio!' }]);
  } finally {
    mockServer.close();
    delete process.env.LM_STUDIO_HOST;
  }
});


