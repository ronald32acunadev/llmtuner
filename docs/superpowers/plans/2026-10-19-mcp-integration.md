# Engine as MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a web and desktop interface in LLM Tuner allowing users to configure local engines (LM Studio and Ollama) as MCP servers across AI agents (Claude Desktop, Claude Code, OpenCode, Antigravity, VS Code, ChatGPT/Codex) with custom naming and cross-platform safety.

**Architecture:** A modular `src/core/mcp` subsystem provides an agent registry and safe format adapters (JSON and surgical TOML), exposed via two REST endpoints in `src/web/server.js`, and rendered through an interactive modal in `src/web/public/index.html` with full `en`/`es` localization.

**Tech Stack:** Node.js 22 (built-in `node:test`, `node:assert`, `node:fs/promises`, `node:os`, `node:path`), Vanilla JS Web UI, CSS3.

**Spec:** `docs/superpowers/specs/2026-10-19-mcp-integration-design.md`

## Global Constraints

- Runtime: Node.js >= 22 with native ESM (`"type": "module"`).
- Dependencies: Zero new external runtime dependencies; use built-in Node modules and existing project utilities.
- Platforms: Windows (`win32`), macOS (`darwin`), Linux (`linux`).
- Safety: Always create timestamped backup `.bak-llm-tuner-<timestamp>` before modifying existing configuration files.
- Language: All code, tests, identifiers, and commit messages must be in English.

## Review Focus

1. Fresh install handling: If an agent's config file or parent folder does not exist, the adapter must create the directory and initialize valid configuration containing the new MCP server.
2. Preservation of existing servers: Upserting an MCP entry must preserve all existing servers, options, and unrelated root properties.
3. TOML surgical preservation: Modifying `~/.codex/config.toml` must not clobber existing sections (like `[desktop]`, `[plugins]`) or strip comments.
4. Custom options fallback: Omitting or passing empty `apiKey` or `host` must gracefully fall back to the engine defaults (`127.0.0.1:1234` with `sk-lm-local` for LM Studio, `127.0.0.1:11434` for Ollama).
5. Partial failure reporting: If one agent fails to write (e.g. read-only permissions), the operation must report the failure for that agent while successfully updating other selected agents.

---

### Task 1: Agent Registry & Cross-Platform Path Resolution

**Files:**
- Create: `src/core/mcp/registry.js`
- Create: `src/core/mcp/util.js`
- Test: `test/mcp-registry.test.js`

**Interfaces:**
- Produces:
  - `SUPPORTED_AGENTS`: Array of `{ id, name, format, getConfigPath(platform, env) }`
  - `resolveConfigPath(agentId, { platform, env, homedir }) -> string`
  - `buildMcpPayload(engineId, { customName, host, apiKey }) -> Object`

- [ ] **Step 1: Write the failing test**

```javascript
// test/mcp-registry.test.js
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

  const linuxCodex = resolveConfigPath('chatgpt', { platform: 'linux', env, homedir });
  assert.equal(linuxCodex, '/home/test/.codex/config.toml');
});

test('buildMcpPayload generates valid payloads for lmstudio and ollama', () => {
  const lms = buildMcpPayload('lmstudio', { customName: 'my-lms', host: 'http://127.0.0.1:1234/v1', apiKey: 'custom-key' });
  assert.equal(lms.command, 'npx');
  assert.deepEqual(lms.args, ['-y', '@mzxrai/mcp-openai@latest']);
  assert.equal(lms.env.OPENAI_BASE_URL, 'http://127.0.0.1:1234/v1');
  assert.equal(lms.env.OPENAI_API_KEY, 'custom-key');

  const ollama = buildMcpPayload('ollama', { customName: 'my-ollama' });
  assert.equal(ollama.env.OLLAMA_HOST, 'http://127.0.0.1:11434');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mcp-registry.test.js`
Expected: FAIL with Cannot find module `../src/core/mcp/registry.js`

- [ ] **Step 3: Implement registry and path resolver**

Create `src/core/mcp/registry.js` defining all 6 agents with their Linux, macOS, and Windows path generators and payload builders.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/mcp-registry.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/mcp/registry.js test/mcp-registry.test.js
git commit -m "feat(mcp): add agent registry and cross-platform path resolution"
```

---

### Task 2: Safe JSON Configuration Adapters

**Files:**
- Create: `src/core/mcp/adapters/json-adapter.js`
- Test: `test/mcp-json-adapter.test.js`

**Interfaces:**
- Produces:
  - `readJsonMcpServers(filePath, rootKey) -> Promise<string[]>`
  - `upsertJsonMcpServer(filePath, rootKey, serverName, serverConfig) -> Promise<{ backup: string|null }>`

- [ ] **Step 1: Write the failing test**

```javascript
// test/mcp-json-adapter.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mcp-json-adapter.test.js`
Expected: FAIL with Cannot find module `../src/core/mcp/adapters/json-adapter.js`

