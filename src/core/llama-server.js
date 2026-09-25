import path from 'node:path';
import { spawnLogged, killProcess, freePort, fetchJson, sleep, PLATFORM } from './util.js';
import { makeCodePrompt, withSampling } from './benchmark.js';

const LIB_ENV = { linux: 'LD_LIBRARY_PATH', darwin: 'DYLD_LIBRARY_PATH', win32: 'PATH' };

/** Translate an engine-agnostic candidate into llama-server flags. */
export function llamaServerArgs(modelFile, c, port) {
  // llama.cpp gives the *last* layers (and the output layer) to the last device,
  // so devices are listed in reverse priority: the preferred GPU ends up last.
  const split = [...c.tensorSplit].reverse();
  const args = [
    '--model', modelFile,
    '--host', '127.0.0.1', '--port', String(port),
    '--ctx-size', String(c.ctx),
    '--n-gpu-layers', String(c.fullOffload ? 999 : c.gpuLayers),
    '--split-mode', 'layer',
    '--batch-size', String(c.batch), '--ubatch-size', String(c.ubatch),
    '--threads', String(c.threads),
    '--parallel', String(c.parallel),
    '--cache-type-k', c.kvType, '--cache-type-v', c.kvType,
    '--flash-attn', c.flashAttention ? 'on' : 'off',
    '--kv-offload', '--no-kv-unified',
    '--no-webui',
  ];
  if (split.length > 1) args.push('--tensor-split', split.join(','), '--main-gpu', String(split.length - 1));
  if (c.cpuMoeLayers) args.push('--n-cpu-moe', String(c.cpuMoeLayers));
  return args;
}

export function llamaServerEnv(libDirs, c) {
  const key = LIB_ENV[PLATFORM] || 'LD_LIBRARY_PATH';
  const env = { ...process.env, [key]: [...libDirs, process.env[key]].filter(Boolean).join(path.delimiter) };
  if (c.gpuOrder?.length) {
    // Match nvidia-smi numbering, then enumerate in reverse priority (see above).
    env.CUDA_DEVICE_ORDER = 'PCI_BUS_ID';
    env.CUDA_VISIBLE_DEVICES = [...c.gpuOrder].reverse().join(',');
  }
  return env;
}

/**
 * Start the engine's own llama-server with exactly the candidate settings,
 * measure a short and a deep prompt, then stop it. Same binary LM Studio uses,
 * so results transfer 1:1 to the app.
 */
export async function runLlamaServerBenchmark({ server, libDirs, cwd, modelFile, candidate, depthTokens = 4000, genTokens = 200, onProgress = () => {} }) {
  const port = await freePort();
  const args = llamaServerArgs(modelFile, candidate, port);
  const t0 = Date.now();
  onProgress({ phase: 'load' });
  const proc = spawnLogged(server, args, { cwd, env: llamaServerEnv(libDirs, candidate) });
  const base = `http://127.0.0.1:${port}`;
  try {
    let healthy = false;
    let exited = null;
    proc.exited.then((e) => { exited = e; });
    for (let i = 0; i < 1200 && !exited; i++) {
      const h = await fetchJson(`${base}/health`, { timeout: 1000 });
      if (h?.ok) { healthy = true; break; }
      await sleep(500);
    }
    if (!healthy) {
      const log = proc.lines.join('\n');
      const oom = /out of memory|cudaMalloc failed|failed to allocate|ErrorOutOfDeviceMemory/i.test(log);
      return { ok: false, oom, error: oom ? 'Sin VRAM suficiente (OOM al cargar)' : lastError(proc.lines), args, logTail: proc.lines.slice(-15) };
    }
    const loadSeconds = +((Date.now() - t0) / 1000).toFixed(1);

    // Calibrate chars/token with the model's own tokenizer.
    let cpt = 3.3;
    const sample = makeCodePrompt(500);
    const tok = await fetchJson(`${base}/tokenize`, { method: 'POST', body: { content: sample }, timeout: 10000 });
    if (tok?.json?.tokens?.length) cpt = sample.length / tok.json.tokens.length;

    const one = async (label, tokens) => {
      onProgress({ phase: label, promptTokens: tokens });
      const res = await fetchJson(`${base}/completion`, {
        method: 'POST', timeout: 1_800_000,
        body: { prompt: makeCodePrompt(tokens, cpt), n_predict: genTokens, ignore_eos: true, cache_prompt: false, temperature: 0.2 },
      });
      const t = res?.json?.timings;
      if (!t) return { ok: false, error: res?.json?.error?.message || lastError(proc.lines) };
      return { ok: true, promptTokens: t.prompt_n, genTokens: t.predicted_n, genTps: +t.predicted_per_second.toFixed(1), ppTps: Math.round(t.prompt_per_second) };
    };

    const maxDepth = Math.max(0, candidate.ctx - genTokens - 256);
    const { result, cpu, vramPeakBytes } = await withSampling(async () => {
      const short = await one('short', 200);
      const deep = short.ok && depthTokens > 400 ? await one('deep', Math.min(depthTokens, maxDepth)) : null;
      return { short, deep };
    });
    const ok = result.short.ok && (!result.deep || result.deep.ok);
    return { ok, error: ok ? null : (result.deep?.error || result.short.error), loadSeconds, short: result.short, deep: result.deep, cpu, vramPeakBytes, args };
  } finally {
    await killProcess(proc.child);
    await sleep(1000); // let the driver release VRAM before the next candidate
  }
}

function lastError(lines) {
  const errs = lines.filter((l) => /\b(E|error|failed)\b/i.test(l));
  return (errs.slice(-2).join(' | ') || lines.slice(-2).join(' | ') || 'llama-server terminó sin responder').slice(0, 400);
}
