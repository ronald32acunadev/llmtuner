import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_BACK, isNavBack, backChoice, withNav } from '../src/cli/nav.js';
import { CancelPromptError } from '@inquirer/core';

test('isNavBack identifies NAV_BACK symbol', () => {
  assert.equal(isNavBack(NAV_BACK), true);
  assert.equal(isNavBack('other'), false);
  assert.equal(isNavBack(null), false);
  assert.equal(isNavBack(undefined), false);
});

test('backChoice creates formatted choice object', () => {
  const t = (k) => (k === 'common.back' ? 'Volver' : k);
  const c = { dim: (s) => `[dim]${s}[/dim]` };

  const choice = backChoice(t, c);
  assert.equal(choice.value, NAV_BACK);
  assert.match(choice.name, /Volver/);
  assert.match(choice.name, /Backspace/);
});

test('withNav returns result when prompt resolves normally', async () => {
  const result = await withNav(async () => 'test-value', { allowBack: true });
  assert.equal(result, 'test-value');
});

test('withNav returns NAV_BACK when prompt throws CancelPromptError', async () => {
  const result = await withNav(async () => {
    throw new CancelPromptError();
  }, { allowBack: true });
  assert.equal(result, NAV_BACK);
});

test('withNav propagates unexpected errors', async () => {
  await assert.rejects(
    () => withNav(async () => {
      throw new Error('boom');
    }, { allowBack: true }),
    /boom/
  );
});
