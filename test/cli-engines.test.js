import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enginesCommand } from '../src/cli/commands/engines.js';

test('enginesCommand outputs status and storage for local engines', async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    const res = await enginesCommand({}, { lang: 'en', theme: 'dark' });
    assert.strictEqual(typeof res, 'object');
    assert.ok(logs.length > 0, 'Must output engine status in console');
  } finally {
    console.log = origLog;
  }
});
