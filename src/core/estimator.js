import { MiB } from './util.js';

// Bytes per element of each KV cache type (ggml block sizes).
export const KV_TYPES = {
  // readCost: relative cost of reading the cache during decode. Q4_0 dequantization
  // in flash attention is much slower in practice (measured ~12x on RTX 50xx).
  f16: { bytes: 2, quality: 1.0, readCost: 1, label: 'F16 (máxima calidad)' },
  q8_0: { bytes: 34 / 32, quality: 0.99, readCost: 1, label: 'Q8_0 (casi sin pérdida)' },
  q4_0: { bytes: 18 / 32, quality: 0.93, readCost: 12, label: 'Q4_0 (ahorra memoria, pierde precisión)' },
};

// Calibrated on RTX 5070 x2 / Qwen2.5-Coder-32B: CUDA context + scratch per GPU.
// nvidia-smi "free" already excludes the driver's own reserve, so only a small margin.
const PER_GPU_OVERHEAD = 350 * MiB;
const PER_GPU_RESERVE = 64 * MiB;
// Estimates within this distance of fitting are still tried as a full offload.
const PROBE_MARGIN = 1024 * MiB;
const COMPUTE_BYTES_PER_CTX_TOKEN = 3.5 * 1024;
// Fraction of theoretical bandwidth llama.cpp typically achieves in decode.
const DECODE_EFFICIENCY = 0.7;

/** KV cache bytes for one layer at a given context length. */
export function kvLayerBytes(meta, layer, ctx, kvType) {
  const heads = meta.kvHeadsPerLayer[layer];
  if (!heads) return 0;
  const tokens = meta.slidingWindow && meta.swaLayers.includes(layer) ? Math.min(ctx, meta.slidingWindow) : ctx;
  const b = KV_TYPES[kvType].bytes;
  return tokens * heads * (meta.keyLen * b + meta.valLen * b);
}

export function kvTotalBytes(meta, ctx, kvType) {
  let total = 0;
  for (let i = 0; i < meta.nLayers; i++) total += kvLayerBytes(meta, i, ctx, kvType);
  return total;
}

/** Memory each GPU can give to the model, after what's already in use. */
export function gpuBudgets(gpus) {
  return gpus.map((g) => ({
    index: g.index,
    name: g.name,
    budget: Math.max(0, g.freeBytes - PER_GPU_OVERHEAD - PER_GPU_RESERVE),
    bandwidthGBps: g.bandwidthGBps,
  }));
}

/**
 * Pack layers onto GPUs in priority order (llama.cpp split-mode "layer" keeps
 * layers contiguous per device; the output layer lands on the last device).
 * MoE: when `cpuMoeLayers` > 0, the expert tensors of the first N layers stay
 * in system RAM (llama.cpp --n-cpu-moe), which frees VRAM cheaply.
 */
