import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { input as inquirerInput, password as inquirerPassword } from '@inquirer/prompts';
import { serversCommand } from '../src/cli/commands/servers.js';
import { settingsCommand } from '../src/cli/commands/settings.js';
import { NAV_BACK } from '../src/cli/nav.js';

function harness({ actions, answers = [], settings = null, state = { ok: true }, confirm = true } = {}) {
  let current = settings || {
    servers: [{ id: 'local', name: 'Local Machine', url: 'http://127.0.0.1:7860', token: null }],
    activeServerId: 'local',
  };
  const logs = [];
  const writes = [];
  const calls = [];
  const next = (queue) => async (prompt) => {
    calls.push(prompt.message);
    const value = queue.shift();
    return typeof value === 'function' ? value(prompt) : value;
  };
  return {
    logs, writes, calls,
    deps: {
      readSettings: async () => structuredClone(current),
      writeSettings: async (patch) => {
        writes.push(structuredClone(patch));
        current = { ...current, ...patch };
        return current;
      },
      selectPrompt: next(actions),
      inputPrompt: next(answers),
      passwordPrompt: next(answers),
      confirmPrompt: async () => confirm,
      createClient: () => ({ getState: async () => state }),
      log: (...values) => logs.push(values.join(' ')),
      error: (...values) => logs.push(values.join(' ')),
    },
    current: () => current,
  };
}

test('serversCommand saves a masked remote connection without connecting or displaying its token', async () => {
  const h = harness({ actions: ['add', NAV_BACK], answers: ['Lab PC', 'http://lab.example:7860/', 'secret-token'] });
  let connections = 0;
  h.deps.createClient = () => { connections++; return { getState: async () => ({}) }; };

  await serversCommand({}, { lang: 'en', theme: 'system' }, h.deps);

  assert.equal(h.current().servers.length, 2);
  assert.equal(h.current().servers[1].name, 'Lab PC');
  assert.equal(h.current().servers[1].url, 'http://lab.example:7860');
  assert.equal(h.current().servers[1].token, 'secret-token');
  assert.equal(connections, 0);
  assert.doesNotMatch(h.logs.join(' '), /secret-token/);
  assert.match(h.logs.join(' '), /HTTP does not encrypt/i);
});

test('serversCommand rejects blank names and URLs with embedded credentials without saving', async () => {
  const h = harness({ actions: ['add', 'add', NAV_BACK], answers: ['   ', 'Lab', 'https://user:pass@example.test'] });

  await serversCommand({}, { lang: 'en', theme: 'system' }, h.deps);

  assert.equal(h.writes.length, 0);
  assert.match(h.logs.join(' '), /name|required|URL|http|credential/i);
});

test('serversCommand explicitly tests and selects a saved server while keeping ordinary output secret-free', async () => {
  const server = { id: 'lab', name: 'Lab', url: 'http://lab.test:7860', token: 'secret-token' };
  const h = harness({
    settings: { servers: [{ id: 'local', name: 'Local Machine', url: 'http://127.0.0.1:7860', token: null }, server], activeServerId: 'local' },
    actions: ['test:lab', 'select:lab', NAV_BACK],
    state: { hw: { cpu: { brand: 'Lab CPU' } } },
  });
  let tested = 0;
  h.deps.createClient = () => ({ getState: async () => { tested++; return { hw: { cpu: { brand: 'Lab CPU' } } }; } });

  await serversCommand({}, { lang: 'en', theme: 'system' }, h.deps);

  assert.equal(tested, 1);
  assert.equal(h.current().activeServerId, 'lab');
  assert.doesNotMatch(h.logs.join(' '), /secret-token/);
});

test('serversCommand redacts saved tokens when a failed connection error echoes the token', async () => {
  const h = harness({
    settings: { servers: [
      { id: 'local', name: 'Local Machine', url: 'http://127.0.0.1:7860', token: null },
      { id: 'lab', name: 'Lab', url: 'http://lab.test:7860', token: 'secret-token' },
    ], activeServerId: 'local' },
    actions: ['test:lab', NAV_BACK],
  });
  h.deps.createClient = () => ({ getState: async () => { throw new Error('Authorization failed for secret-token'); } });

  await serversCommand({}, { lang: 'en', theme: 'system' }, h.deps);

  assert.match(h.logs.join(' '), /Could not reach Lab/);
  assert.match(h.logs.join(' '), /\[redacted\]/);
  assert.doesNotMatch(h.logs.join(' '), /secret-token/);
});

