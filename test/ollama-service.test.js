import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { validateServiceEnv, serviceInvocation, reconcileOllamaService, serviceIO } from '../src/core/engines/ollama-service.js';

const ENV = { OLLAMA_FLASH_ATTENTION: '1', OLLAMA_KV_CACHE_TYPE: 'q8_0', OLLAMA_NUM_PARALLEL: '1', CUDA_DEVICE_ORDER: 'PCI_BUS_ID', CUDA_VISIBLE_DEVICES: '1,0' };
const URL = 'http://127.0.0.1:11434';
const result = { changed: true, restarted: true, backups: ['backup'] };

test('service environment validates values before any privileged operation', () => {
  assert.deepEqual(validateServiceEnv(ENV), ENV);
  for (const bad of [{ ...ENV, EXTRA: '1' }, { ...ENV, OLLAMA_NUM_PARALLEL: 1 }, { ...ENV, OLLAMA_NUM_PARALLEL: '0' }, { ...ENV, OLLAMA_KV_CACHE_TYPE: 'bad' }, { ...ENV, CUDA_VISIBLE_DEVICES: '1,1' }, { ...ENV, CUDA_VISIBLE_DEVICES: '1;touch /tmp/injected' }]) {
    assert.throws(() => validateServiceEnv(bad), { code: 'errors.ollamaServiceConfig' });
  }
  const { CUDA_DEVICE_ORDER, CUDA_VISIBLE_DEVICES, ...noGpu } = ENV;
  assert.deepEqual(validateServiceEnv(noGpu), noGpu);
});

test('service invocation uses a fixed embedded operation and only validated values', () => {
  const invocation = serviceInvocation(ENV);
  assert.equal(invocation.command, '/usr/bin/timeout');
  assert.deepEqual(invocation.args.slice(0, 5), ['--signal=TERM', '--kill-after=5s', '45s', '/bin/sh', '-c']);
  assert.deepEqual(invocation.args.slice(-5), ['1', 'q8_0', '1', 'PCI_BUS_ID', '1,0']);
  assert.match(invocation.args[5], /\/etc\/systemd\/system\/ollama\.service\.d\/llm-tuner\.conf/);
});

test('service reconciliation rejects remote and ambiguous targets without side effects', async (t) => {
  const inspect = t.mock.method(serviceIO, 'inspect', async () => { throw Error('must not inspect'); });
  for (const url of ['http://example.com:11434', 'http://127.0.0.1:9999', 'http://user@localhost:11434', URL + '/api', URL + '?x=1']) {
    await assert.rejects(reconcileOllamaService(url, ENV), { code: 'errors.ollamaServiceTarget' });
  }
  assert.equal(inspect.mock.callCount(), 0);
});

test('unchanged live service settings require neither authorization nor restart', async (t) => {
  t.mock.method(serviceIO, 'inspect', async () => ({ ...ENV }));
  const ready = t.mock.method(serviceIO, 'ready', async () => { throw Error('must not poll'); });
  assert.deepEqual(await reconcileOllamaService(URL, ENV), { changed: false, restarted: false, backups: [] });
  assert.equal(ready.mock.callCount(), 0);
});

test('changed or unknown live settings authorize and wait before continuing', async (t) => {
  const ready = t.mock.method(serviceIO, 'ready', async () => true);
  for (const live of [null, { ...ENV, OLLAMA_KV_CACHE_TYPE: 'f16' }]) {
    const inspect = t.mock.method(serviceIO, 'inspect', async () => live);
    let request;
    assert.deepEqual(await reconcileOllamaService(URL, ENV, { authorize: async (r) => { request = r; return result; } }), result);
    assert.deepEqual(request, { operation: 'ollama-service-env', env: ENV });
    inspect.mock.restore();
  }
  assert.equal(ready.mock.callCount(), 2);
});

test('service readiness failure cannot be reported as successful application', async (t) => {
  t.mock.method(serviceIO, 'inspect', async () => null);
  t.mock.method(serviceIO, 'ready', async () => false);
  await assert.rejects(reconcileOllamaService(URL, ENV, { authorize: async () => result }), { code: 'errors.ollamaServiceReady' });
});

test('missing authorization and cancellation prevent the load continuation', async (t) => {
  t.mock.method(serviceIO, 'inspect', async () => null);
  const ready = t.mock.method(serviceIO, 'ready', async () => { throw Error('must not poll'); });
  await assert.rejects(reconcileOllamaService(URL, ENV), { code: 'errors.ollamaAuthorizationRequired' });
  const cancelled = Object.assign(Error('cancelled'), { code: 'errors.ollamaAuthorizationFailed' });
  await assert.rejects(reconcileOllamaService(URL, ENV, { authorize: async () => { throw cancelled; } }), cancelled);
  assert.equal(ready.mock.callCount(), 0);
});

