import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { detectHardware, detectEngines, Tuner, ENGINES, installPlans, runInstall, slim, listPresets, readSettings, writeSettings, TunerError, PROFILES, checkUpdate, detectAgents, installMcpServer, resolveConnectableHost } from '../core/index.js';
import { THEMES } from '../core/settings.js';
import { LOCALES, messagesFor } from '../i18n/index.js';
import { openUrl } from '../core/installer.js';

export function sanitizeHardware(hw) {
  if (!hw || typeof hw !== 'object') return hw;
  return {
    os: {
      platform: hw.os?.platform,
      arch: hw.os?.arch,
    },
    cpu: {
      physicalCores: hw.cpu?.physicalCores,
      threads: hw.cpu?.threads,
      avx2: hw.cpu?.avx2,
    },
    gpus: (hw.gpus || []).map((gpu) => ({
      vendor: gpu.vendor,
      backend: gpu.backend,
      index: gpu.index,
      name: gpu.name,
      totalBytes: gpu.totalBytes,
      usedBytes: gpu.usedBytes,
      freeBytes: gpu.freeBytes,
      bandwidthGBps: gpu.bandwidthGBps,
      displayAttached: gpu.displayAttached,
      unifiedMemory: gpu.unifiedMemory,
    })),
    ram: {
      totalBytes: hw.ram?.totalBytes,
      availableBytes: hw.ram?.availableBytes,
    },
    ramBandwidthGBps: hw.ramBandwidthGBps,
  };
}

export function isLoopback(ip) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
}

export function verifyToken(req, expectedToken) {
  const ip = req.socket?.remoteAddress;
  const loopback = isLoopback(ip);

  if (expectedToken === null || expectedToken === undefined) {
    return loopback;
  }

  const authHeader = req.headers?.['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expectedToken);

  if (tokenBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(tokenBuf, expectedBuf);
}

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const I18N_CORE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'core.js');

/** JSON body for an error; TunerErrors carry a code the browser translates. */
function errorBody(e) {
  return e instanceof TunerError ? { error: e.message, code: e.code, params: e.params } : { error: String(e?.message || e) };
}

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

/** The load profile a request names, or a TunerError the browser translates. */
function knownProfile(value) {
  if (!PROFILES.includes(value)) throw new TunerError('errors.unknownProfile', { profile: String(value ?? ''), list: PROFILES.join(', ') });
  return value;
}

async function body(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

function send(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  });
  res.end(JSON.stringify(obj));
}

