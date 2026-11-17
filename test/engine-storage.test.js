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

test('GET /api/engines/:engine/storage returns resolved modelsDir for Ollama and LM Studio', async (t) => {
  t.mock.method(lmstudio, 'detect', async () => ({
    installed: true,
    home: '/tmp/lms',
    modelsDir: '/tmp/lms/custom-models',
  }));

  const res = await fetch(`${url}/api/engines/lmstudio/storage`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.deepStrictEqual(data, {
    engine: 'lmstudio',
    modelsDir: '/tmp/lms/custom-models',
    canEdit: true,
  });
});

test('POST /api/engines/:engine/storage rejects missing or invalid path with 400', async () => {
  const resMissing = await fetch(`${url}/api/engines/ollama/storage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.strictEqual(resMissing.status, 400);
  const dataMissing = await resMissing.json();
  assert.strictEqual(dataMissing.code, 'errors.missingStoragePath');

  const tempFile = path.join(os.tmpdir(), `llm-tuner-storage-file-${Date.now()}`);
  await fs.writeFile(tempFile, 'not-a-directory', 'utf8');
  try {
    const resInvalid = await fetch(`${url}/api/engines/lmstudio/storage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: tempFile }),
    });
    assert.strictEqual(resInvalid.status, 400);
    const dataInvalid = await resInvalid.json();
    assert.strictEqual(dataInvalid.code, 'errors.invalidStoragePath');
  } finally {
    await fs.unlink(tempFile).catch(() => {});
  }
});

test('LM Studio setModelsDir updates settings.json downloadsFolder and creates directory', async () => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'lmstudio-test-home-'));
  await fs.writeFile(path.join(tempHome, 'settings.json'), JSON.stringify({ downloadsFolder: '/old/path' }), 'utf8');

  const newDir = path.join(os.tmpdir(), `new-models-dir-${Date.now()}`);
  const ctx = { detection: { home: tempHome } };

  assert.strictEqual(typeof lmstudio.setModelsDir, 'function', 'lmstudio must have setModelsDir');
  const res = await lmstudio.setModelsDir(ctx, newDir);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.path, newDir);
  assert.strictEqual(res.requiresRestart, false);

  const updated = JSON.parse(await fs.readFile(path.join(tempHome, 'settings.json'), 'utf8'));
  assert.strictEqual(updated.downloadsFolder, newDir);

  const st = await fs.stat(newDir);
  assert.strictEqual(st.isDirectory(), true);
  await fs.rm(newDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(tempHome, { recursive: true, force: true }).catch(() => {});
});

test('Ollama setModelsDir validates path and returns requiresRestart or manualCommand', async () => {
  const newOllamaDir = path.join(os.tmpdir(), `ollama-models-${Date.now()}`);
  const res = await ollama.setModelsDir({ detection: { systemd: false } }, newOllamaDir);
  assert.strictEqual(res.path, newOllamaDir);
  assert.strictEqual(res.requiresRestart, true);
  if (process.platform === 'linux') {
    // When unprivileged, writing to /etc/systemd/system fails, returning manualCommand
    assert.strictEqual(res.ok, false);
    assert.ok(res.manualCommand.includes('sudo mkdir -p /etc/systemd/system/ollama.service.d'));
    assert.ok(res.manualCommand.includes('sudo chown -R ollama:ollama'));
    assert.ok(res.manualCommand.includes('systemctl restart ollama'));
  }
  await fs.rm(newOllamaDir, { recursive: true, force: true }).catch(() => {});
});

test('Ollama setModelsDir warns when path is located under /home', async () => {
  const homeTarget = path.join(os.homedir(), `ollama-test-models-${Date.now()}`);
  try {
    const res = await ollama.setModelsDir({ detection: { systemd: true } }, homeTarget);
    if (process.platform === 'linux') {
      assert.strictEqual(res.warning, 'cli.storagePermissionWarning');
    }
  } finally {
    await fs.rm(homeTarget, { recursive: true, force: true }).catch(() => {});
  }
});

test('Ollama detect resolves modelsDir with R_OK when directory exists', async () => {
  const detection = await ollama.detect();
  assert.ok(detection);
  if (process.platform === 'linux') {
    // Should resolve path (e.g. /usr/share/ollama/.ollama/models) instead of null
    const exists = await fs.stat('/usr/share/ollama/.ollama/models').catch(() => null);
    if (exists) {
      assert.strictEqual(detection.modelsDir, '/usr/share/ollama/.ollama/models');
    }
  }
});
