import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_TUNER_CONFIG_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-storage-'));
const { startServer } = await import('../src/web/server.js');
const { lmstudio } = await import('../src/core/engines/lmstudio.js');
const { ollama } = await import('../src/core/engines/ollama.js');

let server, url;
before(async () => {
  ({ server, url } = await startServer({ port: 0 }));
});
after(() => {
  server?.closeAllConnections?.();
  server?.close();
});

test('GET /api/engines/:engine/storage returns current storage path and canEdit flag', async () => {
  const res = await fetch(`${url}/api/engines/ollama/storage`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.engine, 'ollama');
  assert.ok('modelsDir' in data);
  assert.strictEqual(data.canEdit, true);
});

test('POST /api/engines/:engine/storage rejects missing path', async () => {
  const res = await fetch(`${url}/api/engines/ollama/storage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.strictEqual(res.status, 400);
});

test('LM Studio setModelsDir updates settings.json downloadsFolder', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'lmstudio-test-home-'));
  await fs.writeFile(path.join(tempHome, 'settings.json'), JSON.stringify({ downloadsFolder: '/old/path' }), 'utf8');

  const newDir = path.join(os.tmpdir(), 'new-models-dir');
  const ctx = { detection: { home: tempHome } };

  assert.strictEqual(typeof lmstudio.setModelsDir, 'function', 'lmstudio must have setModelsDir');
  const res = await lmstudio.setModelsDir(ctx, newDir);
  assert.strictEqual(res.ok, true);

  const updated = JSON.parse(await fs.readFile(path.join(tempHome, 'settings.json'), 'utf8'));
  assert.strictEqual(updated.downloadsFolder, newDir);
});

test('Ollama exposes setModelsDir function', () => {
  assert.strictEqual(typeof ollama.setModelsDir, 'function', 'ollama must have setModelsDir');
});
