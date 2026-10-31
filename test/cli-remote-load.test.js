import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadCommand } from '../src/cli/commands/load.js';

const cliPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli', 'index.js');

function setup({ settings = { activeServerId: 'remote', servers: [{ id: 'remote', name: 'Test Rig', url: 'https://rig.example:7860', token: 'not-for-display' }] }, models = [{ key: 'm1', name: 'Model One', sizeBytes: 10 }], plan = { meta: { trainContext: 32768 }, maxContext: { f16: 16384 }, candidates: [], profiles: { variants: [{ key: 'm1-q4', quant: 'Q4', selected: true }], variantSelect: true, recommended: { profile: 'quality', reasonCode: 'profile.recommend.qualityFits' }, profiles: { speed: { loads: 'm1-q4', kvTypes: ['f16'] }, balanced: { loads: 'm1-q4', kvTypes: ['f16'] }, quality: { loads: 'm1-q4', kvTypes: ['f16'] } }, hints: [], vramBusy: false } }, result = { loaded: null } } = {}) {
  const output = [];
  const calls = [];
  return {
    output, calls,
    deps: {
      readSettings: async () => settings,
      writeSettings: async () => {},
      detectHardware: async () => { calls.push('detectHardware'); return {}; },
      detectEngines: async () => { calls.push('detectEngines'); return { engines: [], recommended: 'ollama' }; },
      checkUpdate: async () => { calls.push('checkUpdate'); return null; },
      createTuner: async () => { calls.push('createTuner'); throw new Error('local tuner used for remote'); },
      client: {
        getState: async () => { calls.push('getState'); return { hw: { cpu: { brand: 'Remote CPU' }, gpus: [], ram: { totalBytes: 1024 } }, engines: [{ id: 'ollama', name: 'Ollama', detection: { installed: true } }], recommended: 'ollama' }; },
        listModels: async () => { calls.push('listModels'); return { models }; },
        planModel: async (request) => { calls.push(['planModel', request]); return plan; },
        listPresets: async (request) => { calls.push(['listPresets', request]); return { presets: [{ ctx: 8192, shortTps: 20 }] }; },
        loadModel: async (request) => { calls.push(['loadModel', request]); return result; },
      },
      selectPrompt: async (prompt) => { calls.push(['select', prompt]); return prompt.default || prompt.choices.find((choice) => choice.value !== undefined && choice.value !== Symbol.for('never'))?.value; },
      inputPrompt: async (prompt) => { calls.push(['input', prompt]); return prompt.default || '8192'; },
      searchPrompt: async (prompt) => { calls.push(['search', prompt]); return prompt.source('')[2]?.value || 'm1'; },
      log: (...values) => output.push(values.join(' ')),
      error: (...values) => output.push(values.join(' ')),
    },
  };
}

test('remote scripted load uses the remote API and never creates a local tuner', async () => {
  const h = setup({ result: { loaded: { ok: true, short: { genTps: 12 }, model: 'Model One' } } });
  await loadCommand({ engine: 'ollama', model: 'm1', ctx: '8192', profile: 'balanced', json: true }, { lang: 'en', theme: 'system' }, h.deps);

  assert.ok(h.calls.includes('getState'));
  assert.ok(h.calls.includes('listModels'));
  assert.ok(h.calls.some((call) => Array.isArray(call) && call[0] === 'loadModel'));
  assert.ok(!h.calls.includes('detectHardware'));
  assert.ok(!h.calls.includes('createTuner'));
});

