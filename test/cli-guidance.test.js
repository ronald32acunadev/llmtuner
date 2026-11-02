import { test } from 'node:test';
import assert from 'node:assert/strict';
import en from '../src/i18n/en.js';
import es from '../src/i18n/es.js';
import { helpCommand } from '../src/cli/commands/help.js';

test('English and Spanish CLI catalogs explain task-oriented destinations and commands', () => {
  for (const key of ['cli.serverManagement', 'cli.serversMenu', 'cli.serverRoleInfo', 'cli.serverHttpWarning', 'cli.noRemoteModels', 'cli.activeComputer']) {
    assert.ok(Object.hasOwn(en, key), `English is missing ${key}`);
    assert.ok(Object.hasOwn(es, key), `Spanish is missing ${key}`);
  }
  assert.match(en['cli.cmdServeDesc'], /this computer/i);
  assert.match(es['cli.cmdServeDesc'], /este equipo/i);
  assert.match(en['cli.cmdLoadDesc'], /active computer.*engine.*model/i);
  assert.match(es['cli.cmdLoadDesc'], /equipo activo.*motor.*modelo/i);
});

test('help retains existing command and flag guidance and explains remote computer responsibilities', async () => {
  const output = [];
  const previousLog = console.log;
  console.log = (...values) => output.push(values.join(' '));
  try {
    await helpCommand({}, { lang: 'en' });
  } finally {
    console.log = previousLog;
  }
  const text = output.join('\n');
  for (const command of ['/load', '/mcp', '/presets', '/settings', '--dry-run', '--json']) assert.ok(text.includes(command));
  assert.match(text, /another computer/i);
  assert.match(text, /HTTP does not encrypt the token/i);
});
