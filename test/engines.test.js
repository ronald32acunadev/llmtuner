import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.LLM_TUNER_CONFIG_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-engines-'));

const FAMILY = 'qwen/qwen2.5-coder-14b';

const { lmstudio, lmsVariants } = await import('../src/core/engines/lmstudio.js');

test('lmsVariants lists every variant and marks the selected one', () => {
  const entry = {
    type: 'llm',
    format: 'gguf',
    modelKey: FAMILY,
    sizeBytes: 15700000000,
    quantization: { name: 'Q8_0' },
    variants: [`${FAMILY}@q4_k_m`, `${FAMILY}@q8_0`],
    selectedVariant: `${FAMILY}@q8_0`
  };
  const expected = [
    { key: `${FAMILY}@q4_k_m`, quant: 'Q4_K_M', selected: false },
    { key: `${FAMILY}@q8_0`, quant: 'Q8_0', selected: true }
  ];
  assert.deepEqual(lmsVariants(entry), expected);
});

test('lmsVariants returns a single selected variant', () => {
  const entry = {
    modelKey: FAMILY,
    variants: [`${FAMILY}@q4_k_m`],
    selectedVariant: `${FAMILY}@q4_k_m`
  };
  const expected = [{ key: `${FAMILY}@q4_k_m`, quant: 'Q4_K_M', selected: true }];
  assert.deepEqual(lmsVariants(entry), expected);
});

test('lmsVariants falls back to the entry itself when there is no variants field', () => {
  assert.deepEqual(lmsVariants({ modelKey: 'local/model.gguf', quantization: { name: 'Q5_K_M' } }), [{ key: 'local/model.gguf', quant: 'Q5_K_M', selected: true }]);
  assert.deepEqual(lmsVariants({ path: 'local/other.gguf', variants: [] }), [{ key: 'local/other.gguf', quant: null, selected: true }]);
});

test('lmsVariants selects the first variant when selectedVariant matches none', () => {
  const entry = {
    modelKey: FAMILY,
    variants: [`${FAMILY}@q4_k_m`, `${FAMILY}@q8_0`],
    selectedVariant: `${FAMILY}@q6_k`
  };
  const expected = [
    { key: `${FAMILY}@q4_k_m`, quant: 'Q4_K_M', selected: true },
    { key: `${FAMILY}@q8_0`, quant: 'Q8_0', selected: false }
  ];
  assert.deepEqual(lmsVariants(entry), expected);
});

test('lmstudio does not select variants by itself', () => {
  assert.equal(lmstudio.capabilities.variantSelect, false);
});

// `lms ls --json` fixture: a family with three variants (one with no file) and a model missing from the index.
const LMS_LIST = [
  { type: 'llm', format: 'gguf', modelKey: FAMILY, displayName: 'Qwen2.5 Coder 14B', sizeBytes: 25, quantization: { name: 'Q8_0' }, variants: [`${FAMILY}@q4_k_m`, `${FAMILY}@q8_0`, `${FAMILY}@q2_k`], selectedVariant: `${FAMILY}@q8_0` },
  { type: 'llm', format: 'gguf', modelKey: 'ghost/model', displayName: 'Ghost', sizeBytes: 777, quantization: { name: 'Q4_K_M' } },
];
const LMS_SCRIPT = `#!${process.execPath}\nconst a = process.argv.slice(2);\nif (a[0] === 'ls' && a[1] === '--json') process.stdout.write(require('fs').readFileSync(__dirname + '/ls.json', 'utf8'));\nelse process.exit(1);\n`;

/** Build a fake LM Studio home: model index, two dummy GGUF files and a fake `lms` binary that prints `list`. */
async function fakeLmsHome(list = LMS_LIST) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-lms-'));
  const dir = path.join(home, 'store');
  for (const p of [dir, path.join(home, '.internal')]) await fs.mkdir(p, { recursive: true });
  const repo = 'lmstudio-community/Qwen2.5-Coder-14B-Instruct-GGUF';
  const names = { q4_k_m: 'Qwen2.5-Coder-14B-Instruct-Q4_K_M.gguf', q8_0: 'Qwen2.5-Coder-14B-Instruct-Q8_0.gguf' };
  await fs.writeFile(path.join(dir, names.q4_k_m), 'x'.repeat(10));
  await fs.writeFile(path.join(dir, names.q8_0), 'x'.repeat(25));
  const models = Object.entries(names).flatMap(([q, name]) => [
    {
      indexedModelIdentifier: `${FAMILY}@${repo}/${name}`,
      defaultIdentifier: `${FAMILY}@${q}`,
      virtual: {
        baseChain: [FAMILY, `${repo}/${name}`],
        concreteModelIndexedModelIdentifier: `${repo}/${name}`
      }
    },
    {
      indexedModelIdentifier: `${repo}/${name}`,
      defaultIdentifier: name.replace(/\.gguf$/, '').toLowerCase(),
      containingDirAbsolutePath: dir
    }
  ]);
  await fs.writeFile(path.join(home, '.internal', 'model-index-cache.json'), JSON.stringify({ models }));
  await fs.writeFile(path.join(home, 'ls.json'), JSON.stringify(list));
  const bin = path.join(home, 'lms');
  await fs.writeFile(bin, LMS_SCRIPT, { mode: 0o755 });
  return { home, bin, files: { q4: path.join(dir, names.q4_k_m), q8: path.join(dir, names.q8_0) } };
}