- [ ] **Step 3: Implement JSON adapter**

Implement `src/core/mcp/adapters/json-adapter.js` utilizing `writeJsonWithBackup` from `src/core/util.js` with directory auto-creation, backup creation, and OpenCode format adaptation.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/mcp-json-adapter.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/mcp/adapters/json-adapter.js test/mcp-json-adapter.test.js
git commit -m "feat(mcp): add safe JSON adapters for Claude, Antigravity, VS Code, and OpenCode"
```

---

### Task 3: Safe Surgical TOML Adapter for Codex/ChatGPT

**Files:**
- Create: `src/core/mcp/adapters/toml-adapter.js`
- Test: `test/mcp-toml-adapter.test.js`

**Interfaces:**
- Produces:
  - `readTomlMcpServers(filePath) -> Promise<string[]>`
  - `upsertTomlMcpServer(filePath, serverName, serverConfig) -> Promise<{ backup: string|null }>`

- [ ] **Step 1: Write the failing test**

```javascript
// test/mcp-toml-adapter.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mcp-toml-adapter.test.js`
Expected: FAIL with Cannot find module `../src/core/mcp/adapters/toml-adapter.js`

- [ ] **Step 3: Implement surgical TOML adapter**

Implement `src/core/mcp/adapters/toml-adapter.js` that surgically parses and updates `[mcp_servers.<name>]` and `[mcp_servers.<name>.env]` blocks without corrupting existing comments or non-MCP tables.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/mcp-toml-adapter.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/mcp/adapters/toml-adapter.js test/mcp-toml-adapter.test.js
git commit -m "feat(mcp): add surgical TOML adapter for Codex and ChatGPT desktop"
```

---

### Task 4: MCP Core Manager Facade

**Files:**
- Create: `src/core/mcp/index.js`
- Modify: `src/core/index.js`
- Test: `test/mcp-manager.test.js`

**Interfaces:**
- Consumes: `registry.js`, `json-adapter.js`, `toml-adapter.js`
- Produces:
  - `detectAgents({ platform, env, homedir }) -> Promise<Array<{ id, name, detected, configPath, configuredServers: string[] }>>`
  - `installMcpServer({ engineId, customName, agentIds, host, apiKey }, opts) -> Promise<{ success: boolean, updated: string[], errors: Array<{ agentId, error }> }>`

- [ ] **Step 1: Write the failing test**

```javascript
// test/mcp-manager.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { detectAgents, installMcpServer } from '../src/core/mcp/index.js';

