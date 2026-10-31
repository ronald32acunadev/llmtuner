import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setupSharedHosting } from '../src/web/public/shared-hosting.js';

// Helper verbatim
function setup(bridge) {
  const elements = {};
  for (const id of ['shared-server-section', 'shared-server-host', 'shared-server-port', 'shared-server-token', 'shared-server-start', 'shared-server-status']) {
    elements[id] = { hidden: id === 'shared-server-section', value: '', textContent: '', disabled: false, onclick: null, click() { return this.onclick(); } };
  }
  const t = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);
  return { elements, document: { getElementById: (id) => elements[id] }, t, bridge };
}
const fakeBridge = (status, startResult, calls = []) => ({
  calls,
  getSharedServerStatus: async () => status,
  startSharedServer: async (input) => { calls.push(input); return startResult; },
});

describe('shared-hosting-ui', () => {
  it('without a bridge the section stays hidden', async () => {
    const env = setup(undefined);
    await setupSharedHosting(env);
    assert.equal(env.elements['shared-server-section'].hidden, true);
  });

  it('a stopped server shows its saved settings', async () => {
    const status = { running: false, configured: true, host: 'h', port: 1 };
    const env = setup(fakeBridge(status));
    await setupSharedHosting(env);
    assert.equal(env.elements['shared-server-section'].hidden, false);
    assert.equal(env.elements['shared-server-host'].value, 'h');
    assert.equal(env.elements['shared-server-port'].value, '1');
    assert.equal(env.elements['shared-server-status'].textContent, 'web.sharedServerStopped');
  });

  it('no saved settings use the CLI defaults', async () => {
    const status = { running: false, configured: false };
    const env = setup(fakeBridge(status));
    await setupSharedHosting(env);
    assert.equal(env.elements['shared-server-host'].value, '0.0.0.0');
    assert.equal(env.elements['shared-server-port'].value, '7860');
  });

  it('a running server shows its address', async () => {
    const status = { running: true, configured: true, host: 'h', port: 1, url: 'http://h:1' };
    const env = setup(fakeBridge(status));
    await setupSharedHosting(env);
    assert.equal(env.elements['shared-server-status'].textContent, 'web.sharedServerRunning:{"url":"http://h:1"}');
    assert.equal(env.elements['shared-server-start'].disabled, true);
  });

  it('starting sends the typed values', async () => {
    const env = setup(fakeBridge({ running: false, configured: false }, { running: true, host: 'h', port: 9000, url: 'u' }));
    await setupSharedHosting(env);
    env.elements['shared-server-host'].value = ' h ';
    env.elements['shared-server-port'].value = ' 9000 ';
    env.elements['shared-server-token'].value = ' tok ';
    await env.elements['shared-server-start'].click();
    assert.deepEqual(env.bridge.calls, [{ host: 'h', port: 9000, token: 'tok' }]);
    assert.equal(env.elements['shared-server-status'].textContent, 'web.sharedServerRunning:{"url":"u"}');
    assert.equal(env.elements['shared-server-token'].value, '');
    assert.equal(env.elements['shared-server-start'].disabled, true);
  });

  it('an empty token is left to the shared rules', async () => {
    const env = setup(fakeBridge({ running: false, configured: false }, { running: true, host: 'h', port: 1, url: 'u' }));
    await setupSharedHosting(env);
    env.elements['shared-server-host'].value = ' h ';
    env.elements['shared-server-port'].value = ' 1 ';
    env.elements['shared-server-token'].value = '   ';
    await env.elements['shared-server-start'].click();
    assert.deepEqual(env.bridge.calls, [{ host: 'h', port: 1, token: undefined }]);
    assert.equal(env.elements['shared-server-status'].textContent, 'web.sharedServerRunning:{"url":"u"}');
    assert.equal(env.elements['shared-server-token'].value, '');
    assert.equal(env.elements['shared-server-start'].disabled, true);
  });

  it('a refused start shows the translated reason', async () => {
    const env = setup(fakeBridge({ running: false, configured: false }, { running: false, code: 'errors.serverBindFailed', params: { host: 'h', port: 1 } }));
    await setupSharedHosting(env);
    env.elements['shared-server-host'].value = ' h ';
    env.elements['shared-server-port'].value = ' 1 ';
    env.elements['shared-server-token'].value = 'keep';
    await env.elements['shared-server-start'].click();
    assert.deepEqual(env.bridge.calls, [{ host: 'h', port: 1, token: 'keep' }]);
    assert.equal(env.elements['shared-server-status'].textContent, 'errors.serverBindFailed:{"host":"h","port":1}');
    assert.equal(env.elements['shared-server-token'].value, 'keep');
    assert.equal(env.elements['shared-server-start'].disabled, false);
  });

  it('an unexpected error is shown', async () => {
    const env = setup({
      getSharedServerStatus: async () => ({ running: false, configured: false }),
      startSharedServer: async () => { throw new Error('boom'); }
    }, {});
    await setupSharedHosting(env);
    env.elements['shared-server-host'].value = ' h ';
    env.elements['shared-server-port'].value = ' 1 ';
    env.elements['shared-server-token'].value = 'keep';
    await env.elements['shared-server-start'].click();
    assert.equal(env.elements['shared-server-status'].textContent, 'boom');
    assert.equal(env.elements['shared-server-start'].disabled, false);
  });
});
