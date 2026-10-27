import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settingsCommand } from '../src/cli/commands/settings.js';

async function capture(fn) {
  const logs = [];
  const errors = [];
  const oldLog = console.log;
  const oldErr = console.error;
  console.log = (...args) => logs.push(args.join(' '));
  console.error = (...args) => errors.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = oldLog;
    console.error = oldErr;
  }
  return { logs, errors };
}

test('settingsCommand server token flow - successful read', async () => {
  const config = { host: '0.0.0.0', port: 8123, token: 'fixture-token-xyz' };
  const selections = ['serverConnection', 'exit'];
  let reads = 0, writes = 0;
  let firstChoices = null;

  const deps = {
    selectPrompt: async (promptConfig) => {
      firstChoices = promptConfig.choices;
      return selections.shift() ?? 'exit';
    },
    autostart: {
      status: async () => false,
      setEnabled: async () => { writes++; }
    },
    readConfig: async () => {
      reads++;
      return config;
    }
  };

  const { logs, errors } = await capture(async () => {
    await settingsCommand({}, { lang: 'en', theme: 'system' }, deps);
  });

  assert.equal(reads, 1);
  assert.equal(writes, 0);
  assert.equal(errors.length, 0);
  assert.ok(firstChoices?.some(c => c.value === 'serverConnection'));
  const joined = logs.join(' ');
  assert.ok(joined.includes('fixture-token-xyz'));
  assert.ok(joined.includes('8123'));
  assert.ok(joined.includes('LAN'));
  assert.doesNotMatch(joined, /http:\/\/0\.0\.0\.0/);
  assert.deepEqual(config, { host: '0.0.0.0', port: 8123, token: 'fixture-token-xyz' });
});

test('settingsCommand server token flow - immediate exit', async () => {
  const selections = ['exit'];
  let reads = 0, writes = 0;
  const deps = {
    selectPrompt: async () => selections.shift() ?? 'exit',
    autostart: {
      status: async () => false,
      setEnabled: async () => { writes++; }
    },
    readConfig: async () => {
      reads++;
      return { token: 'fixture-token' };
    }
  };

  const { logs } = await capture(async () => {
    await settingsCommand({}, { lang: 'en', theme: 'system' }, deps);
  });

  assert.equal(reads, 0);
  assert.equal(writes, 0);
  assert.doesNotMatch(logs.join(' '), /fixture-token/);
});

test('settingsCommand server token flow - null config', async () => {
  const selections = ['serverConnection', 'exit'];
  let writes = 0;
  const deps = {
    selectPrompt: async () => selections.shift() ?? 'exit',
    autostart: {
      status: async () => false,
      setEnabled: async () => { writes++; }
    },
    readConfig: async () => null
  };

  const { logs } = await capture(async () => {
    await settingsCommand({}, { lang: 'en', theme: 'system' }, deps);
  });

  assert.match(logs.join(' '), /no server configuration/i);
  assert.equal(writes, 0);
});
