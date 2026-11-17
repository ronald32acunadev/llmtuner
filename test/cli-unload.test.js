import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unloadCommand } from '../src/cli/commands/unload.js';
import { NAV_BACK } from '../src/cli/nav.js';

test('unloadCommand (US-02 / AC-01) with args.model unloads target model', async () => {
  let unloadedCall = null;
  const mockEngines = {
    ollama: {
      detect: async () => ({ serverRunning: true }),
      ps: async () => [{ name: 'llama3:8b' }],
      unload: async (ctx, model) => { unloadedCall = { engine: 'ollama', model }; }
    }
  };

  const res = await unloadCommand({ model: 'llama3:8b' }, {
    lang: 'en',
    theme: 'dark',
    engines: mockEngines,
    detectHw: async () => ({ gpus: [] })
  });

  assert.deepStrictEqual(res, { ok: true, unloaded: 'llama3:8b' });
  assert.deepStrictEqual(unloadedCall, { engine: 'ollama', model: 'llama3:8b' });
});

test('unloadCommand (US-02 / AC-01) reports error when specified model is not found', async () => {
  const mockEngines = {
    ollama: {
      detect: async () => ({ serverRunning: true }),
      ps: async () => []
    }
  };

  const res = await unloadCommand({ model: 'unknown-model' }, {
    lang: 'en',
    theme: 'dark',
    engines: mockEngines,
    detectHw: async () => ({ gpus: [] })
  });

  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'Model not found');
});

test('unloadCommand (US-02 / AC-02) prompts and unloads chosen model', async () => {
  let unloadedCall = null;
  const mockEngines = {
    ollama: {
      detect: async () => ({ serverRunning: true }),
      ps: async () => [{ name: 'mistral:latest' }],
      unload: async (ctx, model) => { unloadedCall = { engine: 'ollama', model }; }
    }
  };

  const res = await unloadCommand({}, {
    lang: 'en',
    theme: 'dark',
    engines: mockEngines,
    detectHw: async () => ({ gpus: [] }),
    selectPrompt: async ({ choices }) => choices[0].value
  });

  assert.deepStrictEqual(res, { ok: true, unloaded: 'mistral:latest' });
  assert.deepStrictEqual(unloadedCall, { engine: 'ollama', model: 'mistral:latest' });
});

test('unloadCommand (US-02 / AC-02) returns cancelled on NAV_BACK', async () => {
  const mockEngines = {
    ollama: {
      detect: async () => ({ serverRunning: true }),
      ps: async () => [{ name: 'mistral:latest' }],
      unload: async () => {}
    }
  };

  const res = await unloadCommand({}, {
    lang: 'en',
    theme: 'dark',
    engines: mockEngines,
    detectHw: async () => ({ gpus: [] }),
    selectPrompt: async () => NAV_BACK
  });

  assert.deepStrictEqual(res, { ok: false, cancelled: true });
});

test('unloadCommand (US-02 / AC-03) prints cli.noActiveModels when no models are active', async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (msg) => logs.push(msg);

  const mockEngines = {
    ollama: {
      detect: async () => ({ serverRunning: false })
    }
  };

  try {
    const res = await unloadCommand({}, {
      lang: 'en',
      theme: 'dark',
      engines: mockEngines,
      detectHw: async () => ({ gpus: [] })
    });

    assert.deepStrictEqual(res, { ok: true, unloaded: null });
    assert.ok(logs.some(m => m.includes('No models currently loaded in memory')));
  } finally {
    console.log = origLog;
  }
});
