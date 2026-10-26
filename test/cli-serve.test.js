import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_TUNER_CONFIG_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-serve-'));

const { parseCliArgs } = await import('../src/cli/router.js');
const { serveCommand, readServerConfig, serverConfigPath } = await import('../src/cli/commands/serve.js');

beforeEach(async () => {
  await fs.rm(serverConfigPath(), { force: true });
});

test('CLI parsing logic', async (t) => {
  await t.test('parse /serve with port', () => {
    const args = ['/serve', '--port', '9000'];
    const result = parseCliArgs(args);
    assert.deepEqual(result, { command: 'serve', port: '9000' });
  });

  await t.test('parse --serve with host and token', () => {
    const args = ['--serve', '--host', '127.0.0.1', '--token', 'test-tok'];
    const result = parseCliArgs(args);
    assert.deepEqual(result, { command: 'serve', host: '127.0.0.1', token: 'test-tok' });
  });
});

test('serveCommand with explicit token', async () => {
  let result;
  try {
    const options = { port: 0, host: '127.0.0.1', token: 'explicit-token-123' };
    result = await serveCommand(options);

    assert.strictEqual(result.token, 'explicit-token-123');
    
    const config = await readServerConfig();
    assert.strictEqual(config.token, 'explicit-token-123');

    const response = await fetch(`http://127.0.0.1:${result.port}/api/state`, {
      headers: { Authorization: `Bearer ${result.token}` }
    });
    assert.strictEqual(response.status, 200);
  } finally {
    if (result?.server) {
      await new Promise((resolve) => result.server.close(resolve));
    }
  }
});

test('serveCommand generates token when none provided', async () => {
  let result;
  try {
    const options = { port: 0, host: '127.0.0.1' };
    result = await serveCommand(options);

    assert.match(result.token, /^[a-f0-9]{64}$/);
  } finally {
    if (result?.server) {
      await new Promise((resolve) => result.server.close(resolve));
    }
  }
});
