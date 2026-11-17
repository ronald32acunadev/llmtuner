import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enginesCommand } from '../src/cli/commands/engines.js';
import { NAV_BACK } from '../src/cli/nav.js';

test('enginesCommand (US-03 / AC-01) prints status and storage summary', async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (msg) => logs.push(msg);

  const mockEngines = {
    ollama: {
      name: 'Ollama',
      detect: async () => ({
        installed: true,
        serverRunning: true,
        version: '0.3.10',
        apiUrl: 'http://localhost:11434',
        modelsDir: '/var/lib/ollama'
      })
    }
  };

  try {
    const res = await enginesCommand({}, {
      lang: 'en',
      theme: 'dark',
      engines: mockEngines,
      detectHw: async () => ({ gpus: [] })
    });

    assert.ok(Array.isArray(res));
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].id, 'ollama');
    assert.strictEqual(res[0].running, true);
    assert.strictEqual(res[0].modelsDir, '/var/lib/ollama');

    const output = logs.join('\n');
    assert.match(output, /Ollama/);
    assert.match(output, /v0\.3\.10/);
    assert.match(output, /\/var\/lib\/ollama/);
  } finally {
    console.log = origLog;
  }
});

test('enginesCommand (US-03 / AC-01) outputs JSON with json: true', async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (msg) => logs.push(msg);

  const mockEngines = {
    lmstudio: {
      name: 'LM Studio',
      detect: async () => ({
        installed: true,
        serverRunning: false,
        version: '0.3.5',
        apiUrl: null,
        modelsDir: '/home/user/.cache/lm-studio'
      })
    }
  };

  try {
    const res = await enginesCommand({ json: true }, {
      lang: 'en',
      theme: 'dark',
      engines: mockEngines,
      detectHw: async () => ({ gpus: [] })
    });

    assert.ok(Array.isArray(res));
    assert.strictEqual(logs.length, 1);
    const parsed = JSON.parse(logs[0]);
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.engines.length, 1);
    assert.strictEqual(parsed.engines[0].id, 'lmstudio');
  } finally {
    console.log = origLog;
  }
});

test('enginesCommand (US-03 / AC-02) updates storage path via setModelsDir', async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (msg) => logs.push(msg);

  let updatedPath = null;
  const mockEngines = {
    ollama: {
      name: 'Ollama',
      detect: async () => ({ installed: true }),
      setModelsDir: async (ctx, p) => {
        updatedPath = p;
        return { ok: true, path: p, requiresRestart: true, manualCommand: 'sudo systemctl restart ollama' };
      }
    }
  };

  try {
    const res = await enginesCommand({ path: '/data/ollama-models', engine: 'ollama' }, {
      lang: 'en',
      theme: 'dark',
      engines: mockEngines,
      detectHw: async () => ({ gpus: [] })
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(updatedPath, '/data/ollama-models');
    const output = logs.join('\n');
    assert.match(output, /\/data\/ollama-models/);
    assert.match(output, /restart/i);
  } finally {
    console.log = origLog;
  }
});

test('enginesCommand prints privileged notice and omits updated notice when res.ok is false', async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (msg) => logs.push(msg);

  const mockEngines = {
    ollama: {
      name: 'Ollama',
      detect: async () => ({ installed: true }),
      setModelsDir: async (ctx, p) => ({
        ok: false,
        path: p,
        requiresRestart: true,
        manualCommand: 'sudo systemctl restart ollama',
        warning: 'cli.storagePermissionWarning'
      })
    }
  };

  try {
    const res = await enginesCommand({ path: '/data/ollama-models', engine: 'ollama' }, {
      lang: 'en',
      theme: 'dark',
      engines: mockEngines,
      detectHw: async () => ({ gpus: [] })
    });

    assert.strictEqual(res.ok, false);
    const output = logs.join('\n');
    assert.doesNotMatch(output, /Storage path updated to:/);
    assert.match(output, /Administrator permissions required/);
    assert.match(output, /sudo systemctl restart ollama/);
    assert.match(output, /Warning: The Ollama service user/);
  } finally {
    console.log = origLog;
  }
});

test('enginesCommand (US-03 / AC-03) interactive sub-menu executes inspect, models, storage, and back', async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (msg) => logs.push(msg);

  let setPathCalled = false;
  const mockEngines = {
    ollama: {
      name: 'Ollama',
      detect: async () => ({
        installed: true,
        serverRunning: true,
        version: '0.3.10',
        apiUrl: 'http://localhost:11434',
        modelsDir: '/var/lib/ollama'
      }),
      listModels: async () => [{ name: 'llama3:8b' }],
      setModelsDir: async (ctx, p) => {
        setPathCalled = true;
        return { ok: true, path: p, requiresRestart: false };
      }
    }
  };

  try {
    // 1. Test inspect action then back
    const selectInspectSequence = ['inspect', NAV_BACK];
    await enginesCommand({}, {
      interactive: true,
      lang: 'en',
      theme: 'dark',
      engines: mockEngines,
      detectHw: async () => ({ gpus: [] }),
      selectPrompt: async () => selectInspectSequence.shift()
    });

    // 2. Test models action then back
    const selectModelsSequence = ['models', 'ollama', NAV_BACK];
    await enginesCommand({}, {
      interactive: true,
      lang: 'en',
      theme: 'dark',
      engines: mockEngines,
      detectHw: async () => ({ gpus: [] }),
      selectPrompt: async () => selectModelsSequence.shift()
    });

    // 3. Test storage action then back
    const selectStorageSequence = ['storage', 'ollama', NAV_BACK];
    await enginesCommand({}, {
      interactive: true,
      lang: 'en',
      theme: 'dark',
      engines: mockEngines,
      detectHw: async () => ({ gpus: [] }),
      selectPrompt: async () => selectStorageSequence.shift(),
      inputPrompt: async () => '/new/storage'
    });
    assert.strictEqual(setPathCalled, true);
  } finally {
    console.log = origLog;
  }
});
