import { test } from 'node:test';
import { strict as assert } from 'node:assert/strict';
import { loadOutcome } from '../src/core/load-options.js';

test('loadOutcome with loaded ok and dryRun', () => {
  const result = loadOutcome({ loaded: { ok: true } }, { dryRun: true });
  assert.deepEqual(result, { ok: true, outcome: 'preview' });
});

test('loadOutcome with preview and dryRun', () => {
  const result = loadOutcome({ preview: {} }, { dryRun: true });
  assert.deepEqual(result, { ok: true, outcome: 'preview' });
});

test('loadOutcome with applied false', () => {
  const result = loadOutcome({ applied: false });
  assert.deepEqual(result, { ok: true, outcome: 'declined' });
});

test('loadOutcome with applied pendingCommands and loaded null', () => {
  const result = loadOutcome({
    applied: { pendingCommands: ['x'] },
    loaded: null
  });
  assert.deepEqual(result, { ok: false, outcome: 'manual' });
});

test('loadOutcome with applied empty pendingCommands and loaded ok', () => {
  const result = loadOutcome({
    applied: { pendingCommands: [] },
    loaded: { ok: true }
  });
  assert.deepEqual(result, { ok: true, outcome: 'loaded' });
});

test('loadOutcome with loaded ok false', () => {
  const result = loadOutcome({ loaded: { ok: false } });
  assert.deepEqual(result, { ok: false, outcome: 'failed' });
});

test('loadOutcome undefined', () => {
  const result = loadOutcome(undefined);
  assert.deepEqual(result, { ok: false, outcome: 'failed' });
});
