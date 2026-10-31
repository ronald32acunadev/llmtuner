import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_TUNER_CONFIG_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-dl-'));
const { startServer } = await import('../src/web/server.js');
const { Tuner } = await import('../src/core/tuner.js');

const installed = { ctx: { detection: { bin: '/b/ollama' } } };
const json = (body, headers = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

// Starts a server whose download runner is recorded instead of spawned.
async function withServer(options, run) {
  const calls = [];
  const runInstall = async (plan, onLine) => { calls.push(plan); onLine('pulling'); return options.result ?? { code: 0 }; };
  const started = await startServer({ port: 0, runInstall, ...options.server });
  try {
    await run(started.url, calls);
  } finally {
    started.server.closeAllConnections();
    started.server.close();
  }
}
const events = async (url, jobId) => (await (await fetch(`${url}/api/jobs/${jobId}/events`)).text())
  .split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)));

test('a local download streams its log and finishes', async (t) => {
  const create = t.mock.method(Tuner, 'create', async () => installed);
  await withServer({}, async (url, calls) => {
    const res = await fetch(`${url}/api/models/download`, json({ engine: 'ollama', name: 'llama3' }));
    assert.equal(res.status, 200);
    const body = await res.json();
    const jobId = body.jobId;
    const list = await events(url, jobId);
    assert.deepEqual(calls, [{ cmd: '/b/ollama', args: ['pull', 'llama3'] }]);
    assert.deepEqual(list[0], { type: 'log', line: 'pulling' });
    const last = list[list.length - 1];
    assert.equal(last.type, 'finished');
    assert.equal(last.ok, true);
    assert.equal(create.mock.callCount(), 1);
  });
});

test('a failing download reports the failure', async (t) => {
  const create = t.mock.method(Tuner, 'create', async () => installed);
  await withServer({ result: { code: 1 } }, async (url, calls) => {
    const res = await fetch(`${url}/api/models/download`, json({ engine: 'ollama', name: 'llama3' }));
    assert.equal(res.status, 200);
    const body = await res.json();
    const jobId = body.jobId;
    const list = await events(url, jobId);
    const last = list[list.length - 1];
    assert.equal(last.type, 'finished');
    assert.equal(last.ok, false);
    assert.equal(last.code, 'errors.modelDownloadFailed');
    assert.deepEqual(calls, [{ cmd: '/b/ollama', args: ['pull', 'llama3'] }]);
    assert.equal(create.mock.callCount(), 1);
  });
});

test('an invalid name creates no job', async (t) => {
  const create = t.mock.method(Tuner, 'create', async () => installed);
  await withServer({}, async (url, calls) => {
    const res = await fetch(`${url}/api/models/download`, json({ engine: 'ollama', name: '--help' }));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'errors.invalidModelName');
    assert.deepEqual(calls, []);
    assert.equal(create.mock.callCount(), 0);
  });
});

test('a remote caller is refused', async (t) => {
  const create = t.mock.method(Tuner, 'create', async () => installed);
  await withServer({ server: { serverMode: true, token: 'tok' } }, async (url, calls) => {
    const res = await fetch(`${url}/api/models/download`, json(
      { engine: 'ollama', name: 'llama3' },
      { Authorization: 'Bearer tok' }
    ));
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'errors.forbiddenRemote');
    assert.deepEqual(calls, []);
    assert.equal(create.mock.callCount(), 0);
  });
});

test('a foreign website is refused', async (t) => {
  const create = t.mock.method(Tuner, 'create', async () => installed);
  await withServer({}, async (url, calls) => {
    const res = await fetch(`${url}/api/models/download`, json(
      { engine: 'ollama', name: 'llama3' },
      { Origin: 'https://evil.example' }
    ));
    assert.equal(res.status, 403);
    assert.deepEqual(calls, []);
    assert.equal(create.mock.callCount(), 0);
  });
});

test('an active remote target is refused', async (t) => {
  const create = t.mock.method(Tuner, 'create', async () => installed);
  await withServer({ server: { serverMode: true } }, async (url, calls) => {
    // Set active remote
    await fetch(`${url}/api/settings`, json({
      servers: [
        { id: 'local', name: 'Local', url: 'http://127.0.0.1' },
        { id: 'r1', name: 'R', url: 'http://127.0.0.1:9' }
      ],
      activeServerId: 'r1'
    }));
    // Attempt download
    const res = await fetch(`${url}/api/models/download`, json({ engine: 'ollama', name: 'llama3' }));
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'errors.forbiddenRemote');
    assert.deepEqual(calls, []);
    // Reset active to local
    await fetch(`${url}/api/settings`, json({ activeServerId: 'local' }));
    assert.equal(create.mock.callCount(), 0);
  });
});
