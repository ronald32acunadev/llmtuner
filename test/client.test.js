import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { TunerApiClient } from '../src/core/client.js';

let server;
let baseUrl;
let client;

before(() => {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      if (req.headers['authorization'] !== 'Bearer test-token') {
        res.writeHead(401);
        return res.end('Unauthorized');
      }

      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;

      if (path === '/api/state' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ hw: { gpus: [] }, busy: false }));
      }

      if (path === '/api/models' && req.method === 'GET' && url.searchParams.get('engine') === 'ollama') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ models: [{ key: 'qwen' }] }));
      }

      if (path === '/api/plan' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ meta: {}, candidates: [] }));
      }

      if (path === '/api/presets' && req.method === 'GET' && url.searchParams.get('engine') === 'ollama') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ presets: [] }));
      }

      if (path === '/api/chat' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: { role: 'assistant', content: 'hello' } }));
      }

      if (path === '/api/load' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ jobId: 'job-123' }));
      }

      if (path === '/api/jobs/job-123/events' && req.method === 'GET') {
        res.writeHead(200, { 
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        res.write('data: {"type":"log","line":"tuning..."}\n\n');
        res.write('data: {"type":"finished","ok":true,"result":{"loaded":true}}\n\n');
        return res.end();
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      client = new TunerApiClient({ baseUrl, token: 'test-token' });
      resolve();
    });
  });
});

after(() => {
  return new Promise((resolve) => {
    if (server) {
      server.closeAllConnections?.();
      server.close(resolve);
    } else {
      resolve();
    }
  });
});

test('getState returns system state', async () => {
  const state = await client.getState();
  assert.deepStrictEqual(state, { hw: { gpus: [] }, busy: false });
});

test('listModels filters by engine', async () => {
  const data = await client.listModels('ollama');
  assert.deepStrictEqual(data, { models: [{ key: 'qwen' }] });
});

test('planModel sends request and returns candidates', async () => {
  const plan = await client.planModel({ engine: 'ollama', model: 'm', ctx: 2048 });
  assert.deepStrictEqual(plan, { meta: {}, candidates: [] });
});

test('listPresets filters by engine', async () => {
  const data = await client.listPresets({ engine: 'ollama' });
  assert.deepStrictEqual(data, { presets: [] });
});

test('chat returns assistant response', async () => {
  const response = await client.chat({ engine: 'ollama', model: 'm', messages: [] });
  assert.deepStrictEqual(response, { message: { role: 'assistant', content: 'hello' } });
});

test('loadModel tracks progress and returns result', async () => {
  const logs = [];
  const params = { engine: 'ollama', model: 'm', ctx: 2048 };
  
  const onProgress = (event) => {
    logs.push(event);
  };

  const result = await client.loadModel(params, onProgress);
  
  assert.deepStrictEqual(result, { loaded: true });
  assert.strictEqual(logs.length, 2);
  assert.strictEqual(logs[0].type, 'log');
  assert.strictEqual(logs[0].line, 'tuning...');
  assert.strictEqual(logs[1].type, 'finished');
});

test('TunerApiClient.fromSettings creates client from config', () => {
  const settings = { 
    servers: [{ id: 'srv', url: 'http://example.com', token: 'tok' }], 
    activeServerId: 'srv' 
  };
  const instance = TunerApiClient.fromSettings(settings);
  assert.strictEqual(instance.baseUrl, 'http://example.com');
  assert.strictEqual(instance.token, 'tok');
});