test('detectAgents detects files and returns configured server names', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-mgr-test-'));
  t.after(async () => { await fs.rm(tmpDir, { recursive: true, force: true }); });

  const env = { XDG_CONFIG_HOME: tmpDir, APPDATA: tmpDir, USERPROFILE: tmpDir };
  const agents = await detectAgents({ platform: 'linux', env, homedir: tmpDir });
  assert.equal(agents.length, 6);
  assert.ok(agents.every(a => a.detected === false));
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
  assert.ok(claude.configuredServers.includes('pumbastudio'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mcp-manager.test.js`
Expected: FAIL with Cannot find module `../src/core/mcp/index.js`

- [ ] **Step 3: Implement MCP manager and re-export in `src/core/index.js`**

Implement `detectAgents` and `installMcpServer` in `src/core/mcp/index.js` and export them from `src/core/index.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/mcp-manager.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/mcp/index.js src/core/index.js test/mcp-manager.test.js
git commit -m "feat(mcp): implement core MCP manager facade and export from core"
```

---

### Task 5: Web API Endpoints

**Files:**
- Modify: `src/web/server.js`
- Test: `test/mcp-server-api.test.js`

**Interfaces:**
- Consumes: `detectAgents`, `installMcpServer` from `src/core/index.js`
- Produces:
  - `GET /api/mcp/agents` -> `200 JSON { agents: [...] }`
  - `POST /api/mcp/install` -> `200 JSON { success, updated, errors }` or `400 JSON { error }`

- [ ] **Step 1: Write the failing test**

```javascript
// test/mcp-server-api.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/web/server.js';
import { freePort } from '../src/core/util.js';

test('GET /api/mcp/agents returns 200 with agent array', async (t) => {
  const port = await freePort();
  const srv = await createServer({ port });
  t.after(() => srv.close());

  const res = await fetch(`http://127.0.0.1:${port}/api/mcp/agents`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.agents));
  assert.equal(data.agents.length, 6);
});

test('POST /api/mcp/install validates input and returns result', async (t) => {
  const port = await freePort();
  const srv = await createServer({ port });
  t.after(() => srv.close());

  // Missing parameters
  const badRes = await fetch(`http://127.0.0.1:${port}/api/mcp/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(badRes.status, 400);

  // Valid install request
  const goodRes = await fetch(`http://127.0.0.1:${port}/api/mcp/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engineId: 'lmstudio', customName: 'test-lms', agentIds: [] })
  });
  assert.equal(goodRes.status, 200);
  const data = await goodRes.json();
  assert.equal(data.success, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mcp-server-api.test.js`
Expected: FAIL (404 on `/api/mcp/agents`)

- [ ] **Step 3: Implement endpoints in `src/web/server.js`**

Add routes for `/api/mcp/agents` and `/api/mcp/install` in `src/web/server.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/mcp-server-api.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/web/server.js test/mcp-server-api.test.js
git commit -m "feat(web): add /api/mcp/agents and /api/mcp/install endpoints"
```

---

### Task 6: Internationalization (i18n)

**Files:**
- Modify: `src/i18n/en.js`
- Modify: `src/i18n/es.js`
- Test: `test/mcp-i18n.test.js`

**Interfaces:**
- Consumes: `src/i18n/index.js`
- Produces: Catalogs with keys `web.addAsMcp`, `web.addAsMcpTooltip`, `web.mcpModalTitle`, `web.mcpServerName`, `web.mcpAdvancedOptions`, `web.mcpBaseUrl`, `web.mcpApiKey`, `web.mcpSelectAgents`, `web.mcpDetected`, `web.mcpNotDetected`, `web.mcpAlreadyConfigured`, `web.mcpSuccess`, `web.mcpSaveBtn`

- [ ] **Step 1: Write the failing test**

```javascript
// test/mcp-i18n.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { t } from '../src/i18n/index.js';

test('i18n catalogs include all MCP keys in en and es without missing fallbacks', () => {
  const keys = [
    'web.addAsMcp',
    'web.addAsMcpTooltip',
    'web.mcpModalTitle',
    'web.mcpServerName',
    'web.mcpAdvancedOptions',
    'web.mcpBaseUrl',
    'web.mcpApiKey',
    'web.mcpSelectAgents',
    'web.mcpDetected',
    'web.mcpNotDetected',
    'web.mcpAlreadyConfigured',
    'web.mcpSuccess',
    'web.mcpSaveBtn'
  ];

  for (const k of keys) {
    const enVal = t('en', k, { engine: 'LM Studio', agents: 'Claude' });
    const esVal = t('es', k, { engine: 'LM Studio', agents: 'Claude' });
    assert.notEqual(enVal, k, `Missing English key ${k}`);
    assert.notEqual(esVal, k, `Missing Spanish key ${k}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mcp-i18n.test.js`
Expected: FAIL with Missing English/Spanish key

- [ ] **Step 3: Add keys to `en.js` and `es.js`**

Populate all MCP translation entries in `src/i18n/en.js` and `src/i18n/es.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/mcp-i18n.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/i18n/en.js src/i18n/es.js test/mcp-i18n.test.js
git commit -m "feat(i18n): add English and Spanish translations for MCP integration"
```

---

### Task 7: Web & Desktop UI Component & Modal

**Files:**
- Modify: `src/web/public/index.html`
- Modify: `src/web/public/app.js`
- Modify: `src/web/public/style.css`
- Test: `test/mcp-ui.test.js`

**Interfaces:**
- Produces:
  - Button `.btn-mcp` inside engine card headers.
  - Dialog modal `#mcp-modal` with inputs, collapsible advanced settings, agents checkbox list, and action buttons.
  - Client handler `openMcpModal(engineId)` and `saveMcpConfig()`.

- [ ] **Step 1: Write the failing test**

```javascript
// test/mcp-ui.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('index.html contains MCP modal template and engine card action placeholders', async () => {
  const html = await fs.readFile('src/web/public/index.html', 'utf8');
  assert.ok(html.includes('id="mcp-modal"'));
  assert.ok(html.includes('data-i18n="web.addAsMcp"'));
  assert.ok(html.includes('id="mcp-server-name"'));
  assert.ok(html.includes('id="mcp-agents-list"'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mcp-ui.test.js`
Expected: FAIL

- [ ] **Step 3: Update `index.html`, `app.js`, and `style.css`**

Add the `#mcp-modal` dialog, styling for the modal and badges, and the interactive logic in `app.js` to fetch `/api/mcp/agents`, render the agent list, handle `customName` input dynamically, and POST to `/api/mcp/install`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/mcp-ui.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/web/public/index.html src/web/public/app.js src/web/public/style.css test/mcp-ui.test.js
git commit -m "feat(ui): add 'Add as MCP' button and configuration modal to web/desktop interface"
```

---

### Task 8: Full Test Suite & Verification

**Files:**
- Modify: `README.md`
- Modify: `README.es.md`
- Test: All tests

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (0 failures)

- [ ] **Step 2: Update documentation**

Document the "Add as MCP" feature in `README.md` and `README.es.md`.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md README.es.md
git commit -m "docs: document Add as MCP feature in English and Spanish READMEs"
```
