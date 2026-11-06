import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCandidateCount,
  buildLoadRequest,
  outcomeView,
  previewLines
} from '../src/web/public/load-flow.js';

test('parseCandidateCount', () => {
  const valid = [
    ['', { ok: true, value: undefined }],
    ['  ', { ok: true, value: undefined }],
    ['5', { ok: true, value: 5 }],
    [' 7 ', { ok: true, value: 7 }]
  ];
  for (const [input, expected] of valid) {
    assert.deepEqual(parseCandidateCount(input), expected);
  }
  const invalid = [
    '0',
    '-1',
    '1.5',
    'abc',
    '1e3',
    '9007199254740993'
  ];
  for (const input of invalid) {
    assert.deepEqual(parseCandidateCount(input), { ok: false });
  }
});

test('buildLoadRequest', () => {
  const req = buildLoadRequest({
    engine: 'ollama',
    model: 'm',
    ctx: 4096,
    profile: 'speed',
    force: true,
    candidatesRaw: '5',
    dryRun: false
  });
  assert.deepEqual(req, {
    ok: true,
    request: {
      engine: 'ollama',
      model: 'm',
      ctx: 4096,
      profile: 'speed',
      force: true,
      candidates: 5,
      dryRun: false,
      confirm: true
    }
  });
});

test('buildLoadRequest dryRun', () => {
  const req = buildLoadRequest({
    engine: 'ollama',
    model: 'm',
    ctx: 4096,
    profile: 'speed',
    force: true,
    candidatesRaw: '5',
    dryRun: true
  });
  assert.deepEqual(req, {
    ok: true,
    request: {
      engine: 'ollama',
      model: 'm',
      ctx: 4096,
      profile: 'speed',
      force: true,
      candidates: 5,
      dryRun: true,
      confirm: false
    }
  });
});

test('buildLoadRequest no candidates', () => {
  const req = buildLoadRequest({
    engine: 'ollama',
    model: 'm',
    ctx: 4096,
    profile: 'speed',
    force: true,
    candidatesRaw: '',
    dryRun: false
  });
  assert.equal('candidates' in req.request, false);
});

test('buildLoadRequest invalid candidates', () => {
  const req = buildLoadRequest({
    engine: 'ollama',
    model: 'm',
    ctx: 4096,
    profile: 'speed',
    force: true,
    candidatesRaw: 'x',
    dryRun: false
  });
  assert.deepEqual(req, { ok: false, errorKey: 'errors.invalidCandidateCount' });
});

test('outcomeView', () => {
  const cases = [
    [{ outcome: 'preview' }, { pill: 'warn', statusKey: 'web.loadPreviewStatus', noticeKey: 'web.loadPreviewNotice' }],
    [{ outcome: 'declined' }, { pill: 'warn', statusKey: 'web.loadDeclinedStatus', noticeKey: 'web.loadDeclinedNotice' }],
    [{ outcome: 'loaded' }, { pill: 'ok', statusKey: null, noticeKey: null }],
    [{} , { pill: 'ok', statusKey: null, noticeKey: null }]
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(outcomeView(input), expected);
  }
});

test('previewLines', () => {
  const t = (key, params) => key + JSON.stringify(params ?? {});
  const cases = [
    [{ files: ['a.json', 'b.json'], restartsApp: true }, ['a.json', 'b.json', 'cli.lmsRestart{}']],
    [{ files: ['a'] }, ['a']],
    [{ tunedModel: 'x', env: { A: '1', B: '2' } }, ['cli.ollamaNewModel{"name":"x"}', 'cli.ollamaServer{"env":"A=1 B=2"}']]
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(previewLines(input, t), expected);
  }
});
