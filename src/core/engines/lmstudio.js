import fs from 'node:fs/promises';
import path from 'node:path';
import si from 'systeminformation';
import { run, which, exists, readJson, writeJsonWithBackup, fetchJson, PLATFORM, homeDir, sleep } from '../util.js';
import { modelMetaFromFile } from '../gguf.js';
import { runLlamaServerBenchmark } from '../llama-server.js';
import { runApiBenchmark } from '../benchmark.js';

// LM Studio internals used here were verified against LM Studio 0.4.x.
// The per-model config and hardware-config formats are not public API.

async function lmsHome() {
  const pointer = path.join(homeDir(), '.lmstudio-home-pointer');
  try {
    const p = (await fs.readFile(pointer, 'utf8')).trim();
    if (p && (await exists(p))) return p;
  } catch { /* no pointer */ }
  return path.join(homeDir(), '.lmstudio');
}

async function lmsBin(home) {
  const exe = PLATFORM === 'win32' ? 'lms.exe' : 'lms';
  return which('lms', [path.join(home, 'bin', exe)]);
}

const APP_PROCESS = /^(lm studio|lm-studio|lmstudio)(\.exe)?$/i;

export const lmstudio = {
  id: 'lmstudio',
  name: 'LM Studio',
  capabilities: { kvTypes: ['f16', 'q8_0', 'q4_0'], perModelKv: true, gpuOrder: true, cpuMoe: true, exactBenchmark: true },

  async detect() {
    const home = await lmsHome();
    const hasHome = await exists(path.join(home, 'settings.json'));
    const bin = await lmsBin(home);
    const installed = hasHome || !!bin;
    let version = null;
    const hist = await readJson(path.join(home, '.internal', 'historical-version-info.json'));
    if (hist) version = hist.lastUsedVersion || hist.version || JSON.stringify(hist).match(/\d+\.\d+\.\d+(?:[+-]\d+)?/)?.[0] || null;
    const procs = await si.processes().catch(() => ({ list: [] }));
    const appRunning = procs.list.some((p) => APP_PROCESS.test(p.name) && !/--type=/.test(p.params || ''));
    const server = await fetchJson('http://127.0.0.1:1234/api/v0/models', { timeout: 1500 });
    return { installed, home, bin, version, appRunning, serverRunning: !!server?.ok, apiUrl: 'http://127.0.0.1:1234' };
  },

  async listModels(ctx) {
    const { bin } = ctx.detection;
    if (!bin) return [];
    const r = await run(bin, ['ls', '--json']);
    if (r.code !== 0) return [];
    let list;
    try { list = JSON.parse(r.stdout); } catch { return []; }
    return list
      .filter((m) => m.type === 'llm' && m.format === 'gguf')
      .map((m) => ({ key: m.modelKey || m.path, name: m.displayName, sizeBytes: m.sizeBytes, arch: m.architecture, quant: m.quantization?.name, maxContext: m.maxContextLength, moe: /A\d+B/i.test(m.paramsString || '') }));
  },

  /** Resolve the GGUF file behind a model key using LM Studio's model index. */
  async resolveModelFile(ctx, key) {
    const home = ctx.detection.home;
    const idx = await readJson(path.join(home, '.internal', 'model-index-cache.json'), { models: [] });
    const entries = idx.models || [];
    const byId = (id) => entries.find((e) => e.indexedModelIdentifier === id && !e.virtual);
    let entry = entries.find((e) => e.indexedModelIdentifier === key || e.defaultIdentifier === key || e.virtual?.baseChain?.[0] === key);
    const concrete = entry?.virtual?.concreteModelIndexedModelIdentifier || entry?.virtual?.baseChain?.at?.(-1);
    if (concrete) entry = byId(concrete) || entry;
    if (entry?.containingDirAbsolutePath && /\.gguf$/i.test(entry.indexedModelIdentifier)) {
      const f = path.join(entry.containingDirAbsolutePath, path.basename(entry.indexedModelIdentifier));
      if (await exists(f)) return f;
    }
    // Fallback: search the downloads folder for a matching .gguf.
    const settings = await readJson(path.join(home, 'settings.json'), {});
    const root = settings.downloadsFolder || path.join(home, 'models');
    const want = path.basename(concrete || key).toLowerCase();
    const found = await findFile(root, (n) => n.toLowerCase().endsWith('.gguf') && (n.toLowerCase() === want || n.toLowerCase().includes(want.replace(/\.gguf$/, ''))), 4);
    return found;
  },

  async modelMeta(ctx, key) {
    const file = await this.resolveModelFile(ctx, key);
    if (!file) throw new Error(`No encuentro el archivo GGUF de ${key}`);
    return { file, ...(await modelMetaFromFile(file)) };
  },

  /** The llama-server binary of LM Studio's selected llama.cpp backend. */
  async backend(ctx) {
    const home = ctx.detection.home;
    const prefs = await readJson(path.join(home, '.internal', 'backend-preferences-v1.json'), []);
    const pref = prefs.find((p) => p.model_format === 'gguf');
    const backendsDir = path.join(home, 'extensions', 'backends');
    let dirName = pref ? `${pref.name}-${pref.version}` : null;
    if (!dirName || !(await exists(path.join(backendsDir, dirName)))) {
      const all = (await fs.readdir(backendsDir).catch(() => [])).filter((d) => d.startsWith('llama.cpp-')).sort();
      dirName = all.at(-1) || null;
    }
    if (!dirName) return null;
    const dir = path.join(backendsDir, dirName);
    const server = path.join(dir, PLATFORM === 'win32' ? 'llama-server.exe' : 'llama-server');
    const vendor = path.join(backendsDir, 'vendor');
    const libDirs = [dir, ...(await fs.readdir(vendor).catch(() => [])).map((d) => path.join(vendor, d))];
    return { name: pref?.name || dirName.replace(/-\d[\d.]*$/, ''), dir, server: (await exists(server)) ? server : null, libDirs };
  },

  /** Free VRAM before benchmarking: unload every model LM Studio has loaded. */
  async prepare(ctx) {
    if (ctx.detection.bin) await run(ctx.detection.bin, ['unload', '--all']);
    await sleep(1500);
  },

  async benchmark(ctx, model, candidate, opts) {
    const be = await this.backend(ctx);
    if (be?.server) {
      return runLlamaServerBenchmark({ server: be.server, libDirs: be.libDirs, cwd: be.dir, modelFile: model.meta.file, candidate, ...opts });
    }
    // Older LM Studio builds without a llama-server binary: load through lms.
    return this.benchmarkViaLms(ctx, model, candidate, opts);
  },

  async benchmarkViaLms(ctx, model, candidate, opts) {
    const bin = ctx.detection.bin;
    const restore = await this.writeModelConfig(ctx, model.key, candidate);
    try {
      const args = ['load', model.key, '-y', '--identifier', 'llm-tuner-bench', '-c', String(candidate.ctx), '--gpu', candidate.fullOffload ? 'max' : String(candidate.gpuLayers / candidate.totalLayers)];
      const r = await run(bin, args, { timeout: 600_000 });
      if (r.code !== 0) return { ok: false, error: (r.stderr || r.stdout).slice(-400) };
      return await runApiBenchmark({ kind: 'lmstudio', baseUrl: 'http://127.0.0.1:1234', model: 'llm-tuner-bench', ...opts });
    } finally {
      await run(bin, ['unload', 'llm-tuner-bench']);
      if (restore.backup) await fs.copyFile(restore.backup, restore.file); else await fs.rm(restore.file, { force: true });
    }
  },

  configPaths(ctx, key) {
    const internal = path.join(ctx.detection.home, '.internal');
    return {
      modelConfig: path.join(internal, 'user-concrete-model-default-config', `${key}.json`),
      hardwareConfig: path.join(internal, 'hardware-config.json'),
    };
  },

  async writeModelConfig(ctx, key, c) {
    const file = this.configPaths(ctx, key).modelConfig;
    const cur = (await readJson(file)) || { preset: '', operation: { fields: [] }, load: { fields: [] } };
    const fields = new Map((cur.load?.fields || []).map((f) => [f.key, f.value]));
    const set = (k, v) => fields.set(k, v);
    set('llm.load.contextLength', c.ctx);
    set('llm.load.llama.acceleration.offloadRatio', c.fullOffload ? 1 : +(c.gpuLayers / c.totalLayers).toFixed(3));
    set('llm.load.llama.flashAttention', c.flashAttention);
    set('llm.load.llama.cpuThreadPoolSize', c.threads);
    set('llm.load.llama.evalBatchSize', c.batch);
    set('llm.load.llama.physicalBatchSize', c.ubatch);
    set('llm.load.numParallelSessions', c.parallel);
    set('llm.load.useUnifiedKvCache', false);
    set('llm.load.offloadKVCacheToGpu', true);
    set('llm.load.llama.kCacheQuantizationType', { checked: c.kvType !== 'f16', value: c.kvType });
    set('llm.load.llama.vCacheQuantizationType', { checked: c.kvType !== 'f16', value: c.kvType });
    if (c.cpuMoeLayers) set('llm.load.numCpuExpertLayersRatio', +(c.cpuMoeLayers / (c.totalLayers - 1)).toFixed(3));
    const next = { ...cur, load: { ...(cur.load || {}), fields: [...fields].map(([key, value]) => ({ key, value })) } };
    if (JSON.stringify(next) === JSON.stringify(cur)) return { file, backup: null, unchanged: true };
    const backup = await writeJsonWithBackup(file, next);
    return { file, backup };
  },

  /** hardware-config.json is superjson: {"json":[[backendName,{fields:[...]}]],"meta":{...}} */
  async writeHardwareConfig(ctx, c) {
    const file = this.configPaths(ctx, '').hardwareConfig;
    const be = await this.backend(ctx);
    const backendName = be?.name || 'llama.cpp';
    const cur = (await readJson(file)) || { json: [], meta: { values: ['map'] } };
    const entries = Array.isArray(cur.json) ? cur.json : [];
    let entry = entries.find(([name]) => name === backendName);
    if (!entry) { entry = [backendName, { fields: [] }]; entries.push(entry); }
    const fields = new Map((entry[1].fields || []).map((f) => [f.key, f.value]));
    // Only a benchmark-verified full offload may bypass LM Studio's conservative VRAM cap.
    fields.set('load.gpuStrictVramCap', !c.fullOffload);
    fields.set('llm.load.offloadKVCacheToGpu', true);
    if (c.gpuOrder?.length > 1) {
      const prev = fields.get('load.gpuSplitConfig') || {};
      fields.set('load.gpuSplitConfig', { strategy: 'priorityOrder', disabledGpus: prev.disabledGpus || [], priority: c.gpuOrder, customRatio: prev.customRatio || [] });
    }
    entry[1] = { ...entry[1], fields: [...fields].map(([key, value]) => ({ key, value })) };
    const backup = await writeJsonWithBackup(file, { json: entries, meta: cur.meta || { values: ['map'] } }, { indent: 0 });
    return { file, backup };
  },

  async closeApp() {
    const procs = await si.processes().catch(() => ({ list: [] }));
    const main = procs.list.filter((p) => APP_PROCESS.test(p.name) && !/--type=/.test(p.params || ''));
    if (PLATFORM === 'darwin') await run('osascript', ['-e', 'quit app "LM Studio"']);
    else if (PLATFORM === 'win32') await run('taskkill', ['/IM', 'LM Studio.exe', '/T']);
    else for (const p of main) { try { process.kill(p.pid, 'SIGINT'); } catch { /* gone */ } }
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      const now = await si.processes().catch(() => ({ list: [] }));
      if (!now.list.some((p) => APP_PROCESS.test(p.name))) return true;
    }
    // Electron may stay in the tray; a hard kill cannot save (and thus overwrite) settings.
    if (PLATFORM === 'win32') await run('taskkill', ['/F', '/IM', 'LM Studio.exe', '/T']);
    else for (const p of main) { try { process.kill(p.pid, 'SIGKILL'); } catch { /* gone */ } }
    await sleep(2000);
    return true;
  },

  async launchApp(ctx) {
    const loc = await readJson(path.join(ctx.detection.home, '.internal', 'app-install-location.json'));
    if (PLATFORM === 'darwin') return run('open', ['-a', 'LM Studio']);
    if (!loc?.path) return null;
    const { spawn } = await import('node:child_process');
    const child = spawn(loc.path, loc.argv?.slice(1) || [], { cwd: loc.cwd, detached: true, stdio: 'ignore' });
    child.unref();
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      if (ctx.detection.bin && (await run(ctx.detection.bin, ['status'])).code === 0) break;
    }
    return true;
  },

  /** Does hardware-config.json already match what this candidate needs? */
  async isHardwareApplied(ctx, c) {
    const file = this.configPaths(ctx, '').hardwareConfig;
    const be = await this.backend(ctx);
    const cur = await readJson(file);
    const entry = (cur?.json || []).find(([name]) => name === (be?.name || 'llama.cpp'));
    const fields = new Map((entry?.[1]?.fields || []).map((f) => [f.key, f.value]));
    if (fields.get('load.gpuStrictVramCap') !== !c.fullOffload) return false;
    if (c.gpuOrder?.length > 1) {
      const split = fields.get('load.gpuSplitConfig');
      if (split?.strategy !== 'priorityOrder' || JSON.stringify(split.priority) !== JSON.stringify(c.gpuOrder)) return false;
    }
    return true;
  },

  /**
   * Persist the chosen configuration. The per-model config is re-read by LM Studio
   * on every load, so it can be written live. hardware-config.json can be
   * overwritten by the app on exit, so the app is closed while it changes.
   */
  async apply(ctx, model, c, { closeApp = true, relaunch = true, dryRun = false } = {}) {
    const paths = this.configPaths(ctx, model.key);
    const hardwareOk = await this.isHardwareApplied(ctx, c);
    const det = await this.detect();
    const plan = { files: hardwareOk ? [paths.modelConfig] : [paths.modelConfig, paths.hardwareConfig], restartsApp: !hardwareOk && det.appRunning, candidate: c };
    if (dryRun) return { dryRun: true, ...plan };
    const backups = [];
    const changes = [];
    if (!hardwareOk) {
      if (det.appRunning) {
        if (!closeApp) throw new Error('LM Studio está abierto; ciérralo antes de aplicar la configuración.');
        await this.closeApp();
      }
      const b = await this.writeHardwareConfig(ctx, c);
      if (b.backup) backups.push(b.backup);
      changes.push('Config de hardware actualizada (orden de GPUs y límite de VRAM)');
    }
    const a = await this.writeModelConfig(ctx, model.key, c);
    if (a.backup) backups.push(a.backup);
    if (!a.unchanged) changes.push(`Config del modelo: ${c.ctx} tokens, KV ${c.kvType}, ${c.fullOffload ? 'todas las capas en GPU' : `${c.gpuLayers}/${c.totalLayers} capas en GPU`}, ${c.threads} hilos`);
    if (!hardwareOk && relaunch && det.appRunning) {
      await this.launchApp(ctx);
      changes.push('LM Studio reiniciado');
    }
    return { ...plan, backups, changes };
  },

  /** Load the model the normal way (using the saved config) and optionally measure it. */
  async load(ctx, model, { depthTokens = 0, genTokens = 200, onProgress } = {}) {
    const bin = ctx.detection.bin;
    if (!bin) return { ok: false, error: 'lms no disponible' };
    await run(bin, ['server', 'start']);
    await run(bin, ['unload', '--all']);
    onProgress?.({ phase: 'load' });
    const r = await run(bin, ['load', model.key, '-y'], { timeout: 600_000 });
    if (r.code !== 0) return { ok: false, error: (r.stderr || r.stdout).slice(-400) };
    return runApiBenchmark({ kind: 'lmstudio', baseUrl: 'http://127.0.0.1:1234', model: model.key, depthTokens, genTokens, onProgress });
  },
};

async function findFile(root, pred, depth) {
  if (depth < 0) return null;
  let entries;
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) if (e.isFile() && pred(e.name)) return path.join(root, e.name);
  for (const e of entries) {
    if (e.isDirectory()) {
      const f = await findFile(path.join(root, e.name), pred, depth - 1);
      if (f) return f;
    }
  }
  return null;
}
