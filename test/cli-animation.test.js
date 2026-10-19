import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerminalAnimation } from '../src/cli/animation.js';

test('TerminalAnimation initializes and controls timer', () => {
  const c = {
    cyan: (s) => `[cyan]${s}[/cyan]`,
    dim: (s) => `[dim]${s}[/dim]`,
  };

  const anim = new TerminalAnimation(c, false);
  assert.equal(anim.isActive, false);

  anim.start('Loading...');
  // Since isTTY is false, it should not start active timer
  assert.equal(anim.isActive, false);

  const ttyAnim = new TerminalAnimation(c, true);
  ttyAnim.start('Loading...');
  assert.equal(ttyAnim.isActive, true);
  assert.ok(ttyAnim.timer !== null);

  ttyAnim.updateProgress(45);
  assert.equal(ttyAnim.pct, 45);

  ttyAnim.updateStatus('Applying...');
  assert.equal(ttyAnim.statusText, 'Applying...');

  ttyAnim.updateTelemetry({ cpu: { percent: 25 }, ram: { usedBytes: 8 * 1024 ** 3, totalBytes: 16 * 1024 ** 3 } });
  assert.equal(ttyAnim.telemetry.cpu.percent, 25);

  ttyAnim.stop();
  assert.equal(ttyAnim.isActive, false);
  assert.equal(ttyAnim.timer, null);
});
