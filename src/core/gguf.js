import fs from 'node:fs/promises';

// Minimal GGUF header reader: metadata key/values and tensor infos.
// Spec: https://github.com/ggml-org/ggml/blob/master/docs/gguf.md

const T = { UINT8: 0, INT8: 1, UINT16: 2, INT16: 3, UINT32: 4, INT32: 5, FLOAT32: 6, BOOL: 7, STRING: 8, ARRAY: 9, UINT64: 10, INT64: 11, FLOAT64: 12 };

// ggml tensor types -> [block size (elements), bytes per block]
const GGML_TYPE_SIZE = {
  0: [1, 4], 1: [1, 2], 2: [32, 18], 3: [32, 20], 6: [32, 22], 7: [32, 24], 8: [32, 34], 9: [32, 36],
  10: [256, 84], 11: [256, 110], 12: [256, 144], 13: [256, 176], 14: [256, 210], 15: [256, 292],
  16: [256, 66], 17: [256, 74], 18: [256, 98], 19: [256, 50], 20: [32, 18], 21: [256, 110], 22: [256, 82],
  23: [256, 136], 24: [1, 1], 25: [1, 2], 26: [1, 4], 27: [1, 8], 28: [1, 8], 29: [256, 56], 30: [1, 2],
  34: [256, 54], 35: [256, 66], 39: [32, 17],
};

class Reader {
  constructor(fh) { this.fh = fh; this.buf = Buffer.alloc(0); this.bufStart = 0; this.pos = 0; }
  async ensure(n) {
    const end = this.pos + n;
    if (this.pos >= this.bufStart && end <= this.bufStart + this.buf.length) return;
    const size = Math.max(n, 4 * 1024 * 1024);
    const buf = Buffer.alloc(size);
    const { bytesRead } = await this.fh.read(buf, 0, size, this.pos);
    if (bytesRead < n) throw new Error('GGUF: unexpected end of file');
    this.buf = buf.subarray(0, bytesRead);
    this.bufStart = this.pos;
  }
  async take(n) { await this.ensure(n); const o = this.pos - this.bufStart; this.pos += n; return this.buf.subarray(o, o + n); }
  async u32() { return (await this.take(4)).readUInt32LE(0); }
  async u64() { return Number((await this.take(8)).readBigUInt64LE(0)); }
  async str() { const n = await this.u64(); return (await this.take(n)).toString('utf8'); }
  async value(type, keepArrays) {
    switch (type) {
      case T.UINT8: return (await this.take(1)).readUInt8(0);
      case T.INT8: return (await this.take(1)).readInt8(0);
      case T.UINT16: return (await this.take(2)).readUInt16LE(0);
      case T.INT16: return (await this.take(2)).readInt16LE(0);
      case T.UINT32: return (await this.take(4)).readUInt32LE(0);
      case T.INT32: return (await this.take(4)).readInt32LE(0);
      case T.FLOAT32: return (await this.take(4)).readFloatLE(0);
      case T.BOOL: return (await this.take(1)).readUInt8(0) !== 0;
      case T.STRING: return this.str();
      case T.UINT64: return Number((await this.take(8)).readBigUInt64LE(0));
      case T.INT64: return Number((await this.take(8)).readBigInt64LE(0));
      case T.FLOAT64: return (await this.take(8)).readDoubleLE(0);
      case T.ARRAY: {
        const itemType = await this.u32();
        const n = await this.u64();
        // Large arrays (tokenizer vocab) are skipped; we only keep their length.
        if (!keepArrays || n > 4096) {
          for (let i = 0; i < n; i++) await this.value(itemType, false);
          return { length: n };
        }
        const out = [];
        for (let i = 0; i < n; i++) out.push(await this.value(itemType, false));
        return out;
      }
      default: throw new Error(`GGUF: unknown value type ${type}`);
    }
  }
}

export async function readGguf(file) {
  const fh = await fs.open(file, 'r');
  try {
    const stat = await fh.stat();
    const r = new Reader(fh);
    const magic = (await r.take(4)).toString('ascii');
    if (magic !== 'GGUF') throw new Error(`${file} is not a GGUF file`);
    const version = await r.u32();
    const nTensors = await r.u64();
    const nKv = await r.u64();
    const kv = {};
    for (let i = 0; i < nKv; i++) {
      const key = await r.str();
      const type = await r.u32();
      kv[key] = await r.value(type, true);
    }
    const tensors = [];
    for (let i = 0; i < nTensors; i++) {
      const name = await r.str();
      const nDims = await r.u32();
      const dims = [];
      for (let d = 0; d < nDims; d++) dims.push(await r.u64());
      const type = await r.u32();
      await r.u64(); // offset
      const elems = dims.reduce((a, b) => a * b, 1);
      const [bs, bb] = GGML_TYPE_SIZE[type] ?? [1, 2];
      tensors.push({ name, dims, type, bytes: Math.ceil(elems / bs) * bb });
    }
    return { version, kv, tensors, fileBytes: stat.size };
  } finally {
    await fh.close();
  }
}

