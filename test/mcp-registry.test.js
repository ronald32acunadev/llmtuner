import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_AGENTS, resolveConfigPath, buildMcpPayload } from '../src/core/mcp/registry.js';

test('SUPPORTED_AGENTS defines all 6 target agents', () => {
  const ids = SUPPORTED_AGENTS.map((a) => a.id).sort();
  assert.deepEqual(ids, ['antigravity', 'chatgpt', 'claude-code', 'claude-desktop', 'opencode', 'vscode']);
});

test('resolveConfigPath resolves platform paths correctly', () => {
  const env = { APPDATA: 'C:\\Users\\test\\AppData\\Roaming', USERPROFILE: 'C:\\Users\\test' };
  const homedir = '/home/test';

  const linuxClaude = resolveConfigPath('claude-desktop', { platform: 'linux', env, homedir });
  assert.equal(linuxClaude, '/home/test/.config/Claude/claude_desktop_config.json');

  const winClaude = resolveConfigPath('claude-desktop', { platform: 'win32', env, homedir });
  assert.equal(winClaude, 'C:\\Users\\test\\AppData\\Roaming\\Claude\\claude_desktop_config.json');

  const macClaude = resolveConfigPath('claude-desktop', { platform: 'darwin', env, homedir });
  assert.equal(macClaude, '/home/test/Library/Application Support/Claude/claude_desktop_config.json');

  const linuxCodex = resolveConfigPath('chatgpt', { platform: 'linux', env, homedir });
  assert.equal(linuxCodex, '/home/test/.codex/config.toml');

  const winCodex = resolveConfigPath('chatgpt', { platform: 'win32', env, homedir });
  assert.equal(winCodex, 'C:\\Users\\test\\.codex\\config.toml');

  const linuxOpenCode = resolveConfigPath('opencode', { platform: 'linux', env, homedir });
  assert.equal(linuxOpenCode, '/home/test/.config/opencode/opencode.json');
});

test('buildMcpPayload generates valid payloads for lmstudio and ollama', () => {
  const lms = buildMcpPayload('lmstudio', { customName: 'my-lms', host: 'http://127.0.0.1:1234/v1', apiKey: 'custom-key' });
  assert.equal(lms.command, 'npx');
  assert.deepEqual(lms.args, ['-y', '@mzxrai/mcp-openai@latest']);
  assert.equal(lms.env.OPENAI_BASE_URL, 'http://127.0.0.1:1234/v1');
  assert.equal(lms.env.OPENAI_API_KEY, 'custom-key');

  const ollama = buildMcpPayload('ollama', { customName: 'my-ollama' });
  assert.equal(ollama.command, 'npx');
  assert.deepEqual(ollama.args, ['-y', 'ollama-mcp-server@latest']);
  assert.equal(ollama.env.OLLAMA_HOST, 'http://127.0.0.1:11434');
});
