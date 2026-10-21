import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createOllamaAuthorizer, authorizationIO } from '../src/platform/ollama-authorize.js';

const env = { OLLAMA_FLASH_ATTENTION: '1', OLLAMA_KV_CACHE_TYPE: 'q8_0', OLLAMA_NUM_PARALLEL: '1' };
const request = { operation: 'ollama-service-env', env };
function mockChild(t, { code = 0, output = 'changed=0\nrestarted=0\nbackup=\n', error } = {}) {
  let invocation;
  t.mock.method(authorizationIO, 'spawn', (...args) => {
    invocation = args;
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    queueMicrotask(() => {
      if (error) child.emit('error', error);
      else { child.stdout.end(output); child.emit('close', code); }
    });
    return child;
  });
  return () => invocation;
}

test('desktop authorization uses fixed native command and no text prompt', async (t) => {
  const call = mockChild(t);
  assert.deepEqual(await createOllamaAuthorizer({ mode: 'desktop' })(request), { changed: false, restarted: false, backups: [] });
  const [bin, args, opts] = call();
  assert.equal(bin, '/usr/bin/pkexec');
  assert.deepEqual(args.slice(0, 5), ['--disable-internal-agent', '/usr/bin/timeout', '--signal=TERM', '--kill-after=5s', '45s']);
  assert.deepEqual(opts.stdio, ['ignore', 'pipe', 'pipe']);
  assert.deepEqual(Object.keys(opts.env).sort(), ['LANG', 'PATH']);
});

test('terminal authorization owns terminal input and balances animation hooks', async (t) => {
  const call = mockChild(t);
  const hooks = [];
  await createOllamaAuthorizer({ mode: 'terminal', beforePrompt: () => hooks.push('pause'), afterPrompt: () => hooks.push('resume') })(request);
  assert.equal(call()[0], '/usr/bin/sudo');
  assert.equal(call()[1][0], '--');
  assert.deepEqual(call()[2].stdio, ['inherit', 'pipe', 'inherit']);
  assert.deepEqual(hooks, ['pause', 'resume']);
});

test('noninteractive authorization never prompts and rejects unavailable authorization', async (t) => {
  const call = mockChild(t, { code: 1 });
  await assert.rejects(createOllamaAuthorizer({ mode: 'noninteractive' })(request), { code: 'errors.ollamaAuthorizationRequired' });
  assert.deepEqual(call()[1].slice(0, 2), ['-n', '--']);
  assert.deepEqual(call()[2].stdio, ['ignore', 'pipe', 'pipe']);
});

test('native cancellation and absent facility are actionable failures', async (t) => {
  mockChild(t, { code: 126 });
  await assert.rejects(createOllamaAuthorizer({ mode: 'desktop' })(request), { code: 'errors.ollamaAuthorizationCancelled' });
  mockChild(t, { error: Object.assign(Error('missing'), { code: 'ENOENT' }) });
  await assert.rejects(createOllamaAuthorizer({ mode: 'desktop' })(request), { code: 'errors.ollamaAuthorizationUnavailable' });
});

test('authorization rejects caller commands and invalid output without retries', async (t) => {
  const call = mockChild(t, { output: 'changed=1\nrestarted=0\nbackup=/tmp/untrusted\n' });
  const authorize = createOllamaAuthorizer({ mode: 'desktop' });
  await assert.rejects(authorize({ ...request, command: '/tmp/script' }), { code: 'errors.ollamaServiceConfig' });
  assert.equal(call(), undefined);
  await assert.rejects(authorize(request), { code: 'errors.ollamaAuthorizationFailed' });
});

test('noninteractive service failure is not misreported as a missing password', async (t) => {
  mockChild(t, { code: 70 });
  await assert.rejects(createOllamaAuthorizer({ mode: 'noninteractive' })(request), { code: 'errors.ollamaAuthorizationFailed' });
});

for (const cause of ['timeout', 'output limit']) test(`${cause} retains lifecycle ownership until an elevated child actually closes`, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const child = new EventEmitter();
  child.pid = 123;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => false;
  t.mock.method(authorizationIO, 'spawn', () => child);
  let settled = false;
  const pending = createOllamaAuthorizer({ mode: 'desktop' })(request);
  const rejection = assert.rejects(pending, { code: 'errors.ollamaAuthorizationFailed' });
  pending.then(() => { settled = true; }, () => { settled = true; });
  if (cause === 'timeout') t.mock.timers.tick(60000);
  else child.stdout.write(Buffer.alloc(16385, 'x'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false, 'a failed termination request is not a completed operation');
  child.emit('error', Object.assign(Error('cannot signal elevated child'), { code: 'EPERM' }));
  await Promise.resolve();
  assert.equal(settled, false);
  child.stdout.end('changed=1\nrestarted=1\nbackup=\n');
  child.emit('close', 0);
  await rejection;
});
