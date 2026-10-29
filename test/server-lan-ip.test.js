import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { resolveConnectableHost } from '../src/core/util.js';

test('resolveConnectableHost returns specific host when not 0.0.0.0', () => {
  assert.equal(resolveConnectableHost('127.0.0.1'), '127.0.0.1');
  assert.equal(resolveConnectableHost('192.168.1.100'), '192.168.1.100');
});

test('resolveConnectableHost picks first non-internal IPv4 when host is 0.0.0.0', () => {
  const mockInterfaces = () => ({
    'lo0': [{ address: '127.0.0.1', internal: true, family: 'IPv4' }],
    'en0': [{ address: '192.168.1.15', internal: false, family: 'IPv4' }],
    'en1': [{ address: '10.0.0.5', internal: false, family: 'IPv4' }]
  });

  assert.equal(resolveConnectableHost('0.0.0.0', mockInterfaces), '192.168.1.15');
});

test('resolveConnectableHost falls back to 127.0.0.1 when no non-internal IPv4 exists', () => {
  const mockInterfaces = () => ({
    'lo0': [{ address: '127.0.0.1', internal: true, family: 'IPv4' }]
  });

  assert.equal(resolveConnectableHost('0.0.0.0', mockInterfaces), '127.0.0.1');
});

test('resolveConnectableHost returns valid IPv4 string with real os.networkInterfaces', () => {
  const result = resolveConnectableHost('0.0.0.0', os.networkInterfaces);
  assert.match(result, /^(\d{1,3}\.){3}\d{1,3}$/);
});


