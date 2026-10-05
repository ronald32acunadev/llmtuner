import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run, which, exists, fetchJson, freePort, spawnLogged, killProcess, sleep, PLATFORM, homeDir, timestamp } from '../util.js';
import { modelMetaFromFile } from '../gguf.js';
import { runApiBenchmark } from '../benchmark.js';
import { TunerError, benchError } from '../errors.js';

const DEFAULT_HOST = '127.0.0.1:11434';

function baseUrl() {
  let h = process.env.OLLAMA_HOST || DEFAULT_HOST;
  if (!/^https?:\/\//.test(h)) h = `http://${h}`;
  return h.replace('0.0.0.0', '127.0.0.1').replace(/\/$/, '');
}

async function ollamaBin() {
  const extra = PLATFORM === 'win32'
    ? [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe')]
    : PLATFORM === 'darwin' ? ['/Applications/Ollama.app/Contents/Resources/ollama', '/usr/local/bin/ollama', '/opt/homebrew/bin/ollama'] : ['/usr/local/bin/ollama', '/usr/bin/ollama'];
  return which('ollama', extra);
}

async function hasSystemdService() {
  if (PLATFORM !== 'linux') return false;
  const r = await run('systemctl', ['cat', 'ollama.service']);
  return r.code === 0;
}

/** Where the models live (needed to start a private benchmark server). */
async function modelsDir() {
  if (process.env.OLLAMA_MODELS) return process.env.OLLAMA_MODELS;
  const candidates = [path.join(homeDir(), '.ollama', 'models')];
  if (PLATFORM === 'linux') candidates.unshift('/usr/share/ollama/.ollama/models', '/var/lib/ollama/.ollama/models');
  for (const c of candidates) {
    try { await fs.access(path.join(c, 'manifests'), fs.constants.R_OK); return c; } catch { /* next */ }
  }
  return null;
}

// Synthesize estimator metadata from /api/show when the GGUF blob isn't readable.
function metaFromModelInfo(info, sizeBytes) {
  const arch = info['general.architecture'];
  const g = (k) => info[`${arch}.${k}`];
  const nLayers = g('block_count');
  const nEmbd = g('embedding_length');
  const nHead = g('attention.head_count');
  const nHeadKv = g('attention.head_count_kv') ?? nHead;
  const keyLen = g('attention.key_length') ?? nEmbd / nHead;
  const vocab = info['tokenizer.ggml.tokens']?.length ?? 32000;
  const outputBytes = Math.round(sizeBytes * 0.03);
  const per = (sizeBytes - outputBytes) / nLayers;
  const nExperts = g('expert_count') || 0;
  return {
    arch, nLayers, nEmbd, nHead, nHeadKv, keyLen, valLen: g('attention.value_length') ?? keyLen, vocab,
    trainContext: g('context_length'), fileBytes: sizeBytes, layerBytes: Array(nLayers).fill(per),
    layerExpertBytes: Array(nLayers).fill(nExperts ? per * 0.9 : 0), outputBytes, embdBytes: outputBytes,
    kvHeadsPerLayer: Array(nLayers).fill(Array.isArray(nHeadKv) ? Math.max(...nHeadKv) : nHeadKv),
    slidingWindow: g('attention.sliding_window') || null, swaLayers: [],
    nExperts, nExpertsUsed: g('expert_used_count') || 0, isMoE: nExperts > 1, approximate: true,
  };
}

/** Tags of the same model as `key` in an /api/tags list: [{ key, quant, sizeBytes, selected }]. */
export function ollamaVariants(models, key) {
  const self = models.find((m) => m.name === key);
  if (!self) return [];
  const [base] = key.split(':');
  const size = self.details?.parameter_size;
  if (!size) return [{ key: self.name, quant: self.details?.quantization_level ?? null, sizeBytes: self.size, selected: true }];
  return models
    .filter((m) => {
      const [mBase, ...mRest] = m.name.split(':');
      const mTag = mRest.length > 0 ? mRest.join(':') : '';
      return mBase === base && m.details?.parameter_size === size && !mTag.includes('-tuned-');
    })
    .map((m) => ({
      key: m.name,
      quant: m.details?.quantization_level ?? null,
      sizeBytes: m.size,
      selected: m.name === key,
    }));
}

export const ollama = {
  id: 'ollama',
  name: 'Ollama',
  // KV type and flash attention are server-wide settings in Ollama; GPU order via CUDA_VISIBLE_DEVICES.
  capabilities: { kvTypes: ['f16', 'q8_0', 'q4_0'], perModelKv: false, gpuOrder: true, cpuMoe: false, exactBenchmark: true, variantSelect: true },

  async detect() {
    const bin = await ollamaBin();
    const url = baseUrl();
    const v = await fetchJson(`${url}/api/version`, { timeout: 1500 });
    let version = v?.json?.version || null;
    if (!version && bin) version = (await run(bin, ['--version'])).stdout.match(/\d+\.\d+\.\d+/)?.[0] || null;
    return { installed: !!bin || !!v?.ok, bin, version, serverRunning: !!v?.ok, apiUrl: url, systemd: await hasSystemdService(), modelsDir: await modelsDir() };
  },

  async ensureServer(ctx) {
    if ((await fetchJson(`${ctx.detection.apiUrl}/api/version`, { timeout: 1500 }))?.ok) return true;
    if (!ctx.detection.bin) return false;
    const { spawn } = await import('node:child_process');
    spawn(ctx.detection.bin, ['serve'], { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      if ((await fetchJson(`${ctx.detection.apiUrl}/api/version`, { timeout: 1000 }))?.ok) return true;
    }
    return false;
  },

  async listModels(ctx) {
    await this.ensureServer(ctx);
    const r = await fetchJson(`${ctx.detection.apiUrl}/api/tags`);
    return (r?.json?.models || [])
      .filter((m) => !/embed/i.test(m.name) && !/bert/i.test(m.details?.family || ''))
      .map((m) => ({ key: m.name, name: m.name, sizeBytes: m.size, arch: m.details?.family, quant: m.details?.quantization_level, maxContext: null }));
  },

  /** Downloaded variants (tags) of a model: [{ key, quant, sizeBytes, selected }]. */
  async listVariants(ctx, key) {
    await this.ensureServer(ctx);
    const r = await fetchJson(`${ctx.detection.apiUrl}/api/tags`);
    return ollamaVariants(r?.json?.models || [], key);
  },

  async modelMeta(ctx, key) {
    const r = await fetchJson(`${ctx.detection.apiUrl}/api/show`, { method: 'POST', body: { model: key, verbose: true }, timeout: 30000 });
    if (!r?.ok) throw new TunerError('errors.ollamaUnknownModel', { key });
    const from = r.json.modelfile?.match(/^FROM\s+(.+)$/m)?.[1]?.trim();
    if (from && (await exists(from))) {
      try { return { file: from, ...(await modelMetaFromFile(from)) }; } catch { /* unreadable blob */ }
    }
    const list = await this.listModels(ctx);
    const size = list.find((m) => m.key === key)?.sizeBytes || 0;
    return { file: null, ...metaFromModelInfo(r.json.model_info || {}, size) };
  },

  async unloadAll(url) {
    const ps = await fetchJson(`${url}/api/ps`);
    for (const m of ps?.json?.models || []) {
      await fetchJson(`${url}/api/generate`, { method: 'POST', body: { model: m.name, keep_alive: 0 }, timeout: 30000 });
    }
  },

  async prepare(ctx) {
    await this.unloadAll(ctx.detection.apiUrl);
    await sleep(1500);
  },

  serverEnv(c) {
    const env = {
      OLLAMA_FLASH_ATTENTION: c.flashAttention ? '1' : '0',
      OLLAMA_KV_CACHE_TYPE: c.kvType,
      OLLAMA_NUM_PARALLEL: String(c.parallel),
    };
    if (c.gpuOrder?.length) {
      env.CUDA_DEVICE_ORDER = 'PCI_BUS_ID';
      env.CUDA_VISIBLE_DEVICES = c.gpuOrder.join(',');
    }
    return env;
  },

  requestOptions(c) {
    return { num_ctx: c.ctx, num_gpu: c.fullOffload ? 999 : c.gpuLayers, num_thread: c.threads, num_batch: c.ubatch };
  },

  /**
   * Benchmark in a private `ollama serve` on another port so KV type / flash
   * attention can change per candidate without touching the user's server.
   */
  async benchmark(ctx, model, candidate, opts) {
    const dir = ctx.detection.modelsDir;
    if (!dir || !ctx.detection.bin) {
      // Can't read the models: measure on the main server (its KV type/FA stay as configured).
      const res = await runApiBenchmark({ kind: 'ollama', baseUrl: ctx.detection.apiUrl, model: model.key, ollamaOptions: this.requestOptions(candidate), ...opts });
      await this.unloadAll(ctx.detection.apiUrl);
      return { ...res, noteCode: 'bench.mainServerNote' };
    }
    const port = await freePort();
    const url = `http://127.0.0.1:${port}`;
    const env = { ...process.env, ...this.serverEnv(candidate), OLLAMA_HOST: `127.0.0.1:${port}`, OLLAMA_MODELS: dir, OLLAMA_MAX_LOADED_MODELS: '1', OLLAMA_KEEP_ALIVE: '10m' };
    const proc = spawnLogged(ctx.detection.bin, ['serve'], { env });
    try {
      let up = false;
      for (let i = 0; i < 40; i++) {
        if ((await fetchJson(`${url}/api/version`, { timeout: 1000 }))?.ok) { up = true; break; }
        await sleep(500);
      }
      if (!up) return benchError('bench.ollamaTestServerFailed', { detail: proc.lines.slice(-2).join(' | ') });
      const res = await runApiBenchmark({ kind: 'ollama', baseUrl: url, model: model.key, ollamaOptions: this.requestOptions(candidate), ...opts });
      // How much really landed on GPU (Ollama may silently fall back to CPU).
      const ps = await fetchJson(`${url}/api/ps`);
      const loaded = ps?.json?.models?.[0];
      if (loaded) res.offload = { sizeBytes: loaded.size, vramBytes: loaded.size_vram, full: loaded.size_vram >= loaded.size * 0.99 };
      if (/out of memory|cudaMalloc failed/i.test(proc.lines.join('\n'))) Object.assign(res, benchError('bench.oom'), { oom: true });
      return res;
    } finally {
      await killProcess(proc.child);
      await sleep(1000);
    }
  },

  tunedName(key, c) {
    const [base, tag = 'latest'] = key.split(':');
    return `${base}:${tag}-tuned-${Math.round(c.ctx / 1024)}k`;
  },

  modelfile(key, c) {
    const o = this.requestOptions(c);
    return [`FROM ${key}`, ...Object.entries(o).map(([k, v]) => `PARAMETER ${k} ${v}`), ''].join('\n');
  },

  /**
   * 1) Create a tuned model variant with per-model parameters (num_ctx, num_gpu...).
   * 2) Set server-wide env (KV type, flash attention, GPU order) for the Ollama service.
   */
  async apply(ctx, model, c, { dryRun = false, useSudo = false, skipIfApplied = false } = {}) {
    const name = this.tunedName(model.key, c);
    const env = this.serverEnv(c);
    const result = { tunedModel: name, modelfile: this.modelfile(model.key, c), env, changes: [], pendingCommands: [] };
    if (dryRun) return { dryRun: true, ...result };

    const dir = path.join(os.tmpdir(), `llm-tuner-${timestamp()}`);
    await fs.mkdir(dir, { recursive: true });
    if (skipIfApplied && (await this.isApplied(ctx, model, c))) {
      result.changes.push({ code: 'changes.ollamaExists', params: { name } });
      return result;
    }
    const mf = path.join(dir, 'Modelfile');
    await fs.writeFile(mf, result.modelfile);
    const r = await run(ctx.detection.bin, ['create', name, '-f', mf], { timeout: 300_000 });
    if (r.code !== 0) throw new Error(`ollama create failed: ${(r.stderr || r.stdout).slice(-300)}`);
    result.changes.push({ code: 'changes.ollamaCreated', params: { name } });

    if (PLATFORM === 'win32') {
      for (const [k, v] of Object.entries(env)) await run('setx', [k, v]);
      result.changes.push({ code: 'changes.ollamaSetx' });
      await run('taskkill', ['/F', '/IM', 'ollama app.exe']);
      await run('taskkill', ['/F', '/IM', 'ollama.exe']);
      const app = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama app.exe');
      if (await exists(app)) { const { spawn } = await import('node:child_process'); spawn(app, [], { detached: true, stdio: 'ignore' }).unref(); }
    } else if (PLATFORM === 'darwin') {
      for (const [k, v] of Object.entries(env)) await run('launchctl', ['setenv', k, v]);
      result.changes.push({ code: 'changes.ollamaLaunchctl' });
      await run('osascript', ['-e', 'quit app "Ollama"']);
      await sleep(2000);
      await run('open', ['-a', 'Ollama']);
    } else if (ctx.detection.systemd) {
      const conf = ['[Service]', ...Object.entries(env).map(([k, v]) => `Environment="${k}=${v}"`), ''].join('\n');
      const confFile = path.join(dir, 'llm-tuner.conf');
      await fs.writeFile(confFile, conf);
      const cmds = [
        'sudo mkdir -p /etc/systemd/system/ollama.service.d',
        `sudo cp ${confFile} /etc/systemd/system/ollama.service.d/llm-tuner.conf`,
        'sudo systemctl daemon-reload',
        'sudo systemctl restart ollama',
      ];
      if (useSudo) {
        const ok = (await run('sudo', ['-n', 'true'])).code === 0;
        if (ok) {
          for (const cmd of cmds) { const [, ...rest] = cmd.split(' '); await run('sudo', ['-n', ...rest]); }
          result.changes.push({ code: 'changes.ollamaSystemd' });
        } else result.pendingCommands.push(...cmds);
      } else result.pendingCommands.push(...cmds);
    } else {
      result.pendingCommands.push(...Object.entries(env).map(([k, v]) => `export ${k}=${v}`), 'ollama serve');
    }
    return result;
  },

  async isApplied(ctx, model, c) {
    const r = await fetchJson(`${ctx.detection.apiUrl}/api/show`, { method: 'POST', body: { model: this.tunedName(model.key, c) }, timeout: 10000 });
    return !!r?.ok;
  },

  /** Load the tuned variant (kept in memory 30 min) and optionally measure it. */
  async load(ctx, model, { candidate, depthTokens = 0, genTokens = 200, onProgress } = {}) {
    await this.ensureServer(ctx);
    await this.unloadAll(ctx.detection.apiUrl);
    const name = this.tunedName(model.key, candidate);
    onProgress?.({ phase: 'load' });
    const warm = await fetchJson(`${ctx.detection.apiUrl}/api/generate`, { method: 'POST', body: { model: name, keep_alive: '30m' }, timeout: 600_000 });
    if (!warm?.ok) return warm?.json?.error ? { ok: false, error: warm.json.error } : benchError('bench.loadFailed');
    const res = await runApiBenchmark({ kind: 'ollama', baseUrl: ctx.detection.apiUrl, model: name, depthTokens, genTokens, onProgress, ollamaOptions: {} });
    return { ...res, model: name };
  },

  async chat(ctx, model, messages) {
    const url = ctx.detection?.apiUrl || baseUrl();
    const r = await fetchJson(`${url}/api/chat`, {
      method: 'POST',
      body: { model, messages, stream: false },
      timeout: 120_000,
    });
    if (!r?.ok) throw new Error(r?.json?.error || 'Failed to chat with Ollama');
    return { message: r.json.message };
  },
};

