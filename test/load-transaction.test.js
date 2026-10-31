import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_TUNER_CONFIG_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-tx-'));
const { startServer } = await import('../src/web/server.js');
const { Tuner } = await import('../src/core/tuner.js');

let server, url;
before(async () => { ({ server, url } = await startServer({ port: 0 })); });
after(() => { server.closeAllConnections?.(); server.close(); });

const post = (p, body) => fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const startLoad = async (extra = {}) => (await post('/api/load', { engine: 'ollama', model: 'm', ctx: 4096, ...extra })).json();

async function readEvents(baseUrl, jobId, onEvent = () => {}, signal) {
  const response = await fetch(`${baseUrl}/api/jobs/${jobId}/events`, { signal });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) return events;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop();
    for (const part of parts) {
      if (!part.startsWith('data: ')) continue;
      const event = JSON.parse(part.slice(6));
      events.push(event);
      await onEvent(event);
    }
  }
}
const finishedOf = (events) => events.find((e) => e.type === 'finished');

const confirmingTuner = () => ({
  on() {},
  async load(model, ctx, opts) {
    const accepted = await opts.confirmApply({ files: ['a.json'] });
    return accepted ? { loaded: { ok: true } } : { applied: false };
  },
});

test('invalidCandidateCountZero', async (t) => {
  const create = t.mock.method(Tuner, 'create', async () => ({ on() {}, async load() {} }));
  const res = await post('/api/load', { engine: 'ollama', model: 'm', ctx: 4096, candidates: 0 });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.code, 'errors.invalidCandidateCount');
  assert.equal(create.mock.callCount(), 0);
});

test('invalidCandidateCountNegative', async (t) => {
  const create = t.mock.method(Tuner, 'create', async () => ({ on() {}, async load() {} }));
  const res = await post('/api/load', { engine: 'ollama', model: 'm', ctx: 4096, candidates: -1 });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.code, 'errors.invalidCandidateCount');
  assert.equal(create.mock.callCount(), 0);
});

test('invalidCandidateCountFloat', async (t) => {
  const create = t.mock.method(Tuner, 'create', async () => ({ on() {}, async load() {} }));
  const res = await post('/api/load', { engine: 'ollama', model: 'm', ctx: 4096, candidates: 1.5 });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.code, 'errors.invalidCandidateCount');
  assert.equal(create.mock.callCount(), 0);
});

test('invalidCandidateCountString', async (t) => {
  const create = t.mock.method(Tuner, 'create', async () => ({ on() {}, async load() {} }));
  const res = await post('/api/load', { engine: 'ollama', model: 'm', ctx: 4096, candidates: '3' });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.code, 'errors.invalidCandidateCount');
  assert.equal(create.mock.callCount(), 0);
});

test('nonBooleanDryRunCreatesNoJob', async (t) => {
  const create = t.mock.method(Tuner, 'create', async () => ({ on() {}, async load() {} }));
  const res = await post('/api/load', { engine: 'ollama', model: 'm', ctx: 4096, dryRun: 'yes' });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.code, 'errors.invalidLoadOption');
  assert.equal(create.mock.callCount(), 0);
});

test('explicitCandidatesAndDryRunReachTunerFinishPreview', async (t) => {
  let opts;
  const fake = { on() {}, async load(model, ctx, options) { opts = options; return { preview: {} }; } };
  t.mock.method(Tuner, 'create', async () => fake);
  const job = await startLoad({ candidates: 7, dryRun: true });
  const events = await readEvents(url, job.jobId, async (e) => {});
  assert.equal(opts.maxCandidates, 7);
  assert.equal(opts.dryRun, true);
  const finished = finishedOf(events);
  assert.ok(finished.ok);
  assert.equal(finished.outcome, 'preview');
});

test('omittedConfirmKeepsAutoApply', async (t) => {
  const fake = { on() {}, async load(model, ctx, opts) { return { loaded: { ok: true } }; } };
  const create = t.mock.method(Tuner, 'create', async () => fake);
  const job = await startLoad({ confirm: true });
  const events = await readEvents(url, job.jobId);
  const finished = finishedOf(events);
  assert.equal(finished.outcome, 'loaded');
  assert.equal(finished.ok, true);
});

test('acceptingConfirmationLoads', async (t) => {
  t.mock.method(Tuner, 'create', async () => confirmingTuner());
  const job = await startLoad({ confirm: true });
  const events = await readEvents(url, job.jobId, async (e) => {
    if (e.type === 'confirmation-required') {
      const res = await post(`/api/jobs/${job.jobId}/confirm`, { confirmationId: e.confirmationId, accepted: true });
      assert.equal(res.status, 200);
    }
  });
  const required = events.find((e) => e.type === 'confirmation-required');
  assert.deepEqual(required.preview, { files: ['a.json'] });
  const resolved = events.find((e) => e.type === 'confirmation-resolved');
  assert.ok(resolved.accepted);
  const finished = finishedOf(events);
  assert.equal(finished.outcome, 'loaded');
  assert.ok(finished.ok);
});