const first = (v) => (Array.isArray(v) ? Math.max(...v) : v);

/**
 * Turn raw GGUF data into the numbers the estimator needs: per-layer weight
 * bytes, which layers have attention (KV cache), KV head dims, experts, vocab.
 */
export function summarizeGguf({ kv, tensors, fileBytes }) {
  const arch = kv['general.architecture'];
  const g = (k) => kv[`${arch}.${k}`];
  const nLayers = g('block_count');
  const nEmbd = g('embedding_length');
  const nHead = first(g('attention.head_count'));
  const headCountKv = g('attention.head_count_kv');
  const nHeadKv = first(headCountKv ?? nHead);
  const keyLen = g('attention.key_length') ?? (nEmbd && nHead ? nEmbd / nHead : 128);
  const valLen = g('attention.value_length') ?? keyLen;
  const vocab = kv['tokenizer.ggml.tokens']?.length ?? g('vocab_size') ?? 32000;

  const layerBytes = new Array(nLayers).fill(0);
  const layerExpertBytes = new Array(nLayers).fill(0);
  const attnLayers = new Set();
  let outputBytes = 0, embdBytes = 0;
  for (const t of tensors) {
    const m = /^blk\.(\d+)\.(.+)$/.exec(t.name);
    if (m) {
      const i = Number(m[1]);
      if (i >= nLayers) continue; // e.g. MTP / nextn layers not used for inference
      layerBytes[i] += t.bytes;
      if (/_exps\./.test(m[2])) layerExpertBytes[i] += t.bytes;
      if (/^attn_(k|q|qkv|kv_a_mqa|k_b)\b/.test(m[2])) attnLayers.add(i);
    } else if (/^token_embd/.test(t.name)) embdBytes += t.bytes;
    else outputBytes += t.bytes; // output.weight, output_norm, rope freqs...
  }
  // Tied embeddings: output shares token_embd, llama.cpp still puts a copy on GPU.
  if (!tensors.some((t) => t.name === 'output.weight')) outputBytes += embdBytes;

  // Per-layer KV heads can be an array (0 for non-attention layers).
  const kvHeadsPerLayer = Array.from({ length: nLayers }, (_, i) =>
    Array.isArray(headCountKv) ? headCountKv[i] : (attnLayers.has(i) || attnLayers.size === 0 ? nHeadKv : 0));

  const slidingWindow = g('attention.sliding_window') || null;
  // Some SWA models declare which layers use it; fall back to "every layer but each Nth".
  let swaLayers = [];
  const pattern = g('attention.sliding_window_pattern');
  if (slidingWindow) {
    if (Array.isArray(pattern)) swaLayers = pattern.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    else if (typeof pattern === 'number' && pattern > 1) swaLayers = [...Array(nLayers).keys()].filter((i) => (i + 1) % pattern !== 0);
  }

  const nExperts = g('expert_count') || 0;
  const nExpertsUsed = g('expert_used_count') || 0;

  let totalBytes = 0, totalElements = 0;
  for (const t of tensors) {
    totalBytes += t.bytes;
    let elements = 1;
    for (const d of t.dims) elements *= d;
    totalElements += elements;
  }
  const bitsPerWeight = totalElements === 0 ? null : +(totalBytes * 8 / totalElements).toFixed(2);

  return {
    arch,
    name: kv['general.name'] || null,
    nLayers,
    nEmbd,
    nHead,
    nHeadKv,
    keyLen,
    valLen,
    vocab,
    trainContext: g('context_length') || null,
    fileBytes,
    bitsPerWeight,
    layerBytes,
    layerExpertBytes,
    outputBytes,
    embdBytes,
    kvHeadsPerLayer,
    slidingWindow,
    swaLayers,
    nExperts,
    nExpertsUsed,
    isMoE: nExperts > 1,
  };
}

export async function modelMetaFromFile(file) {
  return summarizeGguf(await readGguf(file));
}