test('remote wizard plans context and profile with the selected target client', async () => {
  const h = setup();
  const output = [];
  const previousLog = console.log;
  console.log = (...values) => output.push(values.join(' '));
  try {
    await loadCommand({}, { lang: 'en', theme: 'system' }, h.deps);
  } finally {
    console.log = previousLog;
  }

  assert.ok(h.calls.some((call) => Array.isArray(call) && call[0] === 'planModel' && call[1].engine === 'ollama' && call[1].model === 'm1'));
  assert.ok(h.calls.some((call) => Array.isArray(call) && call[0] === 'listPresets' && call[1].engine === 'ollama' && call[1].model === 'm1'));
  const profilePrompt = h.calls.find((call) => Array.isArray(call) && call[0] === 'select' && call[1].message === 'Load profile:')?.[1];
  assert.equal(profilePrompt?.default, 'quality');
  assert.ok(profilePrompt?.choices.some((choice) => choice.value === 'quality' && /recommended/i.test(choice.name)));
  assert.match(output.join(' '), /Quality is recommended/);
  assert.match(output.join(' '), /Active computer: Test Rig \(https:\/\/rig\.example:7860\)/);
  assert.doesNotMatch(output.join(' '), /not-for-display/);
  assert.ok(!h.calls.includes('createTuner'));
});

test('remote wizard uses generic profile choices when optional profile preview is absent', async () => {
  const withStoredProfile = setup({
    settings: { activeServerId: 'remote', profile: 'speed', servers: [{ id: 'remote', name: 'Test Rig', url: 'https://rig.example:7860', token: 'not-for-display' }] },
    plan: { meta: { trainContext: 32768 }, maxContext: { f16: 16384 }, candidates: [], profiles: null },
    result: { loaded: null },
  });
  const withoutStoredProfile = setup({
    plan: { meta: { trainContext: 32768 }, maxContext: { f16: 16384 }, candidates: [], profiles: null },
    result: { loaded: null },
  });
  const previousLog = console.log;
  console.log = () => {};
  try {
    await loadCommand({}, { lang: 'en', theme: 'system' }, withStoredProfile.deps);
    await loadCommand({}, { lang: 'en', theme: 'system' }, withoutStoredProfile.deps);
  } finally {
    console.log = previousLog;
  }

  for (const [h, expected] of [[withStoredProfile, 'speed'], [withoutStoredProfile, 'balanced']]) {
    const profilePrompt = h.calls.find((call) => Array.isArray(call) && call[0] === 'select' && call[1].message === 'Load profile:')?.[1];
    assert.deepEqual(profilePrompt?.choices.filter((choice) => ['speed', 'balanced', 'quality'].includes(choice.value)).map((choice) => choice.value), ['speed', 'balanced', 'quality']);
    assert.equal(profilePrompt?.default, expected);
    assert.ok(h.calls.some((call) => Array.isArray(call) && call[0] === 'loadModel' && call[1].profile === expected));
    assert.ok(!h.calls.includes('createTuner'));
  }
});

test('remote JSON load keeps stdout as parseable JSON without active-target guidance', async () => {
  const h = setup({ result: { loaded: null } });
  const output = [];
  const previousLog = console.log;
  console.log = (...values) => output.push(values.join(' '));
  try {
    await loadCommand({ engine: 'ollama', model: 'm1', ctx: '8192', profile: 'balanced', json: true }, { lang: 'en', theme: 'system' }, h.deps);
  } finally {
    console.log = previousLog;
  }
  assert.deepEqual(JSON.parse(output.at(-1)), { loaded: null });
  assert.doesNotMatch(output.join(' '), /Active computer|rig\.example|not-for-display/);
});

test('an empty remote model list explains that models must be installed on the target without local downloads', async () => {
  const h = setup({ models: [] });
  await assert.rejects(loadCommand({}, { lang: 'en', theme: 'system' }, h.deps), /Install or download a model on that computer/i);
  assert.ok(!h.calls.includes('createTuner'));
  assert.ok(!h.calls.some((call) => Array.isArray(call) && call[0] === 'input'));
});

test('remote dry-run asks the target for a preview', async (t) => {
  const h = setup({ result: { preview: {} } });
  const lines = [];
  t.mock.method(console, 'log', (...values) => lines.push(values.join(' ')));
  await loadCommand(
    { engine: 'ollama', model: 'm1', ctx: '8192', profile: 'balanced', 'dry-run': true },
    { lang: 'en', theme: 'system' }, h.deps
  );
  const request = h.calls.find((call) => Array.isArray(call) && call[0] === 'loadModel')[1];
  assert.equal(request.dryRun, true);
  assert.equal(request.confirm, false);
  assert.ok(lines.join(' ').includes('nothing was applied'));
});

