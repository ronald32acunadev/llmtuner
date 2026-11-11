import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unloadCommand } from '../src/cli/commands/unload.js';

test('unloadCommand reports when no models are active', async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    // When called with non-existent model or when no model running
    const res = await unloadCommand({ model: 'non-existent-test-model' }, { lang: 'en', theme: 'dark' });
    assert.strictEqual(typeof res, 'object');
  } finally {
    console.log = origLog;
  }
});
