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
  assert.deepEqual(await (await get('/api/settings')).json(), { lang: 'en', theme: 'system', profile: null, locales: ['en', 'es'], themes: ['system', 'light', 'dark'], profiles: ['speed', 'balanced', 'quality'] });
  const r = await post('/api/settings', { lang: 'es' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { lang: 'es', theme: 'system', profile: null, locales: ['en', 'es'], themes: ['system', 'light', 'dark'], profiles: ['speed', 'balanced', 'quality'] });
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
  assert.deepEqual(await r.json(), { lang: 'en', theme: 'dark', profile: null, locales: ['en', 'es'], themes: ['system', 'light', 'dark'], profiles: ['speed', 'balanced', 'quality'] });
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

test('the load profile round-trips through the settings and an unknown one is rejected', async () => {
  const initial = await (await get('/api/settings')).json();
  assert.equal(initial.profile, null);
  assert.deepEqual(initial.profiles, ['speed', 'balanced', 'quality']);

  // A payload with only `profile` is a valid one.
  const r = await post('/api/settings', { profile: 'quality' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { lang: 'en', theme: 'system', profile: 'quality', locales: ['en', 'es'], themes: ['system', 'light', 'dark'], profiles: ['speed', 'balanced', 'quality'] });
  assert.equal((await (await get('/api/settings')).json()).profile, 'quality');

  for (const profile of ['turbo', null, 42]) {
    const bad = await post('/api/settings', { profile });
    assert.equal(bad.status, 400, JSON.stringify(profile));
    const data = await bad.json();
    assert.equal(data.code, 'errors.unknownProfile');
    assert.deepEqual(data.params, { profile: String(profile ?? ''), list: 'speed, balanced, quality' });
  }
  assert.equal((await (await get('/api/settings')).json()).profile, 'quality');
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

/** Mock Ollama on a random port: `respond(url, body)` returns the JSON to send, or null for a 404. Every request is recorded. */
async function mockOllama(respond) {
  const requests = [];
  const mock = http.createServer(async (req, res) => {
    let buf = '';
    for await (const chunk of req) buf += chunk;
    requests.push(`${req.method} ${req.url}`);
    // The version always answers, so the engine never tries to start a real server.
    const json = req.url === '/api/version' ? { version: '0.1.0' } : respond(req.url, buf ? JSON.parse(buf) : null);
    res.writeHead(json ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(json ?? { error: 'not found' }));
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  process.env.OLLAMA_HOST = `127.0.0.1:${mock.address().port}`;
  return { requests, close: () => { mock.close(); delete process.env.OLLAMA_HOST; } };
}

// Two tags of one model: same base name, parameter size, family and tag stem.
const TAGS = {
  models: ['Q4_K_M', 'Q8_0'].map((quant, i) => ({
    name: `tiny:1b-${quant.toLowerCase()}`,
    size: (i + 1) * 600_000_000,
    digest: `digest-${i}`,
    details: { family: 'llama', parameter_size: '1B', quantization_level: quant },
  })),
};
// Without a readable GGUF the engine builds the metadata from /api/show.
const SHOW = { model_info: { 'general.architecture': 'llama', 'llama.block_count': 4, 'llama.embedding_length': 512, 'llama.attention.head_count': 8, 'llama.context_length': 8192 } };
const unloadsOrMeasures = (requests) => requests.filter((r) => /\/api\/(ps|generate|chat)/.test(r));

test('POST /api/plan returns what each profile would load without unloading or measuring', async () => {
  const mock = await mockOllama((url) => (url === '/api/tags' ? TAGS : url === '/api/show' ? SHOW : null));
  try {
    const r = await post('/api/plan', { engine: 'ollama', model: 'tiny:1b-q8_0', ctx: 4096 });
    assert.equal(r.status, 200);
    const { profiles, candidates } = await r.json();
    assert.ok(Array.isArray(candidates));
    assert.equal(profiles?.variantSelect, true);
    assert.deepEqual(profiles.variants.map((v) => v.key), ['tiny:1b-q4_k_m', 'tiny:1b-q8_0']);
    assert.deepEqual(Object.keys(profiles.profiles), ['speed', 'balanced', 'quality']);
    assert.ok(['speed', 'balanced', 'quality'].includes(profiles.recommended.profile));
    assert.match(profiles.recommended.reasonCode, /^profile\.recommend\./);
    // Independent of the hardware: speed takes the lightest tag, balanced the requested one.
    assert.equal(profiles.profiles.speed.loads, 'tiny:1b-q4_k_m');
    assert.equal(profiles.profiles.balanced.loads, 'tiny:1b-q8_0');
    assert.ok(Array.isArray(profiles.hints));
    assert.deepEqual(unloadsOrMeasures(mock.requests), []);
  } finally {
    mock.close();
  }
});

test('POST /api/plan still answers with profiles: null when the profile plan fails', async () => {
  // Only the first /api/show answers: the plan reads the model, the profile plan cannot.
  let shows = 0;
  const mock = await mockOllama((url) => (url === '/api/tags' ? TAGS : url === '/api/show' && ++shows === 1 ? SHOW : null));
  try {
    const r = await post('/api/plan', { engine: 'ollama', model: 'tiny:1b-q8_0', ctx: 4096 });
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.meta.arch, 'llama');
    assert.ok(Array.isArray(data.candidates));
    assert.equal(data.profiles, null);
  } finally {
    mock.close();
  }
});

test('POST /api/load rejects an unknown profile before starting a job and stays free', async () => {
  // The mock knows no model, so a job fails on its first request: nothing is unloaded, measured or loaded.
  const mock = await mockOllama(() => null);
  try {
    const bad = await post('/api/load', { engine: 'ollama', model: 'missing:latest', ctx: 4096, profile: 'turbo' });
    assert.equal(bad.status, 400);
    const data = await bad.json();
    assert.equal(data.code, 'errors.unknownProfile');
    assert.deepEqual(data.params, { profile: 'turbo', list: 'speed, balanced, quality' });
    // Rejected before the engine was even detected.
    assert.deepEqual(mock.requests, []);

    // A valid profile right after is accepted: the rejection did not leave the server busy.
    const ok = await post('/api/load', { engine: 'ollama', model: 'missing:latest', ctx: 4096, profile: 'speed' });
    const started = await ok.json();
    assert.notEqual(started.code, 'errors.loadInProgress');
    assert.equal(ok.status, 200);
    // The event stream ends with the job; it failed because the mock has no such model.
    const stream = await (await get(`/api/jobs/${started.jobId}/events`)).text();
    const events = stream.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
    const finished = events.at(-1);
    assert.equal(finished.type, 'finished');
    assert.equal(finished.ok, false);
    assert.equal(finished.code, 'errors.ollamaUnknownModel');
    assert.deepEqual(unloadsOrMeasures(mock.requests), []);
  } finally {
    mock.close();
  }
});

test('web UI serves index.html with theme switch and style.css with theme tokens', async () => {
  const html = await (await get('/')).text();
  assert.match(html, /id="theme"/);
  assert.match(html, /class="[^"]*\btheme-switch\b[^"]*"/);
  assert.match(html, /data-i18n="web\.theme"/);
  assert.match(html, /id="settings-open"/);
  assert.match(html, /id="settings-drawer"/);
  assert.match(html, /id="settings-backdrop"/);

  const css = await (await get('/style.css')).text();
  assert.match(css, /--accent:\s*#00e5ff/);
  assert.match(css, /--accent:\s*#0284c7/);
  assert.match(css, /\.theme-switch/);
  assert.match(css, /\.settings-trigger/);
  assert.match(css, /\.drawer/);

  const js = await (await get('/app.js')).text();
  assert.match(js, /applyTheme/);
  assert.match(js, /#theme/);
  assert.match(js, /setupDrawer/);
});

test('web UI offers the load profile between the context and the Load button', async () => {
  const html = await (await get('/')).text();
  assert.match(html, /id="profile-options"[^>]*role="radiogroup"/);
  assert.match(html, /id="profile-label"[^>]*data-i18n="web\.profile"/);
  assert.match(html, /id="profile-detail"/);
  // Flow: context -> profile -> Load.
  const at = (needle) => html.indexOf(needle);
  assert.ok(at('id="ctx"') < at('id="profile-options"'));
  assert.ok(at('id="profile-options"') < at('id="load-btn"'));

  // The view-model is a module of its own, shared with the Node tests.
  const r = await get('/profile.js');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.match(await r.text(), /export function profileDetailLines/);

  const js = await (await get('/app.js')).text();
  assert.match(js, /from '\.\/profile\.js'/);
  assert.match(js, /type="radio"/);
  const css = await (await get('/style.css')).text();
  assert.match(css, /\.profile-option\.selected/);
});


