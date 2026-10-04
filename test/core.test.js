import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readGguf, summarizeGguf } from '../src/core/gguf.js';
import { placeLayers, planCandidates, maxFullOffloadContext, kvTotalBytes } from '../src/core/estimator.js';
import { rankGpus } from '../src/core/hardware.js';
import { llamaServerArgs, llamaServerEnv } from '../src/core/llama-server.js';
import { ollama } from '../src/core/engines/ollama.js';
import { pickBest } from '../src/core/tuner.js';
import { makeCodePrompt } from '../src/core/benchmark.js';

const MiB = 1024 ** 2;

// Qwen2.5-Coder-32B Q4_K_M, numbers read from the real GGUF.
const qwen32 = {
  arch: 'qwen2', nLayers: 64, nEmbd: 5120, nHead: 40, nHeadKv: 8, keyLen: 128, valLen: 128, vocab: 152064,
  trainContext: 32768, layerBytes: Array(64).fill((17.48 * 1024 ** 3) / 64), layerExpertBytes: Array(64).fill(0),
  outputBytes: 609 * MiB, embdBytes: 417 * MiB, kvHeadsPerLayer: Array(64).fill(8), slidingWindow: null, swaLayers: [],
  nExperts: 0, nExpertsUsed: 0, isMoE: false,
};

// 2x RTX 5070 as seen by nvidia-smi with nothing loaded (GPU0 drives the display).
const hw = {
  cpu: { physicalCores: 8, threads: 16 },
  ramBandwidthGBps: 45,
  gpus: rankGpus([
    { index: 0, name: 'RTX 5070', totalBytes: 12227 * MiB, usedBytes: 896 * MiB, freeBytes: 10876 * MiB, pcieGBps: 2, displayAttached: true, bandwidthGBps: 672 },
    { index: 1, name: 'RTX 5070', totalBytes: 12227 * MiB, usedBytes: 14 * MiB, freeBytes: 11761 * MiB, pcieGBps: 15.8, displayAttached: false, bandwidthGBps: 672 },
  ]),
};

test('GPU ranking prefers the wide PCIe link without display', () => {
  assert.deepEqual(hw.gpus.map((g) => g.index), [1, 0]);
});

test('KV cache size matches llama.cpp allocation (q8_0, 32K = 4352 MiB)', () => {
  assert.equal(Math.round(kvTotalBytes(qwen32, 32768, 'q8_0') / MiB), 4352);
});

test('estimator reproduces measured fits on 2x RTX 5070', () => {
  // [ctx, kv, loaded fully on GPU in the real test]
  const measured = [[8192, 'q8_0', true], [16384, 'q8_0', true], [20480, 'q8_0', true], [24576, 'q8_0', false], [32768, 'q8_0', false], [32768, 'q4_0', true]];
  for (const [ctx, kvType, real] of measured) {
    assert.equal(placeLayers(qwen32, hw.gpus, { ctx, kvType }).fullOffload, real, `${ctx} ${kvType}`);
  }
  assert.equal(maxFullOffloadContext(qwen32, hw, 'q8_0'), 20480);
});

test('candidates put the verified full offload first and add optimistic probes', () => {
  const at16 = planCandidates(qwen32, hw, { ctx: 16384 });
  assert.equal(at16[0].id, 'q8_0-65');
  assert.equal(at16[0].threads, 4);
  const at24 = planCandidates(qwen32, hw, { ctx: 24576 });
  const probe = at24.find((c) => c.probe);
  assert.ok(probe && probe.kvType === 'q8_0' && probe.fullOffload);
  assert.equal(probe.tensorSplit.reduce((a, b) => a + b, 0), 64);
});

test('llama-server args put the priority GPU last (it gets the output layer)', () => {
  const c = planCandidates(qwen32, hw, { ctx: 16384 })[0];
  const args = llamaServerArgs('/m.gguf', c, 1234);
  const at = (f) => args[args.indexOf(f) + 1];
  assert.equal(at('--ctx-size'), '16384');
  assert.equal(at('--cache-type-k'), 'q8_0');
  assert.equal(at('--n-gpu-layers'), '999');
  assert.equal(at('--tensor-split'), [...c.tensorSplit].reverse().join(','));
  assert.equal(llamaServerEnv([], c).CUDA_VISIBLE_DEVICES, '0,1');
});

