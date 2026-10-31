import { createConfirmationGate } from '../src/web/load-confirmation.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

function fixture() {
  const events = [];
  const timers = [];
  const cleared = [];
  const gate = createConfirmationGate({
    emit: (event) => events.push(event),
    timeoutMs: 1000,
    setTimer: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
    clearTimer: (timer) => cleared.push(timer),
    newId: () => 'id-1',
    now: () => 5000,
  });
  return { gate, events, timers, cleared };
}

test('request emits confirmation-required event and registers a timer', async () => {
  const { gate, events, timers } = fixture();
  const decision = gate.request({ a: 1 });

  // Verify pending state before answering
  let settled = false;
  decision.then(() => { settled = true; });
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false);

  assert.deepEqual(events[0], {
    type: 'confirmation-required',
    confirmationId: 'id-1',
    preview: { a: 1 },
    expiresAt: 6000,
  });
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 1000);

  // Cancel to clear pending
  gate.cancel('done');
  await decision;
});

test('accept resolves with status 200 and emits resolved event', async () => {
  const { gate, events, timers, cleared } = fixture();
  const decision = gate.request({ a: 1 });

  const result = await gate.resolve({
    confirmationId: 'id-1',
    accepted: true,
  });
  assert.equal(await decision, true);
  assert.deepEqual(result, { status: 200 });

  const resolvedEvent = events[1];
  assert.deepEqual(resolvedEvent, {
    type: 'confirmation-resolved',
    confirmationId: 'id-1',
    accepted: true,
    reason: 'answered',
  });
  assert.equal(cleared[0], timers[0]);
});

test('decline resolves with status 200 and emits resolved event', async () => {
  const { gate, events, timers, cleared } = fixture();
  const decision = gate.request({ a: 1 });

  const result = await gate.resolve({
    confirmationId: 'id-1',
    accepted: false,
  });
  assert.equal(await decision, false);
  assert.deepEqual(result, { status: 200 });

  const resolvedEvent = events[1];
  assert.deepEqual(resolvedEvent, {
    type: 'confirmation-resolved',
    confirmationId: 'id-1',
    accepted: false,
    reason: 'answered',
  });
  assert.equal(cleared[0], timers[0]);
});

test('wrong id resolves with status 409 and no event', async () => {
  const { gate, events, timers } = fixture();
  const decision = gate.request({ a: 1 });

  const resultWrong = await gate.resolve({
    confirmationId: 'nope',
    accepted: true,
  });
  assert.deepEqual(resultWrong, { status: 409 });
  assert.equal(events.length, 1);

  const resultCorrect = await gate.resolve({
    confirmationId: 'id-1',
    accepted: true,
  });
  assert.deepEqual(resultCorrect, { status: 200 });
});

test('duplicate resolve returns status 409 and no new event', async () => {
  const { gate, events, timers } = fixture();
  const decision = gate.request({ a: 1 });

  await gate.resolve({
    confirmationId: 'id-1',
    accepted: true,
  });

  const resultDuplicate = await gate.resolve({
    confirmationId: 'id-1',
    accepted: false,
  });
  assert.deepEqual(resultDuplicate, { status: 409 });
  assert.equal(events.length, 2);
});

test('expiry triggers resolved event with reason expired and subsequent resolve returns 409', async () => {
  const { gate, events, timers } = fixture();
  const decision = gate.request({ a: 1 });

  // trigger timer
  timers[0].fn();

  assert.equal(events.length, 2);
  const resolvedEvent = events[1];
  assert.deepEqual(resolvedEvent, {
    type: 'confirmation-resolved',
    confirmationId: 'id-1',
    accepted: false,
    reason: 'expired',
  });

  const resultAfterExpiry = await gate.resolve({
    confirmationId: 'id-1',
    accepted: true,
  });
  assert.deepEqual(resultAfterExpiry, { status: 409 });
});

test('cancel resolves with reason disconnected and clears timer', async () => {
  const { gate, events, timers, cleared } = fixture();
  const decision = gate.request({ a: 1 });

  const resultCancel = await gate.cancel('disconnected');
  assert.equal(events.length, 2);
  const cancelEvent = events[1];
  assert.deepEqual(cancelEvent, {
    type: 'confirmation-resolved',
    confirmationId: 'id-1',
    accepted: false,
    reason: 'disconnected',
  });
  assert.equal(cleared[0], timers[0]);
});

test('cancel with nothing pending does nothing', async () => {
  const { gate, events } = fixture();
  await gate.cancel('disconnected');
  assert.equal(events.length, 0);
});

test('resolve with nothing pending returns status 409', async () => {
  const { gate, events } = fixture();
  const result = await gate.resolve({
    confirmationId: 'id-1',
    accepted: true,
  });
  assert.deepEqual(result, { status: 409 });
});