export function placeLayers(meta, gpus, { ctx, kvType, ubatch = 512, cpuMoeLayers = 0 }) {
  const budgets = gpuBudgets(gpus);
  const logitsBytes = meta.vocab * ubatch * 4;
  const computePerGpu = ctx * COMPUTE_BYTES_PER_CTX_TOKEN / Math.max(1, budgets.length);
  let used = budgets.map(() => computePerGpu);
  let layersPerGpu = budgets.map(() => 0);
  const layerCost = (i) => meta.layerBytes[i] - (i < cpuMoeLayers ? meta.layerExpertBytes[i] : 0) + kvLayerBytes(meta, i, ctx, kvType);

  let g = 0;
  let placed = 0;
  // Layers that do not fit stay on CPU; llama.cpp offloads the *last* n layers,
  // so we count how many fit and treat the remaining first layers as CPU layers.
  const order = [...Array(meta.nLayers).keys()].reverse();
  const fits = [];
  for (const i of order) {
    const cost = layerCost(i);
    while (g < budgets.length && used[g] + cost > budgets[g].budget) g++;
    if (g >= budgets.length) break;
    used[g] += cost;
    layersPerGpu[g]++;
    fits.push(i);
    placed++;
  }
  // Output layer (+ logits buffer) goes to the GPU that holds the last layers,
  // i.e. the first one we filled.
  let outputOnGpu = false;
  if (placed === meta.nLayers && budgets.length) {
    const outCost = meta.outputBytes + logitsBytes;
    const target = used.findIndex((u, k) => u + outCost <= budgets[k].budget);
    if (target >= 0) { used[target] += outCost; outputOnGpu = true; }

    // Greedy packing leaves the first GPU at its limit; llama.cpp then fails to
    // allocate compute buffers there. Spread layers so every GPU keeps the same
    // fraction of headroom.
    if (outputOnGpu && budgets.length > 1) {
      const frac = used.reduce((a, b) => a + b, 0) / budgets.reduce((a, b) => a + b.budget, 0);
      const u2 = budgets.map(() => computePerGpu);
      const l2 = budgets.map(() => 0);
      u2[target] += outCost;
      let k = 0;
      for (const i of order) {
        const cost = layerCost(i);
        while (k < budgets.length - 1 && u2[k] + cost > budgets[k].budget * frac) k++;
        u2[k] += cost;
        l2[k]++;
      }
      if (u2.every((u, j) => u <= budgets[j].budget)) { used = u2; layersPerGpu = l2; }
    }
  }

  // Rough RAM bytes read per token by the CPU for layers left behind.
  const cpuLayers = meta.nLayers - placed;
  const activeFrac = meta.isMoE && meta.nExperts ? meta.nExpertsUsed / meta.nExperts : 1;
  let cpuBytesPerToken = 0;
  for (let i = 0; i < meta.nLayers; i++) {
    const onCpu = !fits.includes(i);
    const expert = meta.layerExpertBytes[i];
    const dense = meta.layerBytes[i] - expert;
    if (onCpu) cpuBytesPerToken += dense + expert * activeFrac;
    else if (i < cpuMoeLayers) cpuBytesPerToken += expert * activeFrac;
  }
  if (!outputOnGpu) cpuBytesPerToken += meta.outputBytes;

  return {
    gpuLayers: placed + (outputOnGpu ? 1 : 0), // llama.cpp counts output as one extra layer
    totalLayers: meta.nLayers + 1,
    cpuLayers,
    fullOffload: placed === meta.nLayers && outputOnGpu,
    kvType,
    deficit: budgets.length ? Math.max(0, totalNeed(meta, ctx, kvType, ubatch, cpuMoeLayers, budgets.length) - budgets.reduce((a, b) => a + b.budget, 0)) : Infinity,
    layersPerGpu: budgets.map((b, k) => ({ index: b.index, layers: layersPerGpu[k], bytes: used[k] + PER_GPU_OVERHEAD, budget: b.budget + PER_GPU_OVERHEAD })),
    kvBytes: kvTotalBytes(meta, ctx, kvType),
    cpuBytesPerToken,
    cpuMoeLayers,
  };
}

/** Total bytes a full offload needs across all GPUs. */
function totalNeed(meta, ctx, kvType, ubatch, cpuMoeLayers, nGpus) {
  let t = meta.outputBytes + meta.vocab * ubatch * 4 + ctx * COMPUTE_BYTES_PER_CTX_TOKEN * (nGpus ? 1 : 0);
  for (let i = 0; i < meta.nLayers; i++) t += meta.layerBytes[i] - (i < cpuMoeLayers ? meta.layerExpertBytes[i] : 0) + kvLayerBytes(meta, i, ctx, kvType);
  return t;
}

/** Predicted decode tokens/s from memory bandwidth (for ranking only). */
export function predictTps(meta, placement, gpus, hw, ctxDepth) {
  const activeFrac = meta.isMoE && meta.nExperts ? meta.nExpertsUsed / meta.nExperts : 1;
  let seconds = 0;
  const byIndex = new Map(gpus.map((g) => [g.index, g]));
  let layerCursor = meta.nLayers - 1;
  for (const lp of placement.layersPerGpu) {
    const gpu = byIndex.get(lp.index);
    let bytes = 0;
    for (let n = 0; n < lp.layers; n++, layerCursor--) {
      const i = layerCursor;
      const expert = i < placement.cpuMoeLayers ? 0 : meta.layerExpertBytes[i];
      bytes += (meta.layerBytes[i] - meta.layerExpertBytes[i]) + expert * activeFrac;
    }
    bytes += placement.kvBytes * (lp.layers / meta.nLayers) * (ctxDepth / Math.max(1, placement.ctx || ctxDepth)) * KV_TYPES[placement.kvType].readCost;
    seconds += bytes / (gpu.bandwidthGBps * 1e9 * DECODE_EFFICIENCY);
  }
  if (placement.fullOffload) seconds += meta.outputBytes / (gpus[0].bandwidthGBps * 1e9 * DECODE_EFFICIENCY);
  seconds += placement.cpuBytesPerToken / (hw.ramBandwidthGBps * 1e9 * 0.6);
  return seconds > 0 ? 1 / seconds : 0;
}

