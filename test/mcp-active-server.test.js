import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildMcpPayload } from '../src/core/mcp/registry.js';

let tempDir;

before(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-mcp-active-'));
  process.env.LLM_TUNER_CONFIG_DIR = tempDir;
});

after(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('buildMcpPayload resolves remote engine hosts for LM Studio and Ollama', () => {
  const lmstudioHost = 'http://192.168.90.10:1234/v1';
  const lmPayload = buildMcpPayload('lmstudio', { host: lmstudioHost });
  assert.equal(lmPayload.env.OPENAI_BASE_URL, lmstudioHost);
  assert.equal(lmPayload.env.OPENAI_API_KEY, 'sk-lm-local');

  const ollamaHost = 'http://192.168.90.10:11434';
  const ollamaPayload = buildMcpPayload('ollama', { host: ollamaHost });
  assert.equal(ollamaPayload.env.OLLAMA_HOST, ollamaHost);

  const defaultLm = buildMcpPayload('lmstudio', {});
  assert.equal(defaultLm.env.OPENAI_BASE_URL, 'http://127.0.0.1:1234/v1');

  const defaultOllama = buildMcpPayload('ollama', {});
  assert.equal(defaultOllama.env.OLLAMA_HOST, 'http://127.0.0.1:11434');
});

test('buildMcpPayload preserves custom apiKey when provided', () => {
  const customKey = 'sk-custom-secret';
  const payload = buildMcpPayload('lmstudio', { host: 'http://10.0.0.5:1234/v1', apiKey: customKey });
  assert.equal(payload.env.OPENAI_API_KEY, customKey);
  assert.equal(payload.env.OPENAI_BASE_URL, 'http://10.0.0.5:1234/v1');
});
