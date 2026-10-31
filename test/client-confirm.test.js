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

async function eventsServer(onEvents) {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/load') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ jobId: 'j' }));
    }
    return onEvents(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const client = new TunerApiClient({ baseUrl: `http://127.0.0.1:${server.address().port}` });
  return { client, close: () => { server.closeAllConnections(); server.close(); } };
}
const request = { engine: 'ollama', model: 'm', ctx: 1 };

test('a failed job with a result returns that result', async () => {
  const { client, close } = await eventsServer((res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({
      type: 'finished',
      ok: false,
      outcome: 'manual',
      result: {
        applied: { pendingCommands: ['x'] },
        outcome: 'manual'
      }
    })}\n\n`);
    res.end();
  });

  try {
    const result = await client.loadModel(request, () => {});
    assert.deepEqual(result, {
      applied: { pendingCommands: ['x'] },
      outcome: 'manual'
    });
  } finally {
    close();
  }
});

test('a failed job without a result throws its translated code', async () => {
  const { client, close } = await eventsServer((res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({
      type: 'finished',
      ok: false,
      code: 'errors.noConfigWorked',
      params: {}
    })}\n\n`);
    res.end();
  });

  try {
    await assert.rejects(
      client.loadModel(request, () => {}),
      { name: 'TunerError', code: 'errors.noConfigWorked' }
    );
  } finally {
    close();
  }
});

test('a stream that ends early reports a lost connection', async (t) => {
  const { client, close } = await eventsServer((res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ type: 'status' }) + '\n\n');
  });
  try {
    await assert.rejects(
      client.loadModel(request, () => {}),
      { name: 'TunerError', code: 'web.connectionLost' }
    );
  } finally {
    close();
  }
});

test('a refused event stream reports the failure', async (t) => {
  const { client, close } = await eventsServer((res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 'errors.unauthorized' }));
  });
  try {
    await assert.rejects(
      client.loadModel(request, () => {}),
      { name: 'TunerError', code: 'errors.unauthorized' }
    );
  } finally {
    close();
  }
});

test('an API error keeps its code', async (t) => {
  const server = http.createServer((req, res) => {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'x',
      code: 'errors.invalidCandidateCount',
      params: {}
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const client = new TunerApiClient({ baseUrl: `http://127.0.0.1:${server.address().port}` });
  try {
    await assert.rejects(
      client.listModels('ollama'),
      { name: 'TunerError', code: 'errors.invalidCandidateCount', status: 400 }
    );
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
