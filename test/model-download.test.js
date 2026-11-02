import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadModel, isValidModelName } from '../src/core/model-download.js';

function runner(result = { code: 0 }) {
  const calls = [];
  return { calls, run: async (plan, onLine) => { calls.push(plan); onLine('line'); return result; } };
}

test('ollama uses pull', async t => {
  const r = runner();
  const res = await downloadModel({
    engineId: 'ollama',
    name: 'llama3:8b',
    bin: '/b/ollama',
    onLine: () => {},
    runInstall: r.run
  });
  assert.deepEqual(res, { code: 0 });
  assert.deepEqual(r.calls, [{ cmd: '/b/ollama', args: ['pull', 'llama3:8b'] }]);
});

test('lmstudio uses get with -y', async t => {
  const r = runner();
  const res = await downloadModel({
    engineId: 'lmstudio',
    name: 'org/model-GGUF',
    bin: '/b/lms',
    onLine: () => {},
    runInstall: r.run
  });
  assert.deepEqual(res, { code: 0 });
  assert.deepEqual(r.calls, [{ cmd: '/b/lms', args: ['get', 'org/model-GGUF', '-y'] }]);
});

test('the name is trimmed', async t => {
  const r = runner();
  const res = await downloadModel({
    engineId: 'ollama',
    name: '  llama3  ',
    bin: '/b/ollama',
    onLine: () => {},
    runInstall: r.run
  });
  assert.deepEqual(res, { code: 0 });
  assert.deepEqual(r.calls, [{ cmd: '/b/ollama', args: ['pull', 'llama3'] }]);
});

test('a failing command returns its code', async t => {
  const r = runner({ code: 1 });
  const res = await downloadModel({
    engineId: 'ollama',
    name: 'llama3',
    bin: '/b/ollama',
    onLine: () => {},
    runInstall: r.run
  });
  assert.deepEqual(res, { code: 1 });
});

test('injection attempts never reach the runner', async t => {
  const invalidNames = [
    '',
    '   ',
    '--help',
    '-y',
    'a b',
    'a;rm -rf /',
    'a&b',
    '$(x)',
    '`x`',
    'a|b',
    'a\nb',
    'x'.repeat(257)
  ];
  for (const name of invalidNames) {
    const r = runner();
    await assert.rejects(
      downloadModel({
        engineId: 'ollama',
        name,
        bin: '/b/ollama',
        onLine: () => {},
        runInstall: r.run
      }),
      { code: 'errors.invalidModelName' }
    );
    assert.equal(r.calls.length, 0);
  }
});

test('an unsupported engine is rejected', async t => {
  const r = runner();
  await assert.rejects(
    downloadModel({
      engineId: 'other',
      name: 'llama3',
      bin: '/b/ollama',
      onLine: () => {},
      runInstall: r.run
    }),
    { code: 'errors.unknownEngine' }
  );
  assert.equal(r.calls.length, 0);
});

test('a missing binary is rejected', async t => {
  const r = runner();
  await assert.rejects(
    downloadModel({
      engineId: 'ollama',
      name: 'llama3',
      bin: undefined,
      onLine: () => {},
      runInstall: r.run
    }),
    { code: 'errors.installNotFinished' }
  );
  assert.equal(r.calls.length, 0);
});

test('valid names are accepted', async t => {
  const validNames = [
    'llama3',
    'llama3:8b',
    'hf.co/org/model:Q4_K_M',
    'org/model-GGUF',
    'https://huggingface.co/org/model'
  ];
  for (const name of validNames) {
    assert.equal(isValidModelName(name), true);
  }
});