test('serversCommand confirms removal and falls back to local when removing the active remote server', async () => {
  const h = harness({
    settings: { servers: [
      { id: 'local', name: 'Local Machine', url: 'http://127.0.0.1:7860', token: null },
      { id: 'lab', name: 'Lab', url: 'http://lab.test:7860', token: 'secret-token' },
    ], activeServerId: 'lab' },
    actions: ['remove:lab', NAV_BACK],
  });

  await serversCommand({}, { lang: 'en', theme: 'system' }, h.deps);

  assert.deepEqual(h.current().servers.map((server) => server.id), ['local']);
  assert.equal(h.current().activeServerId, 'local');
});

test('serversCommand protects the local server and Back navigation does not mutate settings', async () => {
  const h = harness({ actions: ['remove:local', NAV_BACK] });

  await serversCommand({}, { lang: 'en', theme: 'system' }, h.deps);

  assert.equal(h.writes.length, 0);
  assert.deepEqual(h.current().servers.map((server) => server.id), ['local']);
});

test('settingsCommand opens saved computer management without removing the explicit credential reveal action', async () => {
  const selections = ['serverManagement', 'exit'];
  let managed = 0;
  let choices;
  await settingsCommand({}, { lang: 'en', theme: 'system' }, {
    selectPrompt: async (prompt) => { choices = prompt.choices; return selections.shift(); },
    autostart: { status: async () => false },
    manageServers: async () => { managed++; },
  });

  assert.equal(managed, 1);
  assert.ok(choices.some((choice) => choice.value === 'serverManagement'));
  assert.ok(choices.some((choice) => choice.value === 'serverConnection'));
});

test('serversCommand accepts a valid URL through the actual Inquirer input validator', async () => {
  const h = harness({ actions: ['add', NAV_BACK] });
  let rendered = '';
  h.deps.inputPrompt = (config) => {
    if (config.message.includes('Name')) return Promise.resolve('Lab');
    const input = new PassThrough();
    const output = new PassThrough();
    output.on('data', (chunk) => { rendered += chunk.toString(); });
    const prompt = inquirerInput(config, { input, output });
    let settled = false;
    prompt.then(() => { settled = true; }, () => { settled = true; });
    setTimeout(() => input.write('http://lab.example:7860\r'), 10);
    setTimeout(() => { if (!settled) prompt.cancel(); }, 120);
    return prompt;
  };
  h.deps.passwordPrompt = async () => 'token';

  await serversCommand({}, { lang: 'en', theme: 'system' }, h.deps);

  assert.equal(h.writes.length, 1);
  assert.doesNotMatch(rendered, /Enter a valid HTTP/);
});

test('serversCommand does not treat Backspace as navigation while a real name input contains text', async () => {
  const h = harness({ actions: ['add', NAV_BACK] });
  const originalTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  let reachedUrl = false;
  h.deps.inputPrompt = (config) => {
    if (!config.message.includes('Name')) {
      reachedUrl = true;
      assert.equal(config.validate('http://lab.example:7860'), true);
      return Promise.resolve('http://lab.example:7860');
    }
    const input = new PassThrough();
    const output = new PassThrough();
    const prompt = inquirerInput(config, { input, output });
    setTimeout(() => {
      input.write('Lab');
      setTimeout(() => {
        process.stdin.emit('keypress', '\x7f', { name: 'backspace' });
        input.write('\x7fX\r');
      }, 30);
    }, 10);
    return prompt;
  };
  h.deps.passwordPrompt = async () => 'secret-token';
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });

  try {
    await serversCommand({}, { lang: 'en', theme: 'system' }, h.deps);
  } finally {
    if (originalTTY) Object.defineProperty(process.stdin, 'isTTY', originalTTY);
    else delete process.stdin.isTTY;
  }

  assert.equal(reachedUrl, true);
  assert.equal(h.writes.length, 1);
});

