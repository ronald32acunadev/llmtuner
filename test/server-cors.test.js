import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../src/web/server.js';

let server, url;

before(async () => {
  ({ server, url } = await startServer({
    port: 0,
    token: 'secret-token-123',
    serverMode: true,
  }));
});

after(() => {
  server?.closeAllConnections?.();
  server?.close();
});

test('OPTIONS /api/state without Authorization header returns CORS preflight headers', async () => {
  const response = await fetch(`${url}/api/state`, {
    method: 'OPTIONS',
  });

  assert.ok(response.status === 200 || response.status === 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');

  const methods = response.headers.get('access-control-allow-methods') || '';
  assert.ok(methods.includes('GET'));
  assert.ok(methods.includes('POST'));
  assert.ok(methods.includes('OPTIONS'));

  const headers = response.headers.get('access-control-allow-headers') || '';
  assert.ok(headers.toLowerCase().includes('authorization'));
  assert.ok(headers.toLowerCase().includes('content-type'));
});

test('GET /api/state with Authorization header returns 200 and CORS origin header', async () => {
  const response = await fetch(`${url}/api/state`, {
    method: 'GET',
    headers: {
      Authorization: 'Bearer secret-token-123',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
});

test('GET /api/state without Authorization header returns 401 and CORS origin header', async () => {
  const response = await fetch(`${url}/api/state`, {
    method: 'GET',
  });

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
});
