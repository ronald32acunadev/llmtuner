import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mcpCommand } from '../src/cli/commands/mcp.js';

test('mcpCommand - module is callable function', () => {
  assert.equal(typeof mcpCommand, 'function');
});