// Rewrite a copy of the literal operation, never provide runtime destination overrides.
async function shellFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-service-'));
  const dir = path.join(root, 'etc/systemd/system/ollama.service.d');
  const proc = path.join(root, 'proc/12');
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(proc, { recursive: true });
  await fs.mkdir(path.join(root, 'run'));
  await fs.mkdir(path.join(root, 'bin'));
  for (const d of ['etc', 'etc/systemd', 'etc/systemd/system', 'etc/systemd/system/ollama.service.d', 'run']) await fs.chmod(path.join(root, d), 0o755);
  const config = path.join(dir, 'llm-tuner.conf');
  const log = path.join(root, 'calls');
  const bin = `#!${process.execPath}
const fs=require('node:fs');const root=${JSON.stringify(root)};
const args=process.argv.slice(2);fs.appendFileSync(root+'/calls',args.join(' ')+'\\n');
if(args[0]==='show') console.log('12');
if(args[0]==='restart') {
  if(fs.existsSync(root+'/fail')) process.exit(7);
  const lines=fs.readFileSync(root+'/etc/systemd/system/ollama.service.d/llm-tuner.conf','utf8').split('\\n').filter(l=>l.startsWith('Environment=')).map(l=>l.slice(13,-1));
  fs.writeFileSync(root+'/proc/12/environ',lines.join('\\0')+'\\0');
}
`;
  await fs.writeFile(path.join(root, 'bin/systemctl'), bin, { mode: 0o755 });
  const live = async (env) => fs.writeFile(path.join(proc, 'environ'), Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0') + '\0');
  await live({ ...ENV, OLLAMA_KV_CACHE_TYPE: 'f16' });
  const invocation = serviceInvocation(ENV);
  const script = invocation.args[5].replaceAll('/etc', root + '/etc').replaceAll('/run', root + '/run').replaceAll('/proc/', root + '/proc/').replace('PATH=/usr/sbin:', `PATH=${root}/bin:/usr/sbin:`).replaceAll(')" = 0', ')" = ' + process.getuid());
  execFileSync('/bin/sh', ['-n', '-c', script]);
  const execute = (values = invocation.args.slice(-5)) => spawnSync('/bin/sh', ['-c', script, 'fixture', ...values], { encoding: 'utf8', timeout: 5000 });
  return { root, config, log, live, execute };
}

test('fixed service operation preserves a backup and does not restart unchanged settings', { skip: process.platform !== 'linux' }, async () => {
  const f = await shellFixture();
  try {
    await fs.writeFile(f.config, 'original config\n', { mode: 0o644 });
    const first = f.execute();
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /changed=1\nrestarted=1\nbackup=/);
    const backup = first.stdout.trim().split('backup=')[1];
    assert.equal(await fs.readFile(backup, 'utf8'), 'original config\n');
    const second = f.execute();
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.stdout, 'changed=0\nrestarted=0\nbackup=\n');
    assert.equal((await fs.readFile(f.log, 'utf8')).split('\n').filter((l) => l === 'restart ollama.service').length, 1);
    // Configured values alone cannot prove the running process received them.
    await f.live({ ...ENV, OLLAMA_KV_CACHE_TYPE: 'f16' });
    const stale = f.execute();
    assert.equal(stale.status, 0, stale.stderr);
    assert.equal(stale.stdout, 'changed=0\nrestarted=1\nbackup=\n');
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test('fixed operation rejects unsafe paths and invalid values without changing existing data', { skip: process.platform !== 'linux' }, async () => {
  const f = await shellFixture();
  try {
    const outside = path.join(f.root, 'outside');
    await fs.writeFile(outside, 'unchanged');
    await fs.symlink(outside, f.config);
    assert.notEqual(f.execute().status, 0);
    assert.equal(await fs.readFile(outside, 'utf8'), 'unchanged');
    await fs.unlink(f.config);
    assert.notEqual(f.execute(['1', 'q8_0', '100', 'PCI_BUS_ID', '1,0']).status, 0);
    assert.notEqual(f.execute(['1', 'q8_0', '1', 'PCI_BUS_ID', '1,1']).status, 0);
    assert.equal(await fs.stat(f.config).then(() => true, () => false), false);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test('service command failure is nonzero and retains the original backup', { skip: process.platform !== 'linux' }, async () => {
  const f = await shellFixture();
  try {
    await fs.writeFile(f.config, 'before failure', { mode: 0o644 });
    await fs.writeFile(path.join(f.root, 'fail'), 'restart');
    const r = f.execute();
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(r.stdout, /restarted=1/);
    const backups = (await fs.readdir(path.dirname(f.config))).filter((p) => p.includes('.bak-llm-tuner-'));
    assert.equal(backups.length, 1);
    assert.equal(await fs.readFile(path.join(path.dirname(f.config), backups[0]), 'utf8'), 'before failure');
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});