test('decliningConfirmationIsValidOutcome', async (t) => {
  const tuner = confirmingTuner();
  const create = t.mock.method(Tuner, 'create', async () => tuner);
  const job = await startLoad({ confirm: true });
  const events = await readEvents(url, job.jobId, async (e) => {
    if (e.type === 'confirmation-required') {
      await post(`/api/jobs/${job.jobId}/confirm`, { confirmationId: e.confirmationId, accepted: false });
    }
  });
  const resolvedEvent = events.find(e => e.type === 'confirmation-resolved' && !e.accepted);
  assert.equal(resolvedEvent.accepted, false);
  const finished = finishedOf(events);
  assert.equal(finished.outcome, 'declined');
  assert.equal(finished.ok, true);
});

test('wrongAndDuplicateConfirmationIdsConflict', async (t) => {
  const tuner = confirmingTuner();
  const create = t.mock.method(Tuner, 'create', async () => tuner);
  const job = await startLoad({ confirm: true });
  const events = await readEvents(url, job.jobId, async (e) => {
    if (e.type === 'confirmation-required') {
      await post(`/api/jobs/${job.jobId}/confirm`, { confirmationId: 'nope', accepted: true }).catch(() => {});
      await post(`/api/jobs/${job.jobId}/confirm`, { confirmationId: e.confirmationId, accepted: 'yes' }).catch(() => {});
      await post(`/api/jobs/${job.jobId}/confirm`, { confirmationId: e.confirmationId, accepted: true });
    }
  });
  const resolvedEvent = events.find(e => e.type === 'confirmation-resolved' && e.accepted);
  assert.equal(resolvedEvent.accepted, true);
  const finished = finishedOf(events);
  assert.equal(finished.outcome, 'loaded');
});

test('unknownJobConfirmationNotFound', async (t) => {
  const tuner = confirmingTuner();
  const create = t.mock.method(Tuner, 'create', async () => tuner);
  await post('/api/jobs/does-not-exist/confirm', { confirmationId: 'x', accepted: true });
  const res = await fetch(`${url}/api/jobs/does-not-exist/confirm`, { method: 'POST' });
  assert.equal(res.status, 404);
});

test('confirmationOnJobWithoutOneConflicts', async (t) => {
  const fake = { on() {}, async load() { return { loaded: { ok: true } }; } };
  t.mock.method(Tuner, 'create', async () => fake);
  const job = await startLoad({});
  const events = await readEvents(url, job.jobId, async (e) => {});
  const res = await post(`/api/jobs/${job.jobId}/confirm`, { confirmationId: 'c', accepted: true });
  assert.equal(res.status, 409);
});

test('disconnectingOnlySubscriberDeclines', async (t) => {
  const tuner = confirmingTuner();
  const create = t.mock.method(Tuner, 'create', async () => tuner);
  const job = await startLoad({ confirm: true });
  const controller = new AbortController();
  const eventsPromise = readEvents(url, job.jobId, async (e) => {
    if (e.type === 'confirmation-required') controller.abort();
  }, controller.signal).catch(() => {});
  await eventsPromise;
  const events = await readEvents(url, job.jobId);
  const resolvedEvent = events.find(e => e.type === 'confirmation-resolved' && e.reason === 'disconnected');
  assert.equal(resolvedEvent.accepted, false);
  const finished = finishedOf(events);
  assert.equal(finished.outcome, 'declined');
});

test('proxiedJobStaysBoundToServerCreatedIt', async () => {
  const seen = [];
  const remote = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, authorization: req.headers.authorization });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.url === '/api/load' ? { jobId: 'remote-job' } : { ok: true }));
  });
  await new Promise((resolve) => remote.listen(0, '127.0.0.1', resolve));
  const remoteUrl = `http://127.0.0.1:${remote.address().port}`;
  try {
    await post('/api/settings', { servers: [{ id: 'local', name: 'Local', url: 'http://127.0.0.1' }, { id: 'r1', name: 'R', url: remoteUrl, token: 'tok' }], activeServerId: 'r1' });
    const job = await startLoad({ confirm: true });
    assert.equal(job.jobId, 'remote-job');
    await post('/api/settings', { activeServerId: 'local' });
    // POST /api/jobs/remote-job/confirm with { confirmationId: 'c', accepted: true }, assert status 200,
    // find the entry in seen whose url is '/api/jobs/remote-job/confirm', assert its authorization is 'Bearer tok'.
    const confirmRes = await post(`/api/jobs/${job.jobId}/confirm`, { confirmationId: 'c', accepted: true });
    assert.equal(confirmRes.status, 200);
    const remoteHeader = seen.find(r => r.url === `/api/jobs/${job.jobId}/confirm`).authorization;
    assert.equal(remoteHeader, `Bearer tok`);
  } finally {
    await post('/api/settings', { activeServerId: 'local' });
    remote.closeAllConnections();
    remote.close();
  }
});