const routes = {
  'GET /api/settings': async () => ({ ...(await readSettings()), locales: LOCALES, themes: THEMES, profiles: PROFILES }),

  'GET /api/update': async () => checkUpdate(),

  'POST /api/settings': async (req) => {
    const payload = await body(req);
    if (payload?.lang === undefined && payload?.theme === undefined && payload?.profile === undefined && payload?.servers === undefined && payload?.activeServerId === undefined) {
      throw new TunerError('errors.unknownLocale', { lang: '', list: LOCALES.join(', ') });
    }
    const patch = {};
    if (payload.lang !== undefined) {
      if (!LOCALES.includes(payload.lang)) throw new TunerError('errors.unknownLocale', { lang: String(payload.lang ?? ''), list: LOCALES.join(', ') });
      patch.lang = payload.lang;
    }
    if (payload.theme !== undefined) {
      if (!THEMES.includes(payload.theme)) throw new TunerError('errors.unknownTheme', { theme: String(payload.theme ?? ''), list: THEMES.join(', ') });
      patch.theme = payload.theme;
    }
    if (payload.profile !== undefined) patch.profile = knownProfile(payload.profile);
    if (payload.servers !== undefined) patch.servers = payload.servers;
    if (payload.activeServerId !== undefined) patch.activeServerId = payload.activeServerId;
    return { ...(await writeSettings(patch)), locales: LOCALES, themes: THEMES, profiles: PROFILES };
  },

  'GET /api/state': async (req, url, options) => {
    const hw = await detectHardware();
    const engines = await detectEngines(hw);
    const safeHw = (options?.isRemote || options?.serverMode) ? sanitizeHardware(hw) : hw;
    return { hw: safeHw, ...engines, busy };
  },

  'GET /api/install-plans': async (req, url) => ({ plans: await installPlans(url.searchParams.get('engine')) }),

  'POST /api/install': async (req) => {
    const { engine, planId } = await body(req);
    const plan = (await installPlans(engine)).find((p) => p.id === planId);
    if (!plan) throw new TunerError('errors.unknownInstallPlan');
    if (plan.needsSudo && process.platform !== 'win32') {
      // No TTY for a sudo password here: the user runs it in a terminal.
      return { manualCommand: plan.shell };
    }
    const job = createJob();
    runInstall(plan, (line) => job.emit({ type: 'log', line }))
      .then((r) => job.finish({ ok: r.code === 0, manual: r.manual }))
      .catch((e) => job.finish({ ok: false, ...errorBody(e) }));
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
    const context = Number(ctx) || 8192;
    const p = await tuner.plan(model, context);
    const { layerBytes, layerExpertBytes, kvHeadsPerLayer, swaLayers, ...meta } = p.model.meta;
    // What each load profile would do: a preview that never unloads or measures. The plan is still useful without it.
    const profiles = await tuner.profilePlan(model, context).catch(() => null);
    return { meta, maxContext: p.maxContext, candidates: p.candidates.map(slim), profiles };
  },

  'GET /api/presets': async (req, url) => ({ presets: await listPresets({ engine: url.searchParams.get('engine'), modelKey: url.searchParams.get('model') }) }),

  // The "Load" button: preset -> apply + load, or benchmark -> preset -> apply + load.
  'POST /api/load': async (req, url, { authorizeOllama } = {}) => {
    if (busy) throw new TunerError('errors.loadInProgress');
    const { engine, model, ctx, force = false, candidates = 3, profile } = await body(req);
    // An unknown profile is rejected before any job exists; without one the tuner uses its default.
    const options = { force, maxCandidates: Number(candidates) };
    if (authorizeOllama) options.authorizeOllama = authorizeOllama;
    if (profile !== undefined) options.profile = knownProfile(profile);
    const tuner = await Tuner.create(engine);
    const job = createJob();
    tuner.on('progress', (e) => job.emit(e));
    busy = true;
    tuner.load(model, Number(ctx), options)
      .then((r) => job.finish({ ok: !!r.loaded?.ok, result: { ...r, report: r.report && { ...r.report, best: r.report.best && { candidate: slim(r.report.best.candidate), bench: r.report.best.bench } } } }))
      .catch((e) => job.finish({ ok: false, ...errorBody(e) }))
      .finally(() => { busy = false; });
    return { jobId: job.id };
  },

  'POST /api/chat': async (req) => {
    const { engine, model, messages } = await body(req);
    if (!engine || !model || !Array.isArray(messages) || messages.length === 0) {
      throw new TunerError('errors.invalidChatRequest');
    }
    const e = ENGINES[engine];
    if (!e) throw new TunerError('errors.unknownEngine', { engine });
    const detection = await e.detect();
    const tuner = new Tuner(engine, detection);
    return tuner.chat(model, messages);
  },

  'GET /api/mcp/agents': async () => {
    const agents = await detectAgents();
    return { agents };
  },

  'POST /api/mcp/install': async (req) => {
    const payload = await body(req);
    if (!payload?.engineId || !payload?.customName) {
      throw new TunerError('errors.missingParameter', { param: 'engineId, customName' });
    }
    return installMcpServer({
      engineId: payload.engineId,
      customName: payload.customName,
      agentIds: Array.isArray(payload.agentIds) ? payload.agentIds : [],
      host: payload.host,
      apiKey: payload.apiKey
    });
  },
};


export async function getActiveRemoteServer({ options } = {}) {
  if (options?.serverMode === true) {
    return null;
  }

  const settings = await readSettings().catch(() => null);
  if (!settings || !settings.activeServerId || settings.activeServerId === 'local') {
    return null;
  }

  const server = settings.servers?.find((s) => s.id === settings.activeServerId);
  return (server && server.url) ? server : null;
}

export async function proxyToRemote(remoteServer, req, url, res) {
  const targetUrl = `${remoteServer.url.replace(/\/+$/, '')}${url.pathname}${url.search}`;
  const headers = {
    'Content-Type': req.headers['content-type'] || 'application/json',
  };

  if (remoteServer.token) {
    headers['Authorization'] = `Bearer ${remoteServer.token}`;
  }

  let body = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks);
  }

  try {
    const remoteRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body && body.length > 0 ? body : undefined,
    });

    const data = await remoteRes.json().catch(() => ({}));
    return send(res, remoteRes.status, data);
  } catch (err) {
    return send(res, 502, { error: err.message, code: 'web.serverConnectionFailed' });
  }
}

