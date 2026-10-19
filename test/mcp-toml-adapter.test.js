import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readTomlMcpServers, upsertTomlMcpServer } from '../src/core/mcp/adapters/toml-adapter.js';

test('upsertTomlMcpServer preserves existing tables, comments, and injects server block', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-toml-test-'));
  t.after(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  const targetFile = path.join(tmpDir, 'config.toml');
  const initialContent = `# User config header
[desktop]
followUpQueueMode = "steer"

[mcp_servers.existing]
command = "node"
args = ["script.js"]
`;
  await fs.writeFile(targetFile, initialContent, 'utf8');

  let servers = await readTomlMcpServers(targetFile);
  assert.deepEqual(servers, ['existing']);

  await upsertTomlMcpServer(targetFile, 'pumbastudio', {
    command: 'npx',
    args: ['-y', '@mzxrai/mcp-openai@latest'],
    env: { OPENAI_BASE_URL: 'http://127.0.0.1:1234/v1' }
  });

  servers = await readTomlMcpServers(targetFile);
  assert.deepEqual(servers.sort(), ['existing', 'pumbastudio']);

  const updatedContent = await fs.readFile(targetFile, 'utf8');
  assert.ok(updatedContent.includes('# User config header'));
  assert.ok(updatedContent.includes('followUpQueueMode = "steer"'));
  assert.ok(updatedContent.includes('[mcp_servers.pumbastudio]'));
  assert.ok(updatedContent.includes('OPENAI_BASE_URL = "http://127.0.0.1:1234/v1"'));
});

test('upsertTomlMcpServer updates existing server block cleanly', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-toml-update-test-'));
  t.after(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  const targetFile = path.join(tmpDir, 'config.toml');
  await upsertTomlMcpServer(targetFile, 'server1', {
    command: 'npx',
    args: ['arg1'],
    env: { KEY1: 'val1' }
  });

  let servers = await readTomlMcpServers(targetFile);
  assert.deepEqual(servers, ['server1']);

  // Update existing server1
  await upsertTomlMcpServer(targetFile, 'server1', {
    command: 'npx',
    args: ['arg2'],
    env: { KEY1: 'val2' }
  });

  servers = await readTomlMcpServers(targetFile);
  assert.deepEqual(servers, ['server1']);

  const content = await fs.readFile(targetFile, 'utf8');
  assert.ok(content.includes('KEY1 = "val2"'));
});

test('readTomlMcpServers returns empty array if file does not exist', async () => {
  const list = await readTomlMcpServers('/path/to/non/existent/file.toml');
  assert.deepEqual(list, []);
});
