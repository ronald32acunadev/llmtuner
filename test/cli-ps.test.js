import { test } from 'node:test';
import assert from 'node:assert/strict';
import { psCommand } from '../src/cli/commands/ps.js';

test('psCommand outputs json when args.json is true', async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    await psCommand({ json: true }, { lang: 'en', theme: 'dark' });
    assert.strictEqual(logs.length, 1);
    const parsed = JSON.parse(logs[0]);
    assert.strictEqual(parsed.ok, true);
    assert.ok(Array.isArray(parsed.active));
  } finally {
    console.log = origLog;
  }
});

test('psCommand runs in text mode without errors', async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (msg) => logs.push(msg);

  try {
    await psCommand({}, { lang: 'en', theme: 'dark' });
    assert.ok(logs.length > 0, 'Must output text in console');
  } finally {
    console.log = origLog;
  }
});