test('serversCommand does not treat Backspace as navigation while a real URL input contains text', async () => {
  const h = harness({ actions: ['add', NAV_BACK] });
  const originalTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  let urlPromptReached = false;
  h.deps.inputPrompt = (config) => {
    if (config.message.includes('Name')) return Promise.resolve('Lab');
    urlPromptReached = true;
    const input = new PassThrough();
    const output = new PassThrough();
    const prompt = inquirerInput(config, { input, output });
    setTimeout(() => {
      input.write('http://lab.example:7860');
      setTimeout(() => {
        process.stdin.emit('keypress', '\x7f', { name: 'backspace' });
        input.write('\r');
      }, 30);
    }, 10);
    return prompt;
  };
  h.deps.passwordPrompt = async () => 'secret-token';
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });

  try {
    await serversCommand({}, { lang: 'en', theme: 'system' }, h.deps);
  } finally {
    if (originalTTY) Object.defineProperty(process.stdin, 'isTTY', originalTTY);
    else delete process.stdin.isTTY;
  }

  assert.equal(urlPromptReached, true);
  assert.equal(h.writes.length, 1);
});

test('serversCommand ignores Backspace on a masked password and never renders the token', async () => {
  const h = harness({ actions: ['add', NAV_BACK] });
  const originalTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  let rendered = '';
  h.deps.inputPrompt = (config) => config.message.includes('Name') ? Promise.resolve('Lab') : Promise.resolve('http://lab.example:7860');
  h.deps.passwordPrompt = (config) => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.on('data', (chunk) => { rendered += chunk.toString(); });
    const prompt = inquirerPassword(config, { input, output });
    setTimeout(() => {
      input.write('secret-token');
      setTimeout(() => {
        process.stdin.emit('keypress', '\x7f', { name: 'backspace' });
        input.write('\x7fX\r');
      }, 30);
    }, 10);
    return prompt;
  };
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });

  try {
    await serversCommand({}, { lang: 'en', theme: 'system' }, h.deps);
  } finally {
    if (originalTTY) Object.defineProperty(process.stdin, 'isTTY', originalTTY);
    else delete process.stdin.isTTY;
  }

  assert.equal(h.writes.length, 1);
  assert.doesNotMatch(rendered + h.logs.join(' '), /secret-token/);
});

test('serversCommand preserves Escape cancellation while a real name input contains text', async () => {
  const h = harness({ actions: ['add', NAV_BACK] });
  const originalTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  let tokenPromptReached = false;
  h.deps.inputPrompt = (config) => {
    const input = new PassThrough();
    const output = new PassThrough();
    const prompt = inquirerInput(config, { input, output });
    setTimeout(() => {
      input.write('Lab');
      setTimeout(() => process.stdin.emit('keypress', '\x1b', { name: 'escape' }), 30);
    }, 10);
    return prompt;
  };
  h.deps.passwordPrompt = async () => { tokenPromptReached = true; return 'secret-token'; };
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });

  try {
    await serversCommand({}, { lang: 'en', theme: 'system' }, h.deps);
  } finally {
    if (originalTTY) Object.defineProperty(process.stdin, 'isTTY', originalTTY);
    else delete process.stdin.isTTY;
  }

  assert.equal(tokenPromptReached, false);
  assert.equal(h.writes.length, 0);
});

test('serversCommand cancels an add without saving when the name prompt is escaped', async () => {
  const h = harness({ actions: ['add', NAV_BACK] });
  h.deps.inputPrompt = async () => NAV_BACK;

  await serversCommand({}, { lang: 'en', theme: 'system' }, h.deps);

  assert.equal(h.writes.length, 0);
});

test('serversCommand reports a failed save without adding the remote connection', async () => {
  const h = harness({ actions: ['add', NAV_BACK], answers: ['Lab', 'http://lab.example:7860', 'token'] });
  h.deps.writeSettings = async () => { throw new Error('disk unavailable'); };

  await serversCommand({}, { lang: 'en', theme: 'system' }, h.deps);

  assert.equal(h.writes.length, 0);
  assert.match(h.logs.join(' '), /Could not save computer settings: disk unavailable/);
});

test('serversCommand leaves a saved target unchanged when removal is not confirmed', async () => {
  const h = harness({
    settings: { servers: [
      { id: 'local', name: 'Local Machine', url: 'http://127.0.0.1:7860', token: null },
      { id: 'lab', name: 'Lab', url: 'http://lab.test:7860', token: 'secret-token' },
    ], activeServerId: 'lab' },
    actions: ['remove:lab', NAV_BACK],
    confirm: false,
  });

  await serversCommand({}, { lang: 'en', theme: 'system' }, h.deps);

  assert.equal(h.writes.length, 0);
  assert.equal(h.current().servers.length, 2);
  assert.equal(h.current().activeServerId, 'lab');
});
