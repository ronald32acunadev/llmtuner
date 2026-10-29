import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startSavedServer } from '../src/cli/server-login.js';

test('login launcher reuses the saved host, port, and token without changing them', async () => {
  const environment = {};
  const calls = [];
  await startSavedServer({
    configDir: '/tmp/llm-tuner-config',
    environment,
    readConfig: async () => ({ host: '192.168.1.10', port: 8123, token: 'saved-token' }),
    start: async (options) => { calls.push(options); return 'server-handle'; },
  });
  assert.equal(environment.LLM_TUNER_CONFIG_DIR, '/tmp/llm-tuner-config');
  assert.deepEqual(calls, [{ host: '192.168.1.10', port: 8123, token: 'saved-token' }]);
});

test('login launcher rejects invalid configuration before starting the server', async () => {
  let started = false;
  await assert.rejects(startSavedServer({
    configDir: '/tmp/llm-tuner-config',
    environment: {},
    readConfig: async () => ({ host: '0.0.0.0', port: 7860 }),
    start: async () => { started = true; },
  }), /server configuration .* invalid/i);
  assert.equal(started, false);
});
