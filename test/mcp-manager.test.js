import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { detectAgents, installMcpServer } from '../src/core/mcp/index.js';
import { detectAgents as detectAgentsFromCore, installMcpServer as installMcpServerFromCore } from '../src/core/index.js';

test('detectAgents detects files and returns configured server names', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-mgr-test-'));
  t.after(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  const env = { XDG_CONFIG_HOME: tmpDir, APPDATA: tmpDir, USERPROFILE: tmpDir };
  const agents = await detectAgents({ platform: 'linux', env, homedir: tmpDir });
  assert.equal(agents.length, 6);
  assert.ok(agents.every(a => a.detected === false));
  assert.ok(agents.every(a => Array.isArray(a.configuredServers) && a.configuredServers.length === 0));
});

test('installMcpServer updates target agents and reports status', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-install-test-'));
  t.after(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  const env = { XDG_CONFIG_HOME: tmpDir, APPDATA: tmpDir, USERPROFILE: tmpDir };
  const res = await installMcpServer({
    engineId: 'lmstudio',
    customName: 'pumbastudio',
    agentIds: ['claude-desktop', 'chatgpt']
  }, { platform: 'linux', env, homedir: tmpDir });

  assert.equal(res.success, true);
  assert.deepEqual(res.updated.sort(), ['chatgpt', 'claude-desktop']);
  assert.equal(res.errors.length, 0);

  const after = await detectAgents({ platform: 'linux', env, homedir: tmpDir });
  const claude = after.find(a => a.id === 'claude-desktop');
  assert.equal(claude.detected, true);
  assert.ok(claude.configuredServers.includes('pumbastudio'));

  const codex = after.find(a => a.id === 'chatgpt');
  assert.equal(codex.detected, true);
  assert.ok(codex.configuredServers.includes('pumbastudio'));
});

test('src/core/index.js exports detectAgents and installMcpServer', () => {
  assert.equal(typeof detectAgentsFromCore, 'function');
  assert.equal(typeof installMcpServerFromCore, 'function');
});
