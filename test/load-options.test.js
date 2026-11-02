import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLoadOptions } from '../src/core/load-options.js';

test('default options are normalized correctly', () => {
  const result = normalizeLoadOptions();
  assert.deepStrictEqual(result, {
    force: false,
    candidates: 3,
    dryRun: false
  });
});

test('explicit valid candidate count is preserved', () => {
  const result = normalizeLoadOptions({ candidates: 5 });
  assert.deepStrictEqual(result, { candidates: 5, force: false, dryRun: false });
});

test('invalid candidate count throws TunerError with code errors.invalidCandidateCount', () => {
  assert.throws(() => normalizeLoadOptions({ candidates: 0 }), { code: 'errors.invalidCandidateCount' });
});

test('negative candidate count throws TunerError with code errors.invalidCandidateCount', () => {
  assert.throws(() => normalizeLoadOptions({ candidates: -1 }), { code: 'errors.invalidCandidateCount' });
});

test('fractional candidate count throws TunerError with code errors.invalidCandidateCount', () => {
  assert.throws(() => normalizeLoadOptions({ candidates: 2.5 }), { code: 'errors.invalidCandidateCount' });
});

test('string candidate count throws TunerError with code errors.invalidCandidateCount', () => {
  assert.throws(() => normalizeLoadOptions({ candidates: '3' }), { code: 'errors.invalidCandidateCount' });
});

test('NaN candidate count throws TunerError with code errors.invalidCandidateCount', () => {
  assert.throws(() => normalizeLoadOptions({ candidates: NaN }), { code: 'errors.invalidCandidateCount' });
});

test('Infinity candidate count throws TunerError with code errors.invalidCandidateCount', () => {
  assert.throws(() => normalizeLoadOptions({ candidates: Infinity }), { code: 'errors.invalidCandidateCount' });
});

test('candidate count above Number.MAX_SAFE_INTEGER throws TunerError with code errors.invalidCandidateCount', () => {
  const tooLarge = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => normalizeLoadOptions({ candidates: tooLarge }), { code: 'errors.invalidCandidateCount' });
});

test('explicit dryRun boolean is preserved', () => {
  const resultTrue = normalizeLoadOptions({ dryRun: true });
  assert.deepStrictEqual(resultTrue, { dryRun: true, force: false, candidates: 3 });

  const resultFalse = normalizeLoadOptions({ dryRun: false });
  assert.deepStrictEqual(resultFalse, { dryRun: false, force: false, candidates: 3 });
});

test('explicit confirm boolean is preserved', () => {
  const resultTrue = normalizeLoadOptions({ confirm: true });
  assert.deepStrictEqual(resultTrue, { confirm: true, force: false, candidates: 3, dryRun: false });

  const resultFalse = normalizeLoadOptions({ confirm: false });
  assert.deepStrictEqual(resultFalse, { confirm: false, force: false, candidates: 3, dryRun: false });
});

test('omitted confirm remains omitted', () => {
  const result = normalizeLoadOptions();
  assert.strictEqual('confirm' in result, false);
});

test('other fields are preserved unchanged', () => {
  const options = { engine: 'foo', model: 'bar', ctx: 'baz', profile: 'qux', force: true };
  const result = normalizeLoadOptions(options);
  assert.deepStrictEqual(result, {
    engine: 'foo',
    model: 'bar',
    ctx: 'baz',
    profile: 'qux',
    force: true,
    candidates: 3,
    dryRun: false
  });
});

test('omitted profile remains omitted', () => {
  const result = normalizeLoadOptions();
  assert.strictEqual('profile' in result, false);
});
test('non-boolean dryRun is rejected', () => {
  const values = ['true', 1, null];
  for (const val of values) {
    assert.throws(
      () => normalizeLoadOptions({ dryRun: val }),
      { code: 'errors.invalidLoadOption' }
    );
  }
});

test('non-boolean confirm is rejected', () => {
  const values = ['yes', 0, null];
  for (const val of values) {
    assert.throws(
      () => normalizeLoadOptions({ confirm: val }),
      { code: 'errors.invalidLoadOption' }
    );
  }
});

test('explicit undefined confirm is removed', () => {
  assert.strictEqual(
    false,
    'confirm' in normalizeLoadOptions({ confirm: undefined })
  );
});
