import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { TunerApiClient } from '../src/core/client.js';

const seen = { load: [], confirm: [] };
let server, baseUrl;

const readJson = async (req) => {
  let text = '';
  for await (const chunk of req) text += chunk;
  return JSON.parse(text);
};

before(async () => {
  server = http.createServer(async (req, res) => {
    if (req.url === '/api/load') {
      seen.load.push(await readJson(req));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ jobId: 'job-1' }));
    }
    if (req.url === '/api/jobs/job-1/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"type":"confirmation-required","confirmationId":"c1","preview":{"files":["a"]}}\n\n');
      res.write('data: {"type":"finished","ok":true,"outcome":"declined","result":{"applied":false}}\n\n');
      return res.end();
    }
    if (req.url === '/api/jobs/job-1/confirm') {
      seen.confirm.push(await readJson(req));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections(); server.close(); });

test('loadModel sends dryRun and confirm', async () => {
  seen.load.length = 0;
  seen.confirm.length = 0;
  const client = new TunerApiClient({ baseUrl });
  await client.loadModel(
    { engine: 'ollama', model: 'm', ctx: 1, dryRun: true, confirm: false },
    () => {},
  );
  assert.deepEqual(seen.load[0], {
    engine: 'ollama',
    model: 'm',
    ctx: 1,
    dryRun: true,
    confirm: false,
  });
});

test('a confirmation is answered through the callback', async () => {
  seen.load.length = 0;
  seen.confirm.length = 0;
  const previews = [];
  const client = new TunerApiClient({ baseUrl });
  const result = await client.loadModel(
    { engine: 'ollama', model: 'm', ctx: 1, dryRun: true, confirm: false },
    () => {},
    {
      confirmApply: async (preview) => {
        previews.push(preview);
        return false;
      },
    },
  );
  assert.deepEqual(previews, [{ files: ['a'] }]);
  assert.deepEqual(seen.confirm[0], { confirmationId: 'c1', accepted: false });
  assert.deepEqual(result, { applied: false });
});

test('without a callback no confirmation is sent', async () => {
  seen.load.length = 0;
  seen.confirm.length = 0;
  const client = new TunerApiClient({ baseUrl });
  const result = await client.loadModel(
    { engine: 'ollama', model: 'm', ctx: 1, dryRun: true, confirm: false },
    () => {},
  );
  assert.deepEqual(seen.confirm.length, 0);
  assert.deepEqual(result, { applied: false });
});

test('progress callback still receives the confirmation event', async () => {
  seen.load.length = 0;
  seen.confirm.length = 0;
  const types = [];
  const client = new TunerApiClient({ baseUrl });
  await client.loadModel(
    { engine: 'ollama', model: 'm', ctx: 1, dryRun: true, confirm: false },
    (event) => {
      types.push(event.type);
    },
  );
  assert.deepEqual(types, ['confirmation-required', 'finished']);
});

test('confirmLoad posts the decision', async () => {
  seen.load.length = 0;
  seen.confirm.length = 0;
  const client = new TunerApiClient({ baseUrl });
  const response = await client.confirmLoad(
    'job-1',
    { confirmationId: 'c9', accepted: true },
  );
  assert.deepEqual(response, { ok: true });
  assert.deepEqual(seen.confirm[0], { confirmationId: 'c9', accepted: true });
});
