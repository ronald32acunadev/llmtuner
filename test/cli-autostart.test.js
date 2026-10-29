import assert from 'node:assert/strict';
import { test } from 'node:test';
import { settingsCommand } from '../src/cli/commands/settings.js';
import { NAV_BACK } from '../src/cli/nav.js';

test('CLI Settings enables login startup and returns without changing language or theme', async () => {
  const selections = ['serverAutostart', true, 'exit'];
  const prompts = [];
  const changes = [];
  const autostart = { status: async () => changes.at(-1) ?? false, setEnabled: async (enabled) => { changes.push(enabled); return enabled; } };
  const selectPrompt = async (config) => { prompts.push(config); return selections.shift() ?? 'exit'; };
  const originalLog = console.log;
  console.log = () => {};
  try {
    await settingsCommand({}, { lang: 'en', theme: 'system' }, { selectPrompt, autostart });
  } finally {
    console.log = originalLog;
  }
  assert.deepEqual(changes, [true]);
  assert.ok(prompts[0].choices.some((choice) => choice.value === 'serverAutostart'));
  assert.ok(prompts[0].choices.some((choice) => choice.value === 'lang'));
  assert.ok(prompts[0].choices.some((choice) => choice.value === 'theme'));
  assert.ok(prompts[1].choices.some((choice) => choice.value === true));
  assert.equal(prompts.length, 3);
});

test('CLI Settings disables startup and reports completion', async () => {
  const selections = ['serverAutostart', false, 'exit'];
  const changes = [];
  const messages = [];
  const originalLog = console.log;
  console.log = (message) => messages.push(message);
  try {
    await settingsCommand({}, { lang: 'en', theme: 'system' }, {
      selectPrompt: async () => selections.shift() ?? 'exit',
      autostart: { status: async () => true, setEnabled: async (enabled) => { changes.push(enabled); return enabled; } },
    });
  } finally {
    console.log = originalLog;
  }
  assert.deepEqual(changes, [false]);
  assert.match(messages[0], /disabled/i);
});

test('CLI Settings preserves cancel/back behavior for the startup submenu', async () => {
  const selections = ['serverAutostart', NAV_BACK, 'exit'];
  const changes = [];
  const autostart = { status: async () => false, setEnabled: async (enabled) => changes.push(enabled) };
  const originalLog = console.log;
  console.log = () => {};
  try {
    await settingsCommand({}, { lang: 'en', theme: 'system' }, { selectPrompt: async () => selections.shift() ?? 'exit', autostart });
  } finally {
    console.log = originalLog;
  }
  assert.deepEqual(changes, []);
});

test('CLI Settings does not report success when the requested startup state is not confirmed', async () => {
  const selections = ['serverAutostart', true, 'exit'];
  const messages = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (message) => messages.push(message);
  console.error = (message) => messages.push(message);
  try {
    await settingsCommand({}, { lang: 'en', theme: 'system' }, {
      selectPrompt: async () => selections.shift() ?? 'exit',
      autostart: { status: async () => false, setEnabled: async () => false },
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  assert.equal(messages.some((message) => /enabled/i.test(message)), false);
  assert.equal(messages.some((message) => /could not update automatic server startup/i.test(message)), true);
});