/**
 * Build ranked candidate configurations for a target context length.
 * Each candidate is engine-agnostic; engines translate it to their own flags.
 */
export function planCandidates(meta, hw, { ctx, kvTypes = Object.keys(KV_TYPES), allowCpuMoe = true } = {}) {
  const gpus = hw.gpus;
  const out = [];

  for (const kvType of kvTypes) {
    const base = { ctx, kvType, flashAttention: true, ubatch: 512, batch: 512, parallel: 1, gpuOrder: gpus.map((g) => g.index) };
    let placement = placeLayers(meta, gpus, base);

    // MoE: if dense layers don't all fit, try keeping experts of the first N layers in RAM.
    if (!placement.fullOffload && meta.isMoE && allowCpuMoe) {
      for (let n = 1; n <= meta.nLayers; n++) {
        const p = placeLayers(meta, gpus, { ...base, cpuMoeLayers: n });
        if (p.fullOffload) { placement = p; break; }
      }
    }

    placement.ctx = ctx;
    // Close to fitting: also try the full offload for real (a failed load is cheap).
    if (!placement.fullOffload && placement.deficit <= PROBE_MARGIN && gpus.length) {
      // Spread all layers proportionally to each GPU's budget.
      const total = placement.layersPerGpu.reduce((a, l) => a + l.budget, 0);
      let left = meta.nLayers;
      const layersPerGpu = placement.layersPerGpu.map((l, k, arr) => {
        const n = k === arr.length - 1 ? left : Math.round(meta.nLayers * l.budget / total);
        left -= n;
        return { ...l, layers: n };
      });
      const probe = { ...placement, layersPerGpu, fullOffload: true, gpuLayers: placement.totalLayers, cpuLayers: 0, cpuBytesPerToken: 0, probe: true };
      out.push(makeCandidate(meta, hw, base, probe));
    }
    out.push(makeCandidate(meta, hw, base, placement));
  }

  if (!gpus.length) {
    return out.slice(0, 1).map((c) => ({ ...c, gpuLayers: 0, fullOffload: false }));
  }
  return out.sort((a, b) => Number(b.fullOffload && !b.probe) - Number(a.fullOffload && !a.probe) || b.score - a.score);
}

function makeCandidate(meta, hw, base, placement) {
  const gpus = hw.gpus;
  const physical = hw.cpu.physicalCores;
  const { ctx, kvType } = base;
  const onGpuOnly = placement.fullOffload && placement.cpuMoeLayers === 0;
  // Fully on GPU the CPU only feeds tokens; with CPU layers use all physical cores.
  const threads = onGpuOnly ? Math.min(4, physical) : Math.max(1, physical - (physical > 4 ? 1 : 0));
  const tpsShort = predictTps(meta, placement, gpus, hw, 512);
  const tpsDeep = predictTps(meta, placement, gpus, hw, ctx * 0.6);

  return {
    id: `${kvType}-${placement.gpuLayers}${placement.cpuMoeLayers ? `-moe${placement.cpuMoeLayers}` : ''}${placement.probe ? '-probe' : ''}`,
    ...base,
    threads,
    gpuLayers: placement.gpuLayers,
    totalLayers: placement.totalLayers,
    fullOffload: placement.fullOffload,
    cpuMoeLayers: placement.cpuMoeLayers,
    tensorSplit: placement.layersPerGpu.map((l) => l.layers),
    placement,
    predicted: { tpsShort: +tpsShort.toFixed(1), tpsDeep: +tpsDeep.toFixed(1) },
    probe: !!placement.probe,
    score: tpsDeep * KV_TYPES[kvType].quality,
  };
}

/** Largest context (multiple of 1024) that fits fully on GPU for a KV type. */
export function maxFullOffloadContext(meta, hw, kvType, limit = meta.trainContext || 131072) {
  let lo = 0, hi = Math.floor(limit / 1024);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const p = placeLayers(meta, hw.gpus, { ctx: mid * 1024, kvType });
    if (p.fullOffload) lo = mid; else hi = mid - 1;
  }
  return lo * 1024;
}
