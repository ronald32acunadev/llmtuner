import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatCommand } from '../src/cli/commands/chat.js';

const OPTIONS = { lang: 'en', theme: 'dark' };

function localSettings() {
  return {
    activeServerId: 'local',
    servers: [{ id: 'local', name: 'Local', url: 'http://127.0.0.1' }],
  };
}

function remoteSettings() {
  return {
    activeServerId: 'r1',
    servers: [
      { id: 'local', name: 'Local', url: 'http://127.0.0.1' },
      { id: 'r1', name: 'Remote', url: 'http://remote:7860', token: 'secret-token' },
    ],
  };
}

function assistantReply() {
  return { message: { role: 'assistant', content: 'reply' } };
}

// Queue of explicit answers. Throws when empty so a test can never hang.
function scripted(name, answers) {
  const queue = [...answers];
  const calls = [];
  const fn = async (arg) => {
    calls.push(arg);
    if (queue.length === 0) throw new Error(`${name} has no scripted answer left`);
    return queue.shift();
  };
  return { fn, calls };
}

// Like scripted, but checks that each answer is one of the offered choices.
function scriptedSelect(answers) {
  const queue = [...answers];
  const calls = [];
  const fn = async (options) => {
    calls.push(options);
    if (queue.length === 0) throw new Error('selectPrompt has no scripted answer left');
    const value = queue.shift();
    const values = (options?.choices ?? []).map((choice) => choice.value);
    assert.ok(values.includes(value), `expected ${value} among choices [${values.map(String).join(', ')}]`);
    return value;
  };
  return { fn, calls };
}

function fakeTuner({ models = [], fail = null, mutate = null } = {}) {
  const chatCalls = [];
  return {
    chatCalls,
    async listModels() {
      return models;
    },
    async chat(model, messages) {
      chatCalls.push({ model, messages: structuredClone(messages) });
      if (mutate) mutate(messages);
      if (fail) throw fail;
      return assistantReply();
    },
  };
}

function fakeClient({ models = [], fail = null } = {}) {
  const chatCalls = [];
  const listedEngines = [];
  return {
    chatCalls,
    listedEngines,
    async listModels(engine) {
      listedEngines.push(engine);
      return models;
    },
    async chat(payload) {
      chatCalls.push(structuredClone(payload));
      if (fail) throw fail;
      return assistantReply();
    },
  };
}

function makeDeps({
  settings = localSettings(),
  tuner = fakeTuner(),
  client = fakeClient(),
  inputs = [],
  selections = [],
  isInteractive = false,
} = {}) {
  const logs = [];
  const created = { tuner: [], client: [] };
  const counters = { readSettings: 0 };
  const input = scripted('inputPrompt', inputs);
  const select = scriptedSelect(selections);
  const deps = {
    readSettings: async () => {
      counters.readSettings += 1;
      return settings;
    },
    createTuner: (engine) => {
      created.tuner.push(engine);
      return tuner;
    },
    createClient: (server) => {
      created.client.push(server);
      return client;
    },
    inputPrompt: input.fn,
    selectPrompt: select.fn,
    log: (...args) => {
      logs.push(args.join(' '));
    },
    isInteractive,
  };
  return { deps, logs, created, counters, input, select, tuner, client };
}

test('scripted local chat sends one prompt, logs the reply and returns the raw response', async () => {
  const tuner = fakeTuner();
  const env = makeDeps({ tuner });

  const result = await chatCommand({ engine: 'lmstudio', model: 'qwen', prompt: 'hi' }, OPTIONS, env.deps);

  assert.deepEqual(tuner.chatCalls, [{ model: 'qwen', messages: [{ role: 'user', content: 'hi' }] }]);
  assert.deepEqual(env.logs, ['reply']);
  assert.deepEqual(result, assistantReply());
  assert.deepEqual(env.created.tuner, ['lmstudio']);
  assert.deepEqual(env.created.client, []);
});

test('scripted local chat with json logs the whole response as one JSON line', async () => {
  const tuner = fakeTuner();
  const env = makeDeps({ tuner });

  const result = await chatCommand(
    { engine: 'lmstudio', model: 'qwen', prompt: 'hi', json: true },
    OPTIONS,
    env.deps,
  );

  assert.equal(env.logs.length, 1);
  assert.deepEqual(JSON.parse(env.logs[0]), result);
  assert.deepEqual(result, assistantReply());
});

test('scripted remote chat uses the active remote server and never the local tuner', async () => {
  const client = fakeClient();
  const env = makeDeps({ settings: remoteSettings(), client });

  const result = await chatCommand({ engine: 'ollama', model: 'llama3', prompt: 'hi' }, OPTIONS, env.deps);

  assert.deepEqual(env.created.client, [
    { id: 'r1', name: 'Remote', url: 'http://remote:7860', token: 'secret-token' },
  ]);
  assert.deepEqual(client.chatCalls, [
    { engine: 'ollama', model: 'llama3', messages: [{ role: 'user', content: 'hi' }] },
  ]);
  assert.deepEqual(env.created.tuner, []);
  assert.deepEqual(result, assistantReply());
  assert.deepEqual(env.logs, ['reply']);
  assert.equal(env.logs.some((line) => line.includes('secret-token')), false);
});

