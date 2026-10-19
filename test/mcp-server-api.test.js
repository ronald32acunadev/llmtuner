import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../src/web/server.js';

test('GET /api/mcp/agents returns 200 with agent array', async (t) => {
  const { server, url } = await startServer({ port: 0 });
  t.after(() => {
    server.closeAllConnections?.();
    server.close();
  });

  const res = await fetch(`${url}/api/mcp/agents`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.agents));
  assert.equal(data.agents.length, 6);
  assert.ok(data.agents.some((a) => a.id === 'claude-desktop'));
});

test('POST /api/mcp/install validates input and returns result', async (t) => {
  const { server, url } = await startServer({ port: 0 });
  t.after(() => {
    server.closeAllConnections?.();
    server.close();
  });

  // Missing parameters
  const badRes = await fetch(`${url}/api/mcp/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(badRes.status, 400);

  // Valid install request
  const goodRes = await fetch(`${url}/api/mcp/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engineId: 'lmstudio', customName: 'test-lms', agentIds: [] })
  });
  assert.equal(goodRes.status, 200);
  const data = await goodRes.json();
  assert.equal(data.success, true);
  assert.deepEqual(data.updated, []);
});
