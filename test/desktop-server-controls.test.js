import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServerControls, isTrustedServerSender } from '../electron/server-controls.js';

test('isTrustedServerSender identity checks', () => {
  const mainFrame = { origin: 'http://localhost' };
  const webContents = { mainFrame };
  const event = { sender: webContents, senderFrame: mainFrame };

  assert.equal(isTrustedServerSender(event, webContents, 'http://localhost'), true);
  assert.equal(isTrustedServerSender({ senderFrame: null }, webContents, 'http://localhost'), false);
  assert.equal(isTrustedServerSender({ sender: webContents, senderFrame: { origin: 'http://localhost' } }, webContents, 'http://localhost'), false);
  assert.equal(isTrustedServerSender({ sender: {}, senderFrame: mainFrame }, webContents, 'http://localhost'), false);
  assert.equal(isTrustedServerSender(event, webContents, 'http://evil.com'), false);
});

test('unauthorized access rejects and has zero effects', async () => {
  let calls = 0;
  const deps = {
    isTrusted: (e) => false,
    autostart: { 
      status: () => { calls++; return false; }, 
      setEnabled: (v) => { calls++; return v; } 
    },
    readConfig: async () => { calls++; return null; },
    copyText: async (t) => { calls++; }
  };
  const controls = createServerControls(deps);
  const event = {};

  await assert.rejects(async () => await controls.getAutostartStatus(event), /not authorized/i);
  await assert.rejects(async () => await controls.setAutostartEnabled(event, true), /not authorized/i);
  await assert.rejects(async () => await controls.revealConnection(event), /not authorized/i);
  await assert.rejects(async () => await controls.copyToken(event), /not authorized/i);
  assert.equal(calls, 0);
});

test('autostart status and set confirmation', async () => {
  const history = [];
  const deps = {
    isTrusted: () => true,
    autostart: {
      status: () => history.length === 0 ? false : history[0],
      setEnabled: (val) => { history.push(val); return val; }
    },
    readConfig: async () => null,
    copyText: async () => {}
  };
  const controls = createServerControls(deps);
  const event = {};

  assert.equal(await controls.getAutostartStatus(event), false);
  assert.equal(await controls.setAutostartEnabled(event, true), true);
  assert.deepEqual(history, [true]);

  await assert.rejects(async () => await controls.setAutostartEnabled(event, 'invalid'), /boolean/i);
  assert.deepEqual(history, [true]);

  const failDeps = {
    ...deps,
    autostart: { status: () => false, setEnabled: () => false }
  };
  const failControls = createServerControls(failDeps);
  await assert.rejects(async () => await failControls.setAutostartEnabled(event, true), /confirm/i);
});

test('revealConnection config handling', async () => {
  let readCount = 0;
  const deps = {
    isTrusted: () => true,
    autostart: { status: () => {}, setEnabled: () => {} },
    readConfig: async () => {
      readCount++;
      return { host: '0.0.0.0', port: 8080, token: 'abc' };
    },
    copyText: async () => {}
  };
  const controls = createServerControls(deps);
  const event = {};

  assert.equal(readCount, 0);
  assert.deepEqual(await controls.revealConnection(event), { configured: true, host: '0.0.0.0', port: 8080, token: 'abc' });
  assert.equal(readCount, 1);

  const nullDeps = { ...deps, readConfig: async () => null };
  const nullControls = createServerControls(nullDeps);
  assert.deepEqual(await nullControls.revealConnection(event), { configured: false });
});

test('copyToken propagation and validation', async () => {
  const texts = [];
  const deps = {
    isTrusted: () => true,
    autostart: { status: () => {}, setEnabled: () => {} },
    readConfig: async () => ({ token: 'secret' }),
    copyText: async (text) => {
      await Promise.resolve();
      texts.push(text);
    }
  };
  const controls = createServerControls(deps);
  const event = {};

  const result = await controls.copyToken(event);
  assert.deepEqual(result, { copied: true });
  assert.deepEqual(texts, ['secret']);
  assert.equal(Object.keys(result).length, 1);

  const noConfigDeps = { ...deps, readConfig: async () => null };
  const noConfigControls = createServerControls(noConfigDeps);
  await assert.rejects(async () => await noConfigControls.copyToken(event), /configuration/i);

  const failDeps = {
    ...deps,
    readConfig: async () => ({ token: 'fail' }),
    copyText: async (text) => { if (text === 'fail') throw new Error('Clipboard Error'); }
  };
  const failControls = createServerControls(failDeps);
  await assert.rejects(async () => await failControls.copyToken(event), /Clipboard Error/);
});
