import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_TUNER_CONFIG_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-engine-mgmt-'));
const { startServer } = await import('../src/web/server.js');
const { ollama } = await import('../src/core/engines/ollama.js');
const { lmstudio } = await import('../src/core/engines/lmstudio.js');

let server, url;
before(async () => {
  ({ server, url } = await startServer({ port: 0 }));
});
after(() => {
  server?.closeAllConnections?.();
  server?.close();
});

test('GET /api/engines/:engine/status returns running status and version', async () => {
  const res = await fetch(`${url}/api/engines/ollama/status`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.engine, 'ollama');
  assert.strictEqual(typeof data.running, 'boolean');
  assert.strictEqual(typeof data.apiUrl, 'string');
});

test('GET /api/engines/:engine/status rejects unknown engine', async () => {
  const res = await fetch(`${url}/api/engines/unknownEngine/status`);
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.match(data.error || data.code, /unknownEngine|errors\.unknownEngine/);
});

test('GET /api/engines/:engine/ps returns list of active models', async () => {
  const res = await fetch(`${url}/api/engines/ollama/ps`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.engine, 'ollama');
  assert.ok(Array.isArray(data.models), 'models must be an array');
});

test('POST /api/engines/:engine/unload rejects missing model name', async () => {
  const res = await fetch(`${url}/api/engines/ollama/unload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.strictEqual(res.status, 400);
});

test('core ollama engine exposes ps() and unload() methods', () => {
  assert.strictEqual(typeof ollama.ps, 'function');
  assert.strictEqual(typeof ollama.unload, 'function');
});

test('core lmstudio engine exposes ps() and unload() methods', () => {
  assert.strictEqual(typeof lmstudio.ps, 'function');
  assert.strictEqual(typeof lmstudio.unload, 'function');
});

test('GET /api/engines/:engine/models returns models list', async () => {
  const res = await fetch(`${url}/api/engines/ollama/models`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.engine, 'ollama');
  assert.ok(Array.isArray(data.models));
});

test('DELETE /api/engines/:engine/models rejects missing model name', async () => {
  const res = await fetch(`${url}/api/engines/ollama/models`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.strictEqual(res.status, 400);
});

test('POST /api/engines/:engine/load rejects missing model name', async () => {
  const res = await fetch(`${url}/api/engines/ollama/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.strictEqual(res.status, 400);
});
