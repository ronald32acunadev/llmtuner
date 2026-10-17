import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseSemver, isNewerVersion, checkUpdate, updateCachePath, CURRENT_VERSION } from '../src/core/updater.js';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-updater-'));
process.env.LLM_TUNER_CONFIG_DIR = dir;

let registryVersion = '0.3.0';
let registryHits = 0;
const server = http.createServer((req, res) => {
  registryHits++;
  if (req.url === '/latest') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ version: registryVersion }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const registryUrl = `http://127.0.0.1:${server.address().port}/latest`;

after(() => {
  server.closeAllConnections?.();
  server.close();
});

beforeEach(async () => {
  registryHits = 0;
  registryVersion = '0.3.0';
  await fs.rm(updateCachePath(), { force: true });
});

test('CURRENT_VERSION is loaded from package.json', () => {
  assert.ok(typeof CURRENT_VERSION === 'string');
  assert.match(CURRENT_VERSION, /^\d+\.\d+\.\d+/);
});

test('parseSemver extracts major, minor, patch and handles prefix v and suffixes', () => {
  assert.deepEqual(parseSemver('0.2.0'), [0, 2, 0]);
  assert.deepEqual(parseSemver('v1.4.12'), [1, 4, 12]);
  assert.deepEqual(parseSemver('2.0.0-rc.1'), [2, 0, 0]);
  assert.equal(parseSemver('invalid'), null);
  assert.equal(parseSemver('0.2'), null);
  assert.equal(parseSemver(''), null);
  assert.equal(parseSemver(null), null);
  assert.equal(parseSemver(123), null);
});

test('isNewerVersion correctly compares semantic versions', () => {
  assert.equal(isNewerVersion('0.3.0', '0.2.0'), true);
  assert.equal(isNewerVersion('1.0.0', '0.9.9'), true);
  assert.equal(isNewerVersion('0.2.1', '0.2.0'), true);
  assert.equal(isNewerVersion('0.2.0', '0.2.0'), false);
  assert.equal(isNewerVersion('0.1.9', '0.2.0'), false);
  assert.equal(isNewerVersion('0.0.9', '0.1.0'), false);
  assert.equal(isNewerVersion('invalid', '0.2.0'), false);
  assert.equal(isNewerVersion('0.3.0', 'invalid'), false);
});

test('checkUpdate fetches latest version from registry and caches it', async () => {
  const result = await checkUpdate({ registryUrl, currentVersion: '0.2.0' });
  assert.equal(result.updateAvailable, true);
  assert.equal(result.currentVersion, '0.2.0');
  assert.equal(result.latestVersion, '0.3.0');
  assert.equal(result.cached, false);
  assert.equal(registryHits, 1);

  // Subsequent call should hit cache without network
  const cachedResult = await checkUpdate({ registryUrl, currentVersion: '0.2.0' });
  assert.equal(cachedResult.updateAvailable, true);
  assert.equal(cachedResult.cached, true);
  assert.equal(registryHits, 1);

  // force: true should bypass cache
  const forcedResult = await checkUpdate({ force: true, registryUrl, currentVersion: '0.2.0' });
  assert.equal(forcedResult.cached, false);
  assert.equal(registryHits, 2);
});

test('checkUpdate reports no update when registry version is equal or older', async () => {
  registryVersion = '0.2.0';
  const r1 = await checkUpdate({ registryUrl, currentVersion: '0.2.0' });
  assert.equal(r1.updateAvailable, false);
  assert.equal(r1.latestVersion, '0.2.0');

  registryVersion = '0.1.0';
  const r2 = await checkUpdate({ force: true, registryUrl, currentVersion: '0.2.0' });
  assert.equal(r2.updateAvailable, false);
});

test('checkUpdate fails gracefully on network errors or unreachable registry', async () => {
  const unreachableUrl = 'http://127.0.0.1:1/nonexistent';
  const res = await checkUpdate({ registryUrl: unreachableUrl, currentVersion: '0.2.0', timeout: 500 });
  assert.equal(res.updateAvailable, false);
  assert.equal(res.latestVersion, null);
  assert.equal(res.cached, false);
});
