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

test('GET /api/engines/:engine/status returns running status, installed flag, version, and modelsDir', async (t) => {
  t.mock.method(ollama, 'detect', async () => ({
    installed: true,
    serverRunning: true,
    version: '0.5.1',
    apiUrl: 'http://127.0.0.1:11434',
    modelsDir: '/tmp/models',
    systemd: true,
    bin: '/usr/bin/ollama',
  }));

  const res = await fetch(`${url}/api/engines/ollama/status`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.deepStrictEqual(data, {
    engine: 'ollama',
    name: 'Ollama',
    installed: true,
    running: true,
    version: '0.5.1',
    apiUrl: 'http://127.0.0.1:11434',
    modelsDir: '/tmp/models',
    systemd: true,
    bin: '/usr/bin/ollama',
  });
});

test('GET /api/engines/:engine/status rejects unknown engine', async () => {
  const res = await fetch(`${url}/api/engines/unknownEngine/status`);
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.code, 'errors.unknownEngine');
});

test('GET /api/engines/:engine/ps returns active models and ollama.ps does not start a stopped server', async (t) => {
  const ensureMock = t.mock.method(ollama, 'ensureServer', async () => true);
  const stoppedResult = await ollama.ps({ detection: { serverRunning: false, apiUrl: 'http://127.0.0.1:1' } });
  assert.strictEqual(ensureMock.mock.callCount(), 0);
  assert.deepStrictEqual(stoppedResult, []);

  t.mock.method(ollama, 'detect', async () => ({
    installed: true,
    serverRunning: true,
    apiUrl: 'http://127.0.0.1:11434',
  }));
  t.mock.method(ollama, 'ps', async () => [
    {
      name: 'qwen:7b',
      model: 'qwen:7b',
      sizeBytes: 4000,
      sizeVram: 4000,
      quant: 'Q4_K_M',
      expiresAt: '2026-11-16T15:00:00Z',
    },
  ]);

  const res = await fetch(`${url}/api/engines/ollama/ps`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.engine, 'ollama');
  assert.ok(Array.isArray(data.models));
  assert.strictEqual(data.models[0].expiresAt, '2026-11-16T15:00:00Z');
});

test('POST /api/engines/:engine/unload validates model name and unloads model', async (t) => {
  const resBad = await fetch(`${url}/api/engines/ollama/unload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.strictEqual(resBad.status, 400);
  const dataBad = await resBad.json();
  assert.strictEqual(dataBad.code, 'errors.missingModelName');

  t.mock.method(ollama, 'detect', async () => ({
    installed: true,
    serverRunning: true,
    apiUrl: 'http://127.0.0.1:11434',
  }));
  const unloadMock = t.mock.method(ollama, 'unload', async (_ctx, model) => ({
    ok: true,
    unloaded: model,
  }));

  const res = await fetch(`${url}/api/engines/ollama/unload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'qwen:7b' }),
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.deepStrictEqual(data, { ok: true, unloaded: 'qwen:7b' });
  assert.strictEqual(unloadMock.mock.callCount(), 1);
});

test('GET /api/engines/:engine/models returns models list with hasPreset flag', async (t) => {
  t.mock.method(ollama, 'detect', async () => ({
    installed: true,
    serverRunning: true,
    apiUrl: 'http://127.0.0.1:11434',
  }));
  t.mock.method(ollama, 'listModels', async () => [
    { key: 'qwen:7b', name: 'qwen:7b', sizeBytes: 1000, arch: 'qwen2', quant: 'Q4_0' },
  ]);

  const res = await fetch(`${url}/api/engines/ollama/models`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.engine, 'ollama');
  assert.strictEqual(data.models.length, 1);
  assert.strictEqual(typeof data.models[0].hasPreset, 'boolean');
});

test('POST /api/engines/:engine/load quick-loads with safe defaults and flags unoptimized when no preset exists', async (t) => {
  const resBad = await fetch(`${url}/api/engines/ollama/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.strictEqual(resBad.status, 400);
  const dataBad = await resBad.json();
  assert.strictEqual(dataBad.code, 'errors.missingModelName');

  t.mock.method(ollama, 'detect', async () => ({
    installed: true,
    serverRunning: true,
    apiUrl: 'http://127.0.0.1:11434',
  }));

  const quickLoadMock = typeof ollama.quickLoad === 'function'
    ? t.mock.method(ollama, 'quickLoad', async () => ({ ok: true, model: 'qwen:7b' }))
    : null;
  const loadMock = t.mock.method(ollama, 'load', async () => ({ ok: true, model: 'qwen:7b' }));

  const res = await fetch(`${url}/api/engines/ollama/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'qwen:7b' }),
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.unoptimized, true);
  assert.strictEqual(data.presetUsed, false);
  assert.strictEqual((quickLoadMock?.mock.callCount() || 0) + loadMock.mock.callCount(), 1);
});

test('DELETE /api/engines/:engine/models validates model name and deletes model', async (t) => {
  const resBad = await fetch(`${url}/api/engines/ollama/models`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.strictEqual(resBad.status, 400);
  const dataBad = await resBad.json();
  assert.strictEqual(dataBad.code, 'errors.missingModelName');

  t.mock.method(ollama, 'detect', async () => ({
    installed: true,
    serverRunning: true,
    apiUrl: 'http://127.0.0.1:11434',
  }));
  const deleteMock = t.mock.method(ollama, 'deleteModel', async (_ctx, model) => ({
    ok: true,
    deleted: model,
  }));

  const res = await fetch(`${url}/api/engines/ollama/models`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'qwen:7b' }),
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.deepStrictEqual(data, { ok: true, deleted: 'qwen:7b' });
  assert.strictEqual(deleteMock.mock.callCount(), 1);
});

test('core ollama engine exposes ps() and unload() methods', () => {
  assert.strictEqual(typeof ollama.ps, 'function');
  assert.strictEqual(typeof ollama.unload, 'function');
});

test('core lmstudio engine exposes ps() and unload() methods', () => {
  assert.strictEqual(typeof lmstudio.ps, 'function');
  assert.strictEqual(typeof lmstudio.unload, 'function');
});
