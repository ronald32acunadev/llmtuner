import { test } from 'node:test';
import assert from 'node:assert/strict';
import { psCommand, formatTtl } from '../src/cli/commands/ps.js';

test('formatTtl formats seconds, minutes, expired, and empty values', () => {
  assert.strictEqual(formatTtl(null), '-');
  assert.strictEqual(formatTtl(''), '-');
  assert.strictEqual(formatTtl(new Date(Date.now() - 5000).toISOString()), 'expired');
  assert.strictEqual(formatTtl(new Date(Date.now() + 30000).toISOString()), '30s');
  assert.strictEqual(formatTtl(new Date(Date.now() + 125000).toISOString()), '2m');
});

test('psCommand (US-01 / AC-01) outputs formatted table with localized headers and TTL', async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (msg) => logs.push(msg);

  const mockHw = { gpus: [] };
  const mockEngines = {
    ollama: {
      detect: async () => ({ serverRunning: true }),
      ps: async () => [{
        name: 'llama3:8b',
        sizeVram: 4 * 1024 ** 3,
        quant: 'Q4_K_M',
        expiresAt: new Date(Date.now() + 120000).toISOString()
      }]
    }
  };

  try {
    const res = await psCommand({}, {
      lang: 'en',
      theme: 'dark',
      engines: mockEngines,
      detectHw: async () => mockHw
    });

    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].name, 'llama3:8b');

    const output = logs.join('\n');
    assert.match(output, /Engine/);
    assert.match(output, /Model/);
    assert.match(output, /VRAM/);
    assert.match(output, /Quant/);
    assert.match(output, /Expires \/ TTL/);
    assert.match(output, /ollama/);
    assert.match(output, /llama3:8b/);
    assert.match(output, /4\.00 GB/);
    assert.match(output, /Q4_K_M/);
    assert.match(output, /2m/);
  } finally {
    console.log = origLog;
  }
});

test('psCommand (US-01 / AC-02) prints cli.noActiveModels when no models are loaded', async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (msg) => logs.push(msg);

  const mockEngines = {
    ollama: {
      detect: async () => ({ serverRunning: true }),
      ps: async () => []
    },
    lmstudio: {
      detect: async () => ({ serverRunning: false })
    }
  };

  try {
    const res = await psCommand({}, {
      lang: 'en',
      theme: 'dark',
      engines: mockEngines,
      detectHw: async () => ({ gpus: [] })
    });

    assert.deepStrictEqual(res, []);
    assert.ok(logs.some(m => m.includes('No models currently loaded in memory')));
  } finally {
    console.log = origLog;
  }
});

test('psCommand (US-01 / AC-03) outputs json when args.json is true', async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (msg) => logs.push(msg);

  const mockEngines = {
    ollama: {
      detect: async () => ({ serverRunning: true }),
      ps: async () => [{
        name: 'qwen2.5:7b',
        sizeVram: 5 * 1024 ** 3,
        quant: 'Q5_K_M',
        expiresAt: null
      }]
    }
  };

  try {
    const res = await psCommand({ json: true }, {
      lang: 'en',
      theme: 'dark',
      engines: mockEngines,
      detectHw: async () => ({ gpus: [] })
    });

    assert.strictEqual(res.length, 1);
    assert.strictEqual(logs.length, 1);
    const parsed = JSON.parse(logs[0]);
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.active.length, 1);
    assert.strictEqual(parsed.active[0].name, 'qwen2.5:7b');
  } finally {
    console.log = origLog;
  }
});
