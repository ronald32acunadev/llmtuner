import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('index.html contains MCP modal template and engine card action placeholders', async () => {
  const html = await fs.readFile('src/web/public/index.html', 'utf8');
  assert.ok(html.includes('id="mcp-modal"'), 'Missing #mcp-modal dialog');
  assert.ok(html.includes('id="mcp-server-name"'), 'Missing #mcp-server-name input');
  assert.ok(html.includes('id="mcp-agents-list"'), 'Missing #mcp-agents-list container');
  assert.ok(html.includes('id="mcp-save-btn"'), 'Missing #mcp-save-btn button');
});

test('style.css contains styles for mcp modal and badges', async () => {
  const css = await fs.readFile('src/web/public/style.css', 'utf8');
  assert.ok(css.includes('.mcp-btn') || css.includes('.btn-mcp'), 'Missing .mcp-btn style');
  assert.ok(css.includes('.mcp-agent-item') || css.includes('#mcp-modal'), 'Missing MCP modal styles in CSS');
});

test('app.js exports or defines MCP modal handlers', async () => {
  const js = await fs.readFile('src/web/public/app.js', 'utf8');
  assert.ok(js.includes('/api/mcp/agents'), 'app.js should call /api/mcp/agents');
  assert.ok(js.includes('/api/mcp/install'), 'app.js should call /api/mcp/install');
});