test('noninteractive run with an incomplete argument set rejects before reading settings', async () => {
  const cases = [
    { name: 'no engine', args: { model: 'm', prompt: 'hi' } },
    { name: 'no model', args: { engine: 'lmstudio', prompt: 'hi' } },
    { name: 'no prompt', args: { engine: 'lmstudio', model: 'm' } },
  ];

  for (const { name, args } of cases) {
    const env = makeDeps({ isInteractive: false });
    await assert.rejects(() => chatCommand(args, OPTIONS, env.deps), Error, name);
    assert.equal(env.counters.readSettings, 0, `${name}: readSettings must not run`);
  }
});

test('unsupported engine rejects without creating a tuner or making a chat call', async () => {
  const env = makeDeps({ tuner: fakeTuner() });

  await assert.rejects(
    () => chatCommand({ engine: 'openai', model: 'm', prompt: 'hi' }, OPTIONS, env.deps),
    Error,
  );

  assert.deepEqual(env.created.tuner, []);
  assert.deepEqual(env.created.client, []);
  assert.deepEqual(env.tuner.chatCalls, []);
});

test('interactive loop accumulates history, skips blank input and ends on /exit', async () => {
  // The fake mutates the array it receives after recording it. History must not be affected.
  const tuner = fakeTuner({
    mutate: (messages) => {
      messages.push({ role: 'user', content: 'MUTATED' });
    },
  });
  const env = makeDeps({
    tuner,
    isInteractive: true,
    inputs: ['one', '   ', 'two', '/exit'],
  });

  await chatCommand({ engine: 'lmstudio', model: 'm' }, OPTIONS, env.deps);

  assert.deepEqual(tuner.chatCalls, [
    { model: 'm', messages: [{ role: 'user', content: 'one' }] },
    {
      model: 'm',
      messages: [
        { role: 'user', content: 'one' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'two' },
      ],
    },
  ]);
  assert.deepEqual(env.logs, ['reply', 'reply']);
  assert.equal(env.input.calls.length, 4);
});

test('a failing chat call rethrows the original error and makes no further chat call', async () => {
  const boom = new Error('engine unreachable');
  const tuner = fakeTuner({ fail: boom });
  const env = makeDeps({
    tuner,
    isInteractive: true,
    inputs: ['hello', 'again', '/exit'],
  });

  await assert.rejects(
    () => chatCommand({ engine: 'lmstudio', model: 'm' }, OPTIONS, env.deps),
    (err) => err === boom,
  );

  assert.equal(tuner.chatCalls.length, 1);
});

test('guided local selection picks engine then model from the tuner model list', async () => {
  const tuner = fakeTuner({
    models: [{ key: 'model-a', name: 'Model A' }, { id: 'model-b' }],
  });
  const env = makeDeps({
    tuner,
    isInteractive: true,
    selections: ['lmstudio', 'model-a'],
    inputs: ['hi', '/exit'],
  });

  await chatCommand({}, OPTIONS, env.deps);

  assert.equal(env.select.calls.length, 2);
  assert.deepEqual(env.select.calls[1].choices.map((choice) => choice.value).filter((value) => typeof value === 'string'), ['model-a', 'model-b']);
  assert.deepEqual(env.created.tuner, ['lmstudio']);
  assert.equal(tuner.chatCalls.length, 1);
  assert.equal(tuner.chatCalls[0].model, 'model-a');
});

test('guided remote selection reads models from the { models } response form', async () => {
  const client = fakeClient({ models: { models: [{ id: 'llama-remote' }] } });
  const env = makeDeps({
    settings: remoteSettings(),
    client,
    isInteractive: true,
    selections: ['ollama', 'llama-remote'],
    inputs: ['hi', '/exit'],
  });

  await chatCommand({}, OPTIONS, env.deps);

  assert.equal(env.select.calls.length, 2);
  assert.deepEqual(env.select.calls[1].choices.map((choice) => choice.value).filter((value) => typeof value === 'string'), ['llama-remote']);
  assert.deepEqual(client.listedEngines, ['ollama']);
  assert.deepEqual(client.chatCalls, [
    { engine: 'ollama', model: 'llama-remote', messages: [{ role: 'user', content: 'hi' }] },
  ]);
  assert.deepEqual(env.created.tuner, []);
});

test('guided selection with an empty model list rejects without any chat call', async () => {
  const tuner = fakeTuner({ models: [] });
  const env = makeDeps({
    tuner,
    isInteractive: true,
    selections: ['lmstudio'],
  });

  await assert.rejects(() => chatCommand({}, OPTIONS, env.deps), Error);

  assert.deepEqual(tuner.chatCalls, []);
});
