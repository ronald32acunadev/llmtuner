import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { detectHardware, detectEngines, Tuner, installPlans, runInstall, slim, listPresets } from '../core/index.js';
import { openUrl } from '../core/installer.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

// A job is a long-running task (install, tune, apply) whose events are streamed over SSE.
const jobs = new Map();
function createJob() {
  const job = { id: randomUUID(), events: [], listeners: new Set(), done: false };
  job.emit = (event) => {
    job.events.push(event);
    for (const l of job.listeners) l(event);
  };
  job.finish = (event) => { job.emit({ type: 'finished', ...event }); job.done = true; };
  jobs.set(job.id, job);
  return job;
}

let busy = false;

async function body(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const routes = {
  'GET /api/state': async () => {
    const hw = await detectHardware();
    const engines = await detectEngines(hw);
    return { hw, ...engines, busy };
  },

  'GET /api/install-plans': async (req, url) => ({ plans: await installPlans(url.searchParams.get('engine')) }),

  'POST /api/install': async (req) => {
    const { engine, planId } = await body(req);
    const plan = (await installPlans(engine)).find((p) => p.id === planId);
    if (!plan) throw new Error('Plan de instalación desconocido');
    if (plan.needsSudo && process.platform !== 'win32') {
      // No TTY for a sudo password here: the user runs it in a terminal.
      return { manualCommand: plan.shell };
    }
    const job = createJob();
    runInstall(plan, (line) => job.emit({ type: 'log', line }))
      .then((r) => job.finish({ ok: r.code === 0, manual: r.manual }))
      .catch((e) => job.finish({ ok: false, error: e.message }));
    return { jobId: job.id };
  },

  'GET /api/models': async (req, url) => {
    const engine = url.searchParams.get('engine');
    const tuner = await Tuner.create(engine);
    return { models: await tuner.listModels() };
  },

  'POST /api/plan': async (req) => {
    const { engine, model, ctx } = await body(req);
    const tuner = await Tuner.create(engine);
    const p = await tuner.plan(model, Number(ctx) || 8192);
    const { layerBytes, layerExpertBytes, kvHeadsPerLayer, swaLayers, ...meta } = p.model.meta;
    return { meta, maxContext: p.maxContext, candidates: p.candidates.map(slim) };
  },

  'GET /api/presets': async (req, url) => ({ presets: await listPresets({ engine: url.searchParams.get('engine'), modelKey: url.searchParams.get('model') }) }),

  // The "Cargar" button: preset -> apply + load, or benchmark -> preset -> apply + load.
  'POST /api/load': async (req) => {
    if (busy) throw new Error('Ya hay una carga en curso');
    const { engine, model, ctx, force = false, candidates = 3 } = await body(req);
    const tuner = await Tuner.create(engine);
    const job = createJob();
    tuner.on('progress', (e) => job.emit(e));
    busy = true;
    tuner.load(model, Number(ctx), { force, maxCandidates: Number(candidates) })
      .then((r) => job.finish({ ok: !!r.loaded?.ok || !!r.applied?.pendingCommands?.length, result: { ...r, report: r.report && { ...r.report, best: r.report.best && { candidate: slim(r.report.best.candidate), bench: r.report.best.bench } } } }))
      .catch((e) => job.finish({ ok: false, error: e.message }))
      .finally(() => { busy = false; });
    return { jobId: job.id };
  },
};

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  try {
    // Server-Sent Events for job progress.
    const ev = url.pathname.match(/^\/api\/jobs\/([\w-]+)\/events$/);
    if (ev) {
      const job = jobs.get(ev[1]);
      if (!job) return send(res, 404, { error: 'job no encontrado' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const write = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
      job.events.forEach(write);
      if (job.done) return res.end();
      const l = (e) => { write(e); if (e.type === 'finished') res.end(); };
      job.listeners.add(l);
      req.on('close', () => job.listeners.delete(l));
      return;
    }
    const route = routes[`${req.method} ${url.pathname}`];
    if (route) return send(res, 200, await route(req, url));

    // Static files.
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
    const data = await fs.readFile(file).catch(() => null);
    if (!data) return send(res, 404, { error: 'no encontrado' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    send(res, 500, { error: String(e?.message || e) });
  }
}

/** Start the local UI server (bound to localhost only). */
export function startServer({ port = Number(process.env.PORT) || 7860, open = false } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${server.address().port}`;
      console.log(`LLM Tuner disponible en ${url}`);
      if (open) openUrl(url);
      resolve({ server, url });
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  startServer({ open: process.argv.includes('--open') });
}