test('ollama modelfile and server env', () => {
  const c = planCandidates(qwen32, hw, { ctx: 16384 })[0];
  const mf = ollama.modelfile('qwen2.5-coder:32b', c);
  assert.match(mf, /^FROM qwen2.5-coder:32b/);
  assert.match(mf, /PARAMETER num_ctx 16384/);
  assert.match(mf, /PARAMETER num_gpu 999/);
  assert.equal(ollama.tunedName('qwen2.5-coder:32b', c), 'qwen2.5-coder:32b-tuned-16k');
  assert.deepEqual(ollama.serverEnv(c), { OLLAMA_FLASH_ATTENTION: '1', OLLAMA_KV_CACHE_TYPE: 'q8_0', OLLAMA_NUM_PARALLEL: '1', CUDA_DEVICE_ORDER: 'PCI_BUS_ID', CUDA_VISIBLE_DEVICES: '1,0' });
});

test('pickBest weighs deep-context speed and KV quality, skips failures', () => {
  const mk = (kvType, deep, ok = true) => ({ candidate: { kvType }, bench: { ok, short: { genTps: 25 }, deep: { genTps: deep } } });
  assert.equal(pickBest([mk('q4_0', 16.7), mk('q8_0', 22.2), mk('f16', 30, false)]).candidate.kvType, 'q8_0');
  assert.equal(pickBest([mk('q8_0', 1, false)]), null);
});

test('synthetic prompt is deterministic and sized', () => {
  const a = makeCodePrompt(1000), b = makeCodePrompt(1000);
  assert.equal(a, b);
  assert.ok(Math.abs(a.length - 3300) < 200);
});

test('GGUF reader parses metadata and tensor sizes', async () => {
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'gguf-')), 't.gguf');
  await fs.writeFile(file, buildGguf());
  const meta = summarizeGguf(await readGguf(file));
  assert.equal(meta.arch, 'llama');
  assert.equal(meta.nLayers, 2);
  assert.equal(meta.nHeadKv, 2);
  assert.equal(meta.keyLen, 64);
  assert.deepEqual(meta.layerBytes, [256 * 64 * 2 * 2, 256 * 64 * 2]); // f16 tensors
  assert.equal(meta.kvHeadsPerLayer.filter(Boolean).length, 1); // only layer 0 has attention
});

test('GGUF summary reports bits per weight', () => {
  const kv = { 'general.architecture': 'llama', 'llama.block_count': 2, 'llama.embedding_length': 256, 'llama.attention.head_count': 4 };
  assert.equal(summarizeGguf({ kv, tensors: [{ name: 'blk.0.attn_k.weight', dims: [256, 64], type: 1, bytes: 256 * 64 * 2 }, { name: 'blk.1.ffn_up.weight', dims: [256, 64], type: 1, bytes: 256 * 64 * 2 }], fileBytes: 0 }).bitsPerWeight, 16);
  assert.equal(summarizeGguf({ kv, tensors: [{ name: 'blk.0.ffn_up.weight', dims: [256, 3], type: 12, bytes: 432 }, { name: 'output.weight', dims: [100], type: 1, bytes: 200 }], fileBytes: 0 }).bitsPerWeight, 5.82);
  assert.equal(summarizeGguf({ kv, tensors: [], fileBytes: 0 }).bitsPerWeight, null);
});

// Minimal GGUF v3: 5 kv pairs, 3 tensors (two in layer 0 incl. attention, one in layer 1).
function buildGguf() {
  const parts = [];
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); parts.push(b); };
  const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); parts.push(b); };
  const str = (s) => { u64(Buffer.byteLength(s)); parts.push(Buffer.from(s)); };
  parts.push(Buffer.from('GGUF'));
  u32(3); u64(3); u64(5);
  str('general.architecture'); u32(8); str('llama');
  str('llama.block_count'); u32(4); u32(2);
  str('llama.embedding_length'); u32(4); u32(256);
  str('llama.attention.head_count'); u32(4); u32(4);
  str('llama.attention.head_count_kv'); u32(4); u32(2);
  const tensor = (name) => { str(name); u32(2); u64(256); u64(64); u32(1); u64(0); };
  tensor('blk.0.attn_k.weight'); tensor('blk.0.ffn_up.weight'); tensor('blk.1.ffn_up.weight');
  return Buffer.concat(parts);
}
