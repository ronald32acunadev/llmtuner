import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mcpCommand } from '../src/cli/commands/mcp.js';

test('mcpCommand custom name before checkbox', async () => {
  // Flags to verify calls
  let hardwareCalled = false;
  let enginesCalled = false;
  let inputCalled = false;
  let installCalled = false;
  let capturedPayload;

  const deps = {
    selectPrompt: async () => 'default',
    checkboxPrompt: async (opts) => {
      assert.ok(
        opts.choices[0].name.toLowerCase().includes('configured'),
        'checkbox choice includes configured'
      );
      return ['x'];
    },
    inputPrompt: async () => {
      inputCalled = true;
      return 'custom';
    },
    detectHardware: async () => {
      hardwareCalled = true;
      throw new Error('hardware');
    },
    detectEngines: async () => {
      enginesCalled = true;
      throw new Error('engines');
    },
    detectAgents: async () => [
      { id: 'x', name: 'Agent', detected: true, configuredServers: ['custom'] }
    ],
    installMcpServer: async (payload) => {
      installCalled = true;
      capturedPayload = payload;
      return { updated: ['x'], errors: [] };
    },
    readSettings: async () => ({
      servers: [{ id: 'local', url: 'http://localhost' }],
      activeServerId: 'local'
    }),
    log: () => {},
    error: () => {}
  };

  await mcpCommand(
    { engine: 'ollama', host: 'http://remote:11434' },
    { lang: 'en', theme: 'dark' },
    deps
  );

  assert.strictEqual(hardwareCalled, false);
  assert.strictEqual(enginesCalled, false);
  assert.strictEqual(inputCalled, true);
  assert.strictEqual(installCalled, true);
  assert.deepStrictEqual(capturedPayload, {
    engineId: 'ollama',
    customName: 'custom',
    agentIds: ['x'],
    host: 'http://remote:11434',
    apiKey: undefined
  });
});

test('mcpCommand skip input with name', async () => {
  let hardwareCalled = false;
  let enginesCalled = false;
  let inputCalled = false;
  let installCalled = false;
  let capturedPayload;

  const deps = {
    selectPrompt: async () => 'default',
    checkboxPrompt: async (opts) => {
      assert.ok(
        opts.choices[0].name.toLowerCase().includes('configured'),
        'checkbox choice includes configured'
      );
      return ['x'];
    },
    inputPrompt: async () => {
      inputCalled = true;
      return '';
    },
    detectHardware: async () => {
      hardwareCalled = true;
      throw new Error('hardware');
    },
    detectEngines: async () => {
      enginesCalled = true;
      throw new Error('engines');
    },
    detectAgents: async () => [
      { id: 'x', name: 'Agent', detected: true, configuredServers: ['remote-custom'] }
    ],
    installMcpServer: async (payload) => {
      installCalled = true;
      capturedPayload = payload;
      return { updated: [], errors: [] };
    },
    readSettings: async () => ({
      servers: [{ id: 'local', url: 'http://localhost' }],
      activeServerId: 'local'
    }),
    log: () => {},
    error: () => {}
  };

  await mcpCommand(
    {
      engine: 'lmstudio',
      host: 'http://remote:1234/v1',
      apiKey: 'key',
      name: 'remote-custom'
    },
    { lang: 'en', theme: 'dark' },
    deps
  );

  assert.strictEqual(hardwareCalled, false);
  assert.strictEqual(enginesCalled, false);
  assert.strictEqual(inputCalled, false);
  assert.strictEqual(installCalled, true);
  assert.deepStrictEqual(capturedPayload, {
    engineId: 'lmstudio',
    customName: 'remote-custom',
    agentIds: ['x'],
    host: 'http://remote:1234/v1',
    apiKey: 'key'
  });
});

test('mcpCommand no agents selected', async () => {
  let hardwareCalled = false;
  let enginesCalled = false;
  let inputCalled = false;
  let installCalled = false;

  const deps = {
    selectPrompt: async () => 'default',
    checkboxPrompt: async () => [],
    inputPrompt: async () => {
      inputCalled = true;
      return '';
    },
    detectHardware: async () => {
      hardwareCalled = true;
      throw new Error('hardware');
    },
    detectEngines: async () => {
      enginesCalled = true;
      throw new Error('engines');
    },
    detectAgents: async () => [
      { id: 'x', name: 'Agent', detected: true, configuredServers: [] }
    ],
    installMcpServer: async (payload) => {
      installCalled = true;
      return { updated: [], errors: [] };
    },
    readSettings: async () => ({
      servers: [{ id: 'local', url: 'http://localhost' }],
      activeServerId: 'local'
    }),
    log: () => {},
    error: () => {}
  };

  await mcpCommand(
    { engine: 'ollama', host: 'http://remote:11434' },
    { lang: 'en', theme: 'dark' },
    deps
  );

  assert.strictEqual(hardwareCalled, false);
  assert.strictEqual(enginesCalled, false);
  assert.strictEqual(inputCalled, true);
  assert.strictEqual(installCalled, false);
});
