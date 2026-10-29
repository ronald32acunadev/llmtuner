import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('preload bridge wiring', async () => {
  const preloadUrl = new URL('../electron/preload.cjs', import.meta.url);
  const code = await fs.readFile(preloadUrl, 'utf8');
  const calls = [];
  const exposed = {};

  const context = {
    require: (name) => {
      if (name === 'electron') return {
        contextBridge: { exposeInMainWorld: (n, api) => { exposed[n] = api; } },
        ipcRenderer: { invoke: async (...args) => { calls.push(args); return args[0]; } }
      };
      throw new Error(`Unknown module ${name}`);
    }
  };

  vm.runInNewContext(code, context);
  assert.strictEqual(Object.keys(exposed).length, 1);
  assert.ok('llmTunerServer' in exposed);

  const api = exposed.llmTunerServer;
  const keys = Object.keys(api).sort();
  assert.deepEqual(keys, ['copyToken', 'getAutostartStatus', 'revealConnection', 'setAutostartEnabled'].sort());

  const res1 = await api.getAutostartStatus();
  const res2 = await api.setAutostartEnabled(true);
  const res3 = await api.revealConnection();
  const res4 = await api.copyToken();

  assert.strictEqual(res1, 'llm-tuner:server-autostart-status');
  assert.strictEqual(res2, 'llm-tuner:server-autostart-set');
  assert.strictEqual(res3, 'llm-tuner:server-connection-reveal');
  assert.strictEqual(res4, 'llm-tuner:server-token-copy');

  assert.deepEqual(calls, [
    ['llm-tuner:server-autostart-status'],
    ['llm-tuner:server-autostart-set', true],
    ['llm-tuner:server-connection-reveal'],
    ['llm-tuner:server-token-copy']
  ]);
});

test('main and launch structural checks', async () => {
  const main = await fs.readFile(new URL('../electron/main.js', import.meta.url), 'utf8');
  const launch = await fs.readFile(new URL('../electron/launch.js', import.meta.url), 'utf8');

  assert.ok(main.includes('isTrustedServerSender'));
  assert.ok(main.includes('preload.cjs'));
  assert.ok(main.includes('ipcMain.handle'));
  assert.ok(/\s*env\.LLM_TUNER_NODE_EXEC_PATH\s*=\s*process\.execPath/.test(launch));
});