test('remote --yes applies without a confirmation', async (t) => {
  const h = setup({ result: { loaded: { ok: true, short: { genTps: 12 } } } });
  const lines = [];
  t.mock.method(console, 'log', (...values) => lines.push(values.join(' ')));
  await loadCommand(
    { engine: 'ollama', model: 'm1', ctx: '8192', profile: 'balanced', yes: true },
    { lang: 'en', theme: 'system' }, h.deps
  );
  const request = h.calls.find((call) => Array.isArray(call) && call[0] === 'loadModel')[1];
  assert.equal(request.dryRun, false);
  assert.equal(request.confirm, false);
});

test('remote load asks before applying and can decline', async (t) => {
  let captured;
  let accepted;
  const h = setup({ result: { loaded: { ok: true, short: { genTps: 12 } } } });
  const lines = [];
  t.mock.method(console, 'log', (...values) => lines.push(values.join(' ')));
  h.deps.confirmPrompt = async () => false;
  h.deps.client.loadModel = async (request, onProgress, extra) => {
    captured = request;
    accepted = await extra.confirmApply({ tunedModel: 'tuned-x', env: { A: '1' } });
    return { applied: false };
  };
  await loadCommand(
    { engine: 'ollama', model: 'm1', ctx: '8192', profile: 'balanced' },
    { lang: 'en', theme: 'system' }, h.deps
  );
  assert.equal(captured.confirm, true);
  assert.equal(accepted, false);
  assert.ok(lines.join(' ').includes('tuned-x'));
});

test('remote load shows the same events as a local load', async (t) => {
  const h = setup({ result: { loaded: { ok: true, short: { genTps: 12 } } } });
  const lines = [];
  t.mock.method(console, 'log', (...values) => lines.push(values.join(' ')));
  h.deps.client.loadModel = async (request, onProgress) => {
    onProgress({ type: 'status', code: 'status.applying' });
    onProgress({ type: 'telemetry', cpu: 1 });
    onProgress({ type: 'preset-saved', file: '/x/preset.json' });
    return { loaded: { ok: true, short: { genTps: 12 } } };
  };
  await loadCommand(
    { engine: 'ollama', model: 'm1', ctx: '8192', profile: 'balanced', yes: true },
    { lang: 'en', theme: 'system' }, h.deps
  );
  assert.ok(lines.join(' ').includes('/x/preset.json'));
});

test('remote json output stays clean', async (t) => {
  const h = setup({ result: { loaded: { ok: true, short: { genTps: 12 } } } });
  const lines = [];
  t.mock.method(console, 'log', (...values) => lines.push(values.join(' ')));
  h.deps.client.loadModel = async (request, onProgress) => {
    onProgress({ type: 'status', code: 'status.applying' });
    onProgress({ type: 'telemetry', cpu: 1 });
    onProgress({ type: 'preset-saved', file: '/x/preset.json' });
    return { loaded: { ok: true, short: { genTps: 12 } } };
  };
  await loadCommand(
    { engine: 'ollama', model: 'm1', ctx: '8192', profile: 'balanced', yes: true, json: true },
    { lang: 'en', theme: 'system' }, h.deps
  );
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), { loaded: { ok: true, short: { genTps: 12 } } });
});

test('invalid candidate count is refused before any call', async () => {
  const values = ['abc', '0', '-1', '1.5'];
  for (const value of values) {
    const h = setup();
    await assert.rejects(
      loadCommand({
        engine: 'ollama',
        model: 'm1',
        ctx: '8192',
        profile: 'balanced',
        yes: true,
        candidates: value
      }, { lang: 'en', theme: 'system' }, h.deps),
      { code: 'errors.invalidCandidateCount' }
    );
    assert.deepEqual(h.calls, []);
  }
});
