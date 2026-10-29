import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHardware, isLoopback, verifyToken, startServer } from '../src/web/server.js';

test('sanitizeHardware removes sensitive hardware identifiers', () => {
  const rawHw = {
    os: { platform: 'linux', arch: 'x64', distro: 'ubuntu', release: '22.04' },
    cpu: { brand: 'Intel(R) Core(TM) i7-12700K', physicalCores: 12, threads: 20, avx2: true },
    ram: { totalBytes: 34359738368, availableBytes: 17179869184 },
    ramBandwidthGBps: 50,
    gpus: [{
      vendor: 'nvidia',
      backend: 'cuda',
      index: 0,
      name: 'NVIDIA GeForce RTX 3080',
      uuid: 'GPU-12345678-90ab-cdef',
      busId: '0000:01:00.0',
      pcieGen: 4,
      pcieWidth: 16,
      pcieGBps: 31.5,
      totalBytes: 10737418240,
      usedBytes: 5368709120,
      freeBytes: 5368709120,
      bandwidthGBps: 760,
      displayAttached: false,
      unifiedMemory: false,
    }]
  };

  const sanitized = sanitizeHardware(rawHw);

  assert.deepEqual(sanitized.os, { platform: 'linux', arch: 'x64' });
  assert.ok(!('distro' in sanitized.os));
  assert.ok(!('release' in sanitized.os));

  assert.equal(sanitized.cpu.physicalCores, 12);
  assert.equal(sanitized.cpu.threads, 20);
  assert.equal(sanitized.cpu.avx2, true);
  assert.ok(!('brand' in sanitized.cpu));

  const gpu = sanitized.gpus[0];
  assert.equal(gpu.name, 'NVIDIA GeForce RTX 3080');
  assert.equal(gpu.totalBytes, 10737418240);
  assert.equal(gpu.freeBytes, 5368709120);
  assert.ok(!('uuid' in gpu));
  assert.ok(!('busId' in gpu));
  assert.ok(!('pcieGen' in gpu));
  assert.ok(!('pcieWidth' in gpu));
  assert.ok(!('pcieGBps' in gpu));
});

test('isLoopback identifies loopback addresses correctly', () => {
  const truthy = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  const falsy = ['192.168.1.5', '10.0.0.1', '8.8.8.8'];

  truthy.forEach(ip => assert.strictEqual(isLoopback(ip), true, `Expected ${ip} to be loopback`));
  falsy.forEach(ip => assert.strictEqual(isLoopback(ip), false, `Expected ${ip} not to be loopback`));
});

test('verifyToken validates authorization headers', () => {
  const token = 'secret-key-12345';
  const validReq = { headers: { authorization: `Bearer ${token}` }, socket: { remoteAddress: '1.2.3.4' } };
  const invalidReq = { headers: { authorization: 'Bearer wrong-key' }, socket: { remoteAddress: '1.2.3.4' } };
  const missingReq = { headers: {}, socket: { remoteAddress: '1.2.3.4' } };
  const loopbackReq = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };

  assert.strictEqual(verifyToken(validReq, token), true);
  assert.strictEqual(verifyToken(invalidReq, token), false);
  assert.strictEqual(verifyToken(missingReq, token), false);
  assert.strictEqual(verifyToken(loopbackReq, null), true);
});

test('HTTP server integration and sanitization', async () => {
  let instance = null;
  const testToken = 'integration-token-xyz';

  try {
    instance = await startServer({ port: 0, token: testToken, serverMode: true });
    const { server, port } = instance;
    const baseUrl = `http://127.0.0.1:${port}/api/state`;

    // 1. Without Authorization header -> 401 Unauthorized
    const res401 = await fetch(baseUrl);
    assert.strictEqual(res401.status, 401);

    // 2. With wrong token -> 401 Unauthorized
    const resWrong = await fetch(baseUrl, {
      headers: { Authorization: 'Bearer wrong' }
    });
    assert.strictEqual(resWrong.status, 401);

    // 3. With correct token -> 200 OK and sanitized hardware
    const res200 = await fetch(baseUrl, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    assert.strictEqual(res200.status, 200);

    const data = await res200.json();
    assert.ok(data.hw);
    assert.ok(!('distro' in data.hw.os));
    assert.ok(!('brand' in data.hw.cpu));
    if (data.hw.gpus?.length > 0) {
      assert.ok(!('uuid' in data.hw.gpus[0]));
      assert.ok(!('busId' in data.hw.gpus[0]));
    }

    // 4. Remote request to /api/install is 403 Forbidden
    const resInstall = await fetch(`http://127.0.0.1:${port}/api/install`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${testToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine: 'ollama', planId: 'test' })
    });
    assert.strictEqual(resInstall.status, 403);
  } finally {
    if (instance?.server) {
      await new Promise((resolve) => instance.server.close(resolve));
    }
  }
});
