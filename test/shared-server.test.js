import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSharedServer } from '../src/platform/shared-server.js';

function fixture({ config = null, listenError = null, boundPort = 7860 } = {}) {
  const writes = [];
  const listens = [];
  let closed = 0;
  const shared = createSharedServer({
    readConfig: async () => config,
    writeConfig: async (value) => { writes.push(value); },
    listen: async (options) => {
      listens.push(options);
      if (listenError) throw listenError;
      return { server: { close: (done) => { closed += 1; done?.(); } }, port: boundPort };
    },
    newToken: () => 'generated',
    resolveHost: (host) => host,
  });
  return { shared, writes, listens, closedCount: () => closed };
}

test('start persists the bound port and hides the token', async () => {
  const { shared, writes, listens } = fixture({ boundPort: 9000 });
  const result = await shared.start({ host: '127.0.0.1', port: 0 });
  assert.deepEqual(result, { running: true, host: '127.0.0.1', port: 9000, url: 'http://127.0.0.1:9000' });
  assert.deepEqual(writes, [{ port: 9000, host: '127.0.0.1', token: 'generated' }]);
  assert.deepEqual(listens, [{ host: '127.0.0.1', port: 0, token: 'generated', serverMode: true }]);
});

test('an explicit token wins over the saved one', async () => {
  const { shared, writes } = fixture({ config: { token: 'old' } });
  await shared.start({ host: 'h', port: 1, token: 'new' });
  assert.equal(writes[0].token, 'new');
});

test('the saved token is reused', async () => {
  const { shared, writes } = fixture({ config: { token: 'old' } });
  await shared.start({ host: 'h', port: 1 });
  assert.equal(writes[0].token, 'old');
});

test('invalid input touches nothing', async () => {
  const invalidInputs = [
    { input: { host: '', port: 1 }, code: 'errors.invalidServerHost' },
    { input: { host: 'a b', port: 1 }, code: 'errors.invalidServerHost' },
    { input: { host: 'h', port: 70000 }, code: 'errors.invalidServerPort' },
    { input: { host: 'h', port: 1.5 }, code: 'errors.invalidServerPort' },
    { input: { host: 'h', port: '1' }, code: 'errors.invalidServerPort' },
    { input: { host: 'h', port: 1, token: '' }, code: 'errors.invalidServerToken' },
    { input: { host: 'h', port: 1, token: 'a b' }, code: 'errors.invalidServerToken' }
  ];
  for (const { input, code } of invalidInputs) {
    const { shared, listens, writes } = fixture();
    await assert.rejects(shared.start(input), { code });
    assert.equal(listens.length, 0);
    assert.equal(writes.length, 0);
  }
});

test('a failed bind keeps the saved configuration', async () => {
  const { shared, writes, listens } = fixture({ listenError: new Error('in use'), config: { token: 'old', host: 'x', port: 1 } });
  await assert.rejects(shared.start({ host: 'x', port: 1 }), { code: 'errors.serverBindFailed' });
  assert.equal(writes.length, 0);
  const status = await shared.status();
  assert.deepEqual(status, { running: false, configured: true, host: 'x', port: 1 });
});

test('a matching second start reuses the server', async () => {
  const { shared, listens } = fixture({ boundPort: 7860 });
  await shared.start({ host: 'h', port: 1 });
  await shared.start({ host: 'h', port: 1 });
  assert.deepEqual(await shared.status(), { running: true, host: 'h', port: 7860, url: 'http://h:7860', configured: true });
  assert.equal(listens.length, 1);
});

test('a conflicting start is refused', async () => {
  const { shared, listens } = fixture({ boundPort: 7860 });
  await shared.start({ host: 'h', port: 7860 });
  await assert.rejects(shared.start({ host: 'h', port: 7861 }), { code: 'errors.serverAlreadyRunning' });
  assert.equal(listens.length, 1);
});

test('IPv6 hosts get brackets', async () => {
  const { shared } = fixture({ boundPort: 7860 });
  await shared.start({ host: '::1', port: 7860 });
  const status = await shared.status();
  assert.equal(status.url, 'http://[::1]:7860');
});

test('status never exposes the token', async () => {
  const { shared } = fixture();
  await shared.start({ host: 'h', port: 1, token: 'secret' });
  const json = JSON.stringify(await shared.status());
  assert.ok(!json.includes('secret'));
  const statusObj = await shared.status();
  assert.equal(statusObj.configured, true);
});

test('close stops the owned server', async () => {
  const { shared, closedCount } = fixture({ boundPort: 7860 });
  await shared.start({ host: 'h', port: 1 });
  await shared.close();
  assert.equal(closedCount(), 1);
  const status = await shared.status();
  assert.equal(status.running, false);
  await shared.close(); // second close
  assert.equal(closedCount(), 1);
});

test('status without a configuration', async () => {
  const { shared } = fixture({ config: null });
  const status = await shared.status();
  assert.deepEqual(status, { running: false, configured: false });
});

test('a different explicit token on a running server is refused', async () => {
  const { shared, listens } = fixture({ config: {}, listenError: null, boundPort: 1 });
  await shared.start({ host: 'h', port: 1, token: 'a' });
  await assert.rejects(shared.start({ host: 'h', port: 1, token: 'b' }), { code: 'errors.serverAlreadyRunning' });
  assert.equal(listens.length, 1);
  await shared.start({ host: 'h', port: 1, token: 'a' });
  await shared.start({ host: 'h', port: 1 });
  assert.equal(listens.length, 1);
});

test('a failed save closes the listener', async () => {
  let closed = 0;
  const shared = createSharedServer({
    readConfig: async () => null,
    writeConfig: async () => { throw new Error('read only'); },
    listen: async () => ({
      server: { close: (done) => { closed += 1; done?.(); } },
      port: 1
    }),
    newToken: () => 't',
    resolveHost: (host) => host,
  });
  await assert.rejects(shared.start({ host: 'h', port: 1 }), /read only/);
  assert.equal(closed, 1);
  const status = await shared.status();
  assert.equal(status.running, false);
});
