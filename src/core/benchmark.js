import { fetchJson, cpuSnapshot, cpuBusyPercent } from './util.js';
import { startVramSampler } from './hardware.js';

// Deterministic pseudo-random generator so every run gets the same prompt.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const WORDS = ['user', 'order', 'cache', 'item', 'queue', 'token', 'config', 'buffer', 'session', 'payload', 'record', 'index', 'stream', 'result', 'handler', 'worker', 'price', 'account', 'event', 'metric'];
const VERBS = ['load', 'parse', 'build', 'update', 'validate', 'compute', 'merge', 'flush', 'resolve', 'render', 'fetch', 'encode'];

/**
 * Synthetic but realistic-looking source code, roughly `tokens` long.
 * Code tokenizes at ~3.3 chars/token on modern BPE vocabularies.
 */
export function makeCodePrompt(tokens, charsPerToken = 3.3, seed = 42) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const target = Math.max(64, Math.floor(tokens * charsPerToken));
  let out = '// Module under review. Read it carefully; questions follow at the end.\n\n';
  let n = 0;
  while (out.length < target) {
    const a = pick(WORDS), b = pick(WORDS), v = pick(VERBS);
    const fn = `${v}${a[0].toUpperCase()}${a.slice(1)}${n++}`;
    out += `export function ${fn}(${a}s, options = {}) {\n` +
      `  const ${b}Map = new Map();\n` +
      `  for (const ${a} of ${a}s) {\n` +
      `    if (!${a} || ${a}.${b}Id == null) continue;\n` +
      `    const key = \`\${${a}.${b}Id}:\${options.${pick(WORDS)} ?? ${Math.floor(r() * 1000)}}\`;\n` +
      `    const prev = ${b}Map.get(key) ?? { count: 0, total: 0 };\n` +
      `    ${b}Map.set(key, { count: prev.count + 1, total: prev.total + (${a}.${pick(WORDS)} || 0) * ${(r() * 10).toFixed(2)} });\n` +
      `  }\n  return [...${b}Map.entries()].filter(([, v]) => v.count > ${Math.floor(r() * 5)});\n}\n\n`;
  }
  return out.slice(0, target) + '\n}\n\n// Task: explain what the last function does, then write an optimized version of it with comments.\n';
}

/** Sample CPU and VRAM while `fn` runs. */
export async function withSampling(fn) {
  const vram = startVramSampler(500);
  const samples = [];
  let prev = cpuSnapshot();
  const timer = setInterval(() => { const now = cpuSnapshot(); samples.push(cpuBusyPercent(prev, now)); prev = now; }, 500);
  try {
    const result = await fn();
    return { result, cpu: summarize(samples), vramPeakBytes: vram.stop() };
  } finally {
    clearInterval(timer);
    vram.stop();
  }
}

const summarize = (s) => (s.length ? { avg: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1), max: +Math.max(...s).toFixed(1) } : { avg: null, max: null });

/**
 * Benchmark a model already served by LM Studio or Ollama through its HTTP API.
 * Runs a short prompt (pure decode speed) and a deep one (speed with a full context).
 */
export async function runApiBenchmark({ kind, baseUrl, model, depthTokens = 4000, genTokens = 200, ollamaOptions = {}, onProgress = () => {} }) {
  const one = async (label, promptTokens) => {
    onProgress({ phase: label, promptTokens });
    const prompt = makeCodePrompt(promptTokens);
    if (kind === 'ollama') {
      const res = await fetchJson(`${baseUrl}/api/generate`, {
        method: 'POST', timeout: 1_800_000,
        body: { model, prompt, raw: true, stream: false, options: { ...ollamaOptions, num_predict: genTokens, temperature: 0.2 } },
      });
      const d = res?.json;
      if (!res?.ok || !d?.eval_count) return { ok: false, error: d?.error || res?.text?.slice(0, 300) || 'no response' };
      return {
        ok: true,
        promptTokens: d.prompt_eval_count,
        genTokens: d.eval_count,
        genTps: +(d.eval_count / (d.eval_duration / 1e9)).toFixed(1),
        ppTps: d.prompt_eval_duration ? +(d.prompt_eval_count / (d.prompt_eval_duration / 1e9)).toFixed(0) : null,
      };
    }
    const res = await fetchJson(`${baseUrl}/api/v0/chat/completions`, {
      method: 'POST', timeout: 1_800_000,
      body: { model, messages: [{ role: 'user', content: prompt }], max_tokens: genTokens, temperature: 0.2, stream: false },
    });
    const d = res?.json;
    if (!res?.ok || !d?.stats) return { ok: false, error: d?.error?.message || d?.error || res?.text?.slice(0, 300) || 'no response' };
    return {
      ok: true,
      promptTokens: d.usage?.prompt_tokens,
      genTokens: d.usage?.completion_tokens,
      genTps: +d.stats.tokens_per_second.toFixed(1),
      ppTps: d.stats.time_to_first_token ? +(d.usage.prompt_tokens / d.stats.time_to_first_token).toFixed(0) : null,
    };
  };

  const { result, cpu, vramPeakBytes } = await withSampling(async () => {
    const short = await one('short', 200);
    if (!short.ok) return { short };
    const deep = depthTokens > 400 ? await one('deep', depthTokens) : null;
    return { short, deep };
  });
  const ok = result.short.ok && (!result.deep || result.deep.ok);
  return { ok, error: ok ? null : (result.deep?.error || result.short.error), short: result.short, deep: result.deep, cpu, vramPeakBytes };
}
