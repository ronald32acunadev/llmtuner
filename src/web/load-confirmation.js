import { randomUUID } from 'node:crypto';

export function createConfirmationGate({ emit, timeoutMs = 120000, setTimer = setTimeout, clearTimer = clearTimeout, newId = randomUUID, now = Date.now }) {
  let pending = null;

  function settle(accepted, reason) {
    if (!pending) return;
    const current = pending;
    pending = null;
    if (reason !== 'expired') clearTimer(current.timer);
    emit({ type: 'confirmation-resolved', confirmationId: current.confirmationId, accepted, reason });
    current.settlePromise(accepted);
  }

  return {
    request(preview) {
      settle(false, 'superseded');
      return new Promise((settlePromise) => {
        const confirmationId = newId();
        const timer = setTimer(() => settle(false, 'expired'), timeoutMs);
        if (timer.unref) timer.unref();
        pending = { confirmationId, timer, settlePromise };
        emit({ type: 'confirmation-required', confirmationId, preview, expiresAt: now() + timeoutMs });
      });
    },
    resolve({ confirmationId, accepted }) {
      if (!pending || pending.confirmationId !== confirmationId) return { status: 409 };
      settle(accepted, 'answered');
      return { status: 200 };
    },
    cancel(reason) {
      settle(false, reason);
    },
  };
}
