import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, DEFAULT_LOCALE, normalizeLocale, format, CATALOGS, t, messagesFor, errorText } from '../src/i18n/index.js';
import { TunerError, benchError } from '../src/core/errors.js';
import { installPlans } from '../src/core/installer.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMESPACES = ['engine', 'status', 'errors', 'install', 'bench', 'changes', 'candidate', 'common', 'cli', 'web'];
const KEY_RE = new RegExp(`["'\`]((?:${NAMESPACES.join('|')})\\.[A-Za-z0-9_.]+)["'\`]`, 'g');
const paramsOf = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

async function sourceFiles(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'i18n') out.push(...await sourceFiles(p)); }
    else if (/\.(js|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('locales and default', () => {
  assert.deepEqual(LOCALES, ['en', 'es']);
  assert.equal(DEFAULT_LOCALE, 'en');
});

test('normalizeLocale keeps known locales and falls back to en', () => {
  assert.equal(normalizeLocale('es'), 'es');
  assert.equal(normalizeLocale('en'), 'en');
  for (const bad of ['fr', 'ES', '', null, undefined, 42, {}]) assert.equal(normalizeLocale(bad), 'en');
});

test('format replaces params and leaves missing or null ones visible', () => {
  assert.equal(format('Hi {name}, {n} items', { name: 'Ana', n: 0 }), 'Hi Ana, 0 items');
  assert.equal(format('Hi {name}'), 'Hi {name}');
  assert.equal(format('Hi {name}', { name: null }), 'Hi {name}');
  assert.equal(format('Hi {name}', { name: undefined }), 'Hi {name}');
});

test('t falls back to English, then to the key itself', () => {
  CATALOGS.en['common.testOnly'] = 'English {x}';
  try {
    assert.equal(t('es', 'common.testOnly', { x: 1 }), 'English 1');
    assert.equal(t('fr', 'common.testOnly', { x: 2 }), 'English 2');
  } finally {
    delete CATALOGS.en['common.testOnly'];
  }
  assert.equal(t('es', 'common.doesNotExist'), 'common.doesNotExist');
});

test('messagesFor merges English under the locale', () => {
  CATALOGS.en['common.testOnly'] = 'EN';
  try {
    assert.equal(messagesFor('es')['common.testOnly'], 'EN');
    assert.equal(messagesFor('xx')['common.testOnly'], 'EN');
  } finally {
    delete CATALOGS.en['common.testOnly'];
  }
});

test('errorText shows plain errors verbatim', () => {
  assert.equal(errorText('es', new Error('ollama create failed: boom')), 'ollama create failed: boom');
  assert.equal(errorText('es', 'raw'), 'raw');
});

test('catalogs have the same keys and the same params per key', () => {
  const en = Object.keys(CATALOGS.en).sort();
  const es = Object.keys(CATALOGS.es).sort();
  assert.deepEqual(es, en);
  for (const key of en) assert.deepEqual(paramsOf(CATALOGS.es[key]), paramsOf(CATALOGS.en[key]), key);
});

test('every catalog key uses an allowed namespace', () => {
  for (const key of Object.keys(CATALOGS.en)) assert.ok(NAMESPACES.includes(key.split('.')[0]), key);
});

test('every key referenced in src/ exists in the English catalog', async () => {
  const missing = [];
  for (const file of await sourceFiles(path.join(ROOT, 'src'))) {
    const text = await fs.readFile(file, 'utf8');
    for (const m of text.matchAll(KEY_RE)) if (!(m[1] in CATALOGS.en)) missing.push(`${path.relative(ROOT, file)}: ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});

test('TunerError carries code, params and an English message', () => {
  const e = new TunerError('errors.unknownEngine', { engine: 'x' });
  assert.ok(e instanceof Error);
  assert.equal(e.name, 'TunerError');
  assert.equal(e.code, 'errors.unknownEngine');
  assert.deepEqual(e.params, { engine: 'x' });
  assert.equal(e.message, 'Unknown engine: x');
  assert.equal(errorText('es', e), 'Motor desconocido: x');
});

test('benchError returns a failed result with code and English text', () => {
  assert.deepEqual(benchError('bench.oom'), { ok: false, errorCode: 'bench.oom', errorParams: {}, error: 'Not enough VRAM (OOM)' });
});

test('install plans carry a translatable labelCode', async () => {
  for (const engine of ['ollama', 'lmstudio']) {
    for (const p of await installPlans(engine)) {
      assert.equal(p.label, undefined, p.id);
      assert.ok(p.labelCode in CATALOGS.en, p.labelCode);
    }
  }
});