test('lmstudio listVariants resolves each variant file and size from the model index', { skip: process.platform === 'win32' }, async () => {
  const { home, bin, files } = await fakeLmsHome();
  const ctx = { detection: { home, bin } };
  try {
    assert.deepEqual(await lmstudio.listVariants(ctx, FAMILY), [
      { key: `${FAMILY}@q4_k_m`, quant: 'Q4_K_M', sizeBytes: 10, selected: false, file: files.q4 },
      { key: `${FAMILY}@q8_0`, quant: 'Q8_0', sizeBytes: 25, selected: true, file: files.q8 }
    ]);
    assert.deepEqual(await lmstudio.listVariants(ctx, 'ghost/model'), [
      { key: 'ghost/model', quant: 'Q4_K_M', sizeBytes: 777, selected: true, file: null }
    ]);
    assert.deepEqual(await lmstudio.listVariants(ctx, 'unknown/model'), []);
    assert.deepEqual(await lmstudio.listVariants({ detection: { home, bin: null } }, FAMILY), []);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test('lmsVariants reports no quant for a variant id without @', () => {
  const entry = {
    modelKey: FAMILY,
    variants: ['local/plain-model', `${FAMILY}@q8_0`],
    selectedVariant: 'local/plain-model'
  };
  assert.deepEqual(lmsVariants(entry), [
    { key: 'local/plain-model', quant: null, selected: true },
    { key: `${FAMILY}@q8_0`, quant: 'Q8_0', selected: false }
  ]);
});

test('lmstudio listVariants returns nothing when lms prints JSON that is not a list of models', { skip: process.platform === 'win32' }, async () => {
  for (const list of [{}, null, [null], [null, 7, 'x']]) {
    const { home, bin } = await fakeLmsHome(list);
    try {
      assert.deepEqual(
        await lmstudio.listVariants({ detection: { home, bin } }, FAMILY),
        [],
        JSON.stringify(list)
      );
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  }
});

const TAGS = [
  { name: 'qwen2.5-coder:14b', size: 8988124298, details: { family: 'qwen2', parameter_size: '14.8B', quantization_level: 'Q4_K_M' } },
  { name: 'qwen2.5-coder:14b-q8_0', size: 15700000000, details: { family: 'qwen2', parameter_size: '14.8B', quantization_level: 'Q8_0' } },
  { name: 'qwen2.5-coder:32b', size: 19851349856, details: { family: 'qwen2', parameter_size: '32.8B', quantization_level: 'Q4_K_M' } },
  { name: 'qwen2.5-coder:14b-tuned-16k', size: 8988124298, details: { family: 'qwen2', parameter_size: '14.8B', quantization_level: 'Q4_K_M' } },
  { name: 'llama3.2:latest', size: 2019393189, details: { family: 'llama', quantization_level: 'Q4_K_M' } },
  { name: 'llama3.2:1b', size: 1321098329 },
];
const Q4 = { key: 'qwen2.5-coder:14b', quant: 'Q4_K_M', sizeBytes: 8988124298 };
const Q8 = { key: 'qwen2.5-coder:14b-q8_0', quant: 'Q8_0', sizeBytes: 15700000000 };

// What the mock answers on /api/tags; tests swap it to simulate failures.
const TAGS_OK = { status: 200, body: { models: TAGS } };
let tagsReply = TAGS_OK;

const hits = [];
const mock = http.createServer((req, res) => {
  hits.push(req.url);
  if (req.url === '/api/version') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ version: '0.0.0-test' }));
  } else if (req.url === '/api/tags') {
    res.writeHead(tagsReply.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(tagsReply.body));
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  }
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const mockUrl = `http://127.0.0.1:${mock.address().port}`;
const prevHost = process.env.OLLAMA_HOST;
process.env.OLLAMA_HOST = mockUrl;
const { ollama, ollamaVariants, tagStem } = await import('../src/core/engines/ollama.js');

after(() => {
  mock.closeAllConnections();
  mock.close();
  if (prevHost === undefined) {
    delete process.env.OLLAMA_HOST;
  } else {
    process.env.OLLAMA_HOST = prevHost;
  }
});

test('ollamaVariants returns the tags of one model and selects the requested one', () => {
  assert.deepEqual(ollamaVariants(TAGS, 'qwen2.5-coder:14b'), [{ ...Q4, selected: true }, { ...Q8, selected: false }]);
  assert.deepEqual(ollamaVariants(TAGS, 'qwen2.5-coder:14b-q8_0'), [{ ...Q4, selected: false }, { ...Q8, selected: true }]);
});

test('ollamaVariants excludes a different parameter size with the same base name', () => {
  assert.deepEqual(ollamaVariants(TAGS, 'qwen2.5-coder:14b').map((v) => v.key), ['qwen2.5-coder:14b', 'qwen2.5-coder:14b-q8_0']);
  assert.deepEqual(ollamaVariants(TAGS, 'qwen2.5-coder:32b'), [{ key: 'qwen2.5-coder:32b', quant: 'Q4_K_M', sizeBytes: 19851349856, selected: true }]);
});

test('ollamaVariants never reports a tuned copy as a variant', () => {
  const models = TAGS.filter((m) => m.name.startsWith('qwen2.5-coder:14b'));
  assert.equal(ollamaVariants(models, 'qwen2.5-coder:14b').some((v) => v.key.includes('-tuned-')), false);
  assert.equal(ollamaVariants(models, 'qwen2.5-coder:14b').length, 2);
});

test('ollamaVariants returns nothing for an unknown model', () => {
  assert.deepEqual(ollamaVariants(TAGS, 'mistral:7b'), []);
  assert.deepEqual(ollamaVariants([], 'qwen2.5-coder:14b'), []);
});

test('ollamaVariants returns only the model itself when it has no parameter size', () => {
  assert.deepEqual(ollamaVariants(TAGS, 'llama3.2:latest'), [{ key: 'llama3.2:latest', quant: 'Q4_K_M', sizeBytes: 2019393189, selected: true }]);
  assert.deepEqual(ollamaVariants(TAGS, 'llama3.2:1b'), [{ key: 'llama3.2:1b', quant: null, sizeBytes: 1321098329, selected: true }]);
});

test('ollama listVariants reads the tags from the server', async () => {
  hits.length = 0;
  const ctx = { detection: { apiUrl: mockUrl, bin: null } };
  const variants = await ollama.listVariants(ctx, 'qwen2.5-coder:14b-q8_0');
  assert.deepEqual(variants, [{ ...Q4, selected: false }, { ...Q8, selected: true }]);
  // Only the tags endpoint matters here; how the engine probes the server first is its own business.
  assert.ok(hits.includes('/api/tags'));
  assert.deepEqual(await ollama.listVariants(ctx, 'mistral:7b'), []);
});

test('ollama listVariants returns nothing when the tags request fails', async () => {
  const ctx = { detection: { apiUrl: mockUrl, bin: null } };
  const replies = [
    { status: 500, body: { error: 'internal error' } },
    { status: 200, body: {} },
    { status: 200, body: { models: null } }
  ];

  try {
    for (const reply of replies) {
      tagsReply = reply;
      const result = await ollama.listVariants(ctx, 'qwen2.5-coder:14b');
      assert.deepEqual(result, [], JSON.stringify(reply));
    }
  } finally {
    tagsReply = TAGS_OK;
  }
});

/** Build an /api/tags entry of an 8B llama model. */
const tagEntry = (name, quant, extra = {}) => ({ name, size: 1000, details: { family: 'llama', parameter_size: '8.0B', quantization_level: quant }, ...extra });

test('tagStem strips the quantization level from the tag', () => {
  assert.equal(tagStem('qwen2.5-coder:14b-q8_0', 'Q8_0'), '14b');
  assert.equal(tagStem('qwen2.5-coder:14b', 'Q4_K_M'), '14b');
  assert.equal(tagStem('llama3:8b-instruct-q4_K_M', 'Q4_K_M'), '8b-instruct');
  assert.equal(tagStem('llama3:8b-text-q4_K_M', 'Q4_K_M'), '8b-text');
  assert.equal(tagStem('llama3', 'Q4_K_M'), 'latest');
  assert.equal(tagStem('llama3:8B-Instruct', null), '8b-instruct');
  // Only a whole dash-separated segment is the quantization.
  assert.equal(tagStem('llama3:8b-q4_K_M', 'Q4_K'), '8b-q4_k_m');
});

test('ollamaVariants does not group different models of the same size', () => {
  const models = [tagEntry('llama3:8b-instruct-q4_K_M', 'Q4_K_M'), tagEntry('llama3:8b-text-q4_K_M', 'Q4_K_M'), tagEntry('llama3:8b-instruct-q8_0', 'Q8_0'), { name: 'llama3:8b-instruct-q5_K_M', size: 1000, details: { family: 'mistral', parameter_size: '8.0B', quantization_level: 'Q5_K_M' } }];
  const keys = (key) => ollamaVariants(models, key).map((v) => v.key);
  assert.deepEqual(keys('llama3:8b-instruct-q4_K_M'), ['llama3:8b-instruct-q4_K_M', 'llama3:8b-instruct-q8_0']);
  assert.deepEqual(keys('llama3:8b-text-q4_K_M'), ['llama3:8b-text-q4_K_M']);
  // Same name stem and size, but another family.
  assert.deepEqual(keys('llama3:8b-instruct-q5_K_M'), ['llama3:8b-instruct-q5_K_M']);
});

test('ollamaVariants does not group a default tag with a named flavour', () => {
  const models = [tagEntry('llama3:8b', 'Q4_K_M'), tagEntry('llama3:8b-instruct-q8_0', 'Q8_0')];
  assert.deepEqual(ollamaVariants(models, 'llama3:8b'), [{ key: 'llama3:8b', quant: 'Q4_K_M', sizeBytes: 1000, selected: true }]);
  assert.deepEqual(ollamaVariants(models, 'llama3:8b-instruct-q8_0'), [{ key: 'llama3:8b-instruct-q8_0', quant: 'Q8_0', sizeBytes: 1000, selected: true }]);
});

test('ollamaVariants lists alias tags with the same digest once', () => {
  const models = [tagEntry('llama3:8b', 'Q4_K_M', { digest: 'aaa' }), tagEntry('llama3:8b-q4_K_M', 'Q4_K_M', { digest: 'aaa' }), tagEntry('llama3:8b-q8_0', 'Q8_0', { digest: 'bbb' })];
  // The requested key wins over its alias.
  assert.deepEqual(ollamaVariants(models, 'llama3:8b-q4_K_M'), [{ key: 'llama3:8b-q4_K_M', quant: 'Q4_K_M', sizeBytes: 1000, selected: true }, { key: 'llama3:8b-q8_0', quant: 'Q8_0', sizeBytes: 1000, selected: false }]);
  assert.deepEqual(ollamaVariants(models, 'llama3:8b').map((v) => v.key), ['llama3:8b', 'llama3:8b-q8_0']);
  // Between two aliases of another variant the first one listed is kept.
  assert.deepEqual(ollamaVariants(models, 'llama3:8b-q8_0'), [{ key: 'llama3:8b', quant: 'Q4_K_M', sizeBytes: 1000, selected: false }, { key: 'llama3:8b-q8_0', quant: 'Q8_0', sizeBytes: 1000, selected: true }]);
  // An empty digest identifies nothing.
  const blank = [tagEntry('llama3:8b', 'Q4_K_M', { digest: '' }), tagEntry('llama3:8b-q4_K_M', 'Q4_K_M', { digest: '' })];
  assert.equal(ollamaVariants(blank, 'llama3:8b').length, 2);
});

test('ollamaVariants ignores entries without a string name', () => {
  const models = [{ size: 5 }, null, { name: 7 }, tagEntry('llama3:8b', 'Q4_K_M'), tagEntry('llama3:8b-q8_0', 'Q8_0')];
  assert.deepEqual(ollamaVariants(models, 'llama3:8b').map((v) => v.key), ['llama3:8b', 'llama3:8b-q8_0']);
  assert.deepEqual(ollamaVariants(models, 'mistral:7b'), []);
});

test('ollamaVariants returns nothing for a tuned copy', () => {
  // A tuned copy is not a base model: callers must pass the base key.
  assert.deepEqual(ollamaVariants(TAGS, 'qwen2.5-coder:14b-tuned-16k'), []);
  assert.deepEqual(ollamaVariants(TAGS, 'qwen2.5-coder:14b').map((v) => v.key), ['qwen2.5-coder:14b', 'qwen2.5-coder:14b-q8_0']);
});

test('ollama selects variants by itself', () => {
  assert.equal(ollama.capabilities.variantSelect, true);
});
