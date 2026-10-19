import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readJsonMcpServers, upsertJsonMcpServer } from '../src/core/mcp/adapters/json-adapter.js';

test('upsertJsonMcpServer creates file if missing and preserves other servers', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-json-test-'));
  t.after(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  const targetFile = path.join(tmpDir, 'claude_desktop_config.json');

  // Fresh file creation
  await upsertJsonMcpServer(targetFile, 'mcpServers', 'server1', { command: 'npx', args: ['arg1'] });
  let list = await readJsonMcpServers(targetFile, 'mcpServers');
  assert.deepEqual(list, ['server1']);

  // Preserves existing server
  await upsertJsonMcpServer(targetFile, 'mcpServers', 'server2', { command: 'npx', args: ['arg2'] });
  list = await readJsonMcpServers(targetFile, 'mcpServers');
  assert.deepEqual(list.sort(), ['server1', 'server2']);

  const parsed = JSON.parse(await fs.readFile(targetFile, 'utf8'));
  assert.equal(parsed.mcpServers.server1.command, 'npx');
  assert.equal(parsed.mcpServers.server2.command, 'npx');
});

test('upsertJsonMcpServer handles openCode array command format', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-opencode-test-'));
  t.after(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  const targetFile = path.join(tmpDir, 'opencode.json');
  await upsertJsonMcpServer(targetFile, 'mcp', 'pumbastudio', { command: 'npx', args: ['-y', 'pkg'], env: { FOO: 'BAR' } }, { isOpenCode: true });

  const parsed = JSON.parse(await fs.readFile(targetFile, 'utf8'));
  assert.equal(parsed.mcp.pumbastudio.type, 'local');
  assert.deepEqual(parsed.mcp.pumbastudio.command, ['npx', '-y', 'pkg']);
  assert.deepEqual(parsed.mcp.pumbastudio.environment, { FOO: 'BAR' });
});

test('readJsonMcpServers returns empty array if file does not exist or has no rootKey', async () => {
  const list = await readJsonMcpServers('/path/to/non/existent/file.json', 'mcpServers');
  assert.deepEqual(list, []);
});