async function handler(req, res, options = {}) {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
      });
      return res.end();
    }

    const ip = req.socket?.remoteAddress;
    const loopback = isLoopback(ip);
    const isRemote = !loopback || !!options.serverMode;

    if (options.token || isRemote) {
      if (!verifyToken(req, options.token)) {
        return send(res, 401, { error: 'Unauthorized', code: 'errors.unauthorized' });
      }
    }

    if (isRemote && req.method === 'POST' && url.pathname === '/api/install') {
      return send(res, 403, { error: 'Forbidden', code: 'errors.forbiddenRemote' });
    }

    // A foreign website must not trigger the desktop's privileged authorizer.
    if (options.authorizeOllama && req.method === 'POST' && req.headers.origin && req.headers.origin !== `http://127.0.0.1:${req.socket.localPort}`) return send(res, 403, { error: 'Forbidden origin' });

    const activeRemote = await getActiveRemoteServer({ options });
    if (activeRemote) {
      const ev = url.pathname.match(/^\/api\/jobs\/([\w-]+)\/events$/);
      if (ev) {
        try {
          const targetUrl = `${activeRemote.url.replace(/\/+$/, '')}${url.pathname}${url.search}`;
          const headers = {};
          if (activeRemote.token) {
            headers['Authorization'] = `Bearer ${activeRemote.token}`;
          }

          const remoteRes = await fetch(targetUrl, { method: 'GET', headers });
          res.writeHead(remoteRes.status, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });

          const reader = remoteRes.body.getReader();
          req.on('close', () => reader.cancel().catch(() => {}));
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
          } finally {
            res.end();
          }
          return;
        } catch (err) {
          return send(res, 502, { error: err.message, code: 'web.serverConnectionFailed' });
        }
      }

      const PROXIED_PATHS = ['/api/state', '/api/models', '/api/plan', '/api/presets', '/api/load', '/api/chat'];
      if (PROXIED_PATHS.includes(url.pathname)) {
        return await proxyToRemote(activeRemote, req, url, res);
      }
    }

    // Server-Sent Events for job progress.
    const ev = url.pathname.match(/^\/api\/jobs\/([\w-]+)\/events$/);
    if (ev) {
      const job = jobs.get(ev[1]);
      if (!job) return send(res, 404, { error: 'job not found' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      const write = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
      job.events.forEach(write);
      if (job.done) return res.end();
      const l = (e) => { write(e); if (e.type === 'finished') res.end(); };
      job.listeners.add(l);
      req.on('close', () => job.listeners.delete(l));
      return;
    }
    const route = routes[`${req.method} ${url.pathname}`];
    if (route) return send(res, 200, await route(req, url, { ...options, isRemote }));

    const i18n = url.pathname.match(/^\/api\/i18n\/([\w-]+)$/);
    if (i18n && req.method === 'GET') {
      if (!LOCALES.includes(i18n[1])) return send(res, 404, { error: 'not found' });
      return send(res, 200, { lang: i18n[1], messages: messagesFor(i18n[1]) });
    }
    // The browser shares t()'s formatting with Node; nothing else under src/i18n is exposed.
    if (url.pathname === '/i18n/core.js') {
      res.writeHead(200, { 'Content-Type': MIME['.js'] });
      return res.end(await fs.readFile(I18N_CORE));
    }

    // Static files.
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
    const data = await fs.readFile(file).catch(() => null);
    if (!data) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    send(res, e instanceof TunerError ? 400 : 500, errorBody(e));
  }
}

/** Start the local or remote server. */
export function startServer({ port = Number(process.env.PORT) || 7860, host = '127.0.0.1', token = null, serverMode = false, open = false, authorizeOllama } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => handler(req, res, { authorizeOllama, token, serverMode, host }));
    server.on('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const resolvedPort = typeof addr === 'string' ? addr : addr.port;
      const connectableHost = resolveConnectableHost(host);
      const url = `http://${connectableHost}:${resolvedPort}`;
      console.log(`LLM Tuner available at ${url}`);
      if (open) openUrl(url);
      resolve({ server, url, port: resolvedPort });
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  startServer({ open: process.argv.includes('--open') });
}
