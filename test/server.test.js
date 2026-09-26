import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
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

test('settings default to English and can be changed', async () => {
  assert.deepEqual(await (await get('/api/settings')).json(), { lang: 'en', locales: ['en', 'es'] });
  const r = await post('/api/settings', { lang: 'es' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { lang: 'es', locales: ['en', 'es'] });
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
