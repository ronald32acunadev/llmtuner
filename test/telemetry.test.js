import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleRam, sampleGpus, startTelemetrySampler } from '../src/core/telemetry.js';

test('sampleRam returns correct structure and values', () => {
  const result = sampleRam();

  assert.ok(typeof result === 'object' && result !== null);
  assert.ok('totalBytes' in result);
  assert.ok('freeBytes' in result);
  assert.ok('usedBytes' in result);
  assert.ok('percent' in result);

  assert.ok(typeof result.totalBytes === 'number' && result.totalBytes > 0);
  assert.ok(typeof result.freeBytes === 'number' && result.freeBytes > 0);
  assert.ok(typeof result.usedBytes === 'number' && result.usedBytes >= 0);
  assert.ok(typeof result.percent === 'number' && result.percent >= 0 && result.percent <= 100);

  assert.equal(result.usedBytes + result.freeBytes, result.totalBytes);
});

test('sampleGpus returns Promise resolving to array', async () => {
  const result = await sampleGpus();

  assert.ok(Array.isArray(result));

  if (result.length > 0) {
    for (const gpu of result) {
      assert.ok('index' in gpu);
      assert.ok('name' in gpu);
      assert.ok('totalBytes' in gpu);
      assert.ok('usedBytes' in gpu);
      assert.ok('freeBytes' in gpu);
      assert.ok('percent' in gpu);

      assert.ok(typeof gpu.index === 'number');
      assert.ok(typeof gpu.totalBytes === 'number' && gpu.totalBytes > 0);
      assert.ok(typeof gpu.usedBytes === 'number' && gpu.usedBytes >= 0);
      assert.ok(typeof gpu.freeBytes === 'number' && gpu.freeBytes >= 0);
      assert.ok(typeof gpu.percent === 'number' && gpu.percent >= 0 && gpu.percent <= 100);

      assert.ok(gpu.usedBytes <= gpu.totalBytes);
      assert.ok(gpu.freeBytes <= gpu.totalBytes);
      assert.ok(gpu.usedBytes + gpu.freeBytes <= gpu.totalBytes);
    }
  }
});

test('startTelemetrySampler calls callback with correct structure', async () => {
  let sampler;
  const sample = await new Promise((resolve) => {
    sampler = startTelemetrySampler((s) => {
      resolve(s);
    }, 20);
  });
  sampler.stop();

  assert.ok(typeof sample === 'object' && sample !== null);
  assert.ok('cpu' in sample);
  assert.ok('ram' in sample);
  assert.ok('gpus' in sample);

  assert.ok(typeof sample.cpu.percent === 'number' && sample.cpu.percent >= 0);

  assert.ok(typeof sample.ram === 'object' && sample.ram !== null);
  assert.ok('totalBytes' in sample.ram);
  assert.ok('freeBytes' in sample.ram);
  assert.ok('usedBytes' in sample.ram);
  assert.ok('percent' in sample.ram);

  assert.ok(typeof sample.ram.totalBytes === 'number' && sample.ram.totalBytes > 0);
  assert.ok(typeof sample.ram.freeBytes === 'number' && sample.ram.freeBytes >= 0);
  assert.ok(typeof sample.ram.usedBytes === 'number' && sample.ram.usedBytes >= 0);
  assert.ok(typeof sample.ram.percent === 'number' && sample.ram.percent >= 0 && sample.ram.percent <= 100);

  assert.equal(sample.ram.usedBytes + sample.ram.freeBytes, sample.ram.totalBytes);
});

test('startTelemetrySampler stops correctly', async () => {
  let callCount = 0;
  let sampler;

  await new Promise((resolve) => {
    sampler = startTelemetrySampler(() => {
      callCount++;
      if (callCount === 1) resolve();
    }, 20);
  });

  sampler.stop();
  const countAtStop = callCount;
  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.equal(callCount, countAtStop);
});
