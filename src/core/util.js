import { execFile, spawn } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';

export const PLATFORM = process.platform; // 'linux' | 'win32' | 'darwin'
export const MiB = 1024 * 1024;
export const GiB = 1024 * MiB;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run a command, resolve {code, stdout, stderr}; never rejects. */
export function run(cmd, args = [], opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 30_000, maxBuffer: 64 * MiB, windowsHide: true, ...opts }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), error: err });
    });
  });
}

/** Locate an executable on PATH (plus extra candidate paths). */
export async function which(name, extra = []) {
  const exts = PLATFORM === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const c of extra) if (await exists(c)) return c;
  for (const d of dirs) {
    for (const e of exts) {
      const p = path.join(d, name + e);
      if (await exists(p)) return p;
    }
  }
  return null;
}

export async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function readJson(p, fallback = null) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fallback; }
}

/** Write JSON atomically, keeping a timestamped backup of the previous file. */
export async function writeJsonWithBackup(p, data, { indent = 2 } = {}) {
  let backup = null;
  if (await exists(p)) {
    backup = `${p}.bak-llm-tuner-${timestamp()}`;
    await fs.copyFile(p, backup);
  } else {
    await fs.mkdir(path.dirname(p), { recursive: true });
  }
  const tmp = `${p}.tmp-${process.pid}`;
  await fs.writeFile(tmp, indent ? JSON.stringify(data, null, indent) : JSON.stringify(data));
  await fs.rename(tmp, p);
  return backup;
}

export function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export function fmtBytes(b) {
  if (b == null || Number.isNaN(b)) return '?';
  if (Math.abs(b) >= GiB) return `${(b / GiB).toFixed(2)} GiB`;
  return `${Math.round(b / MiB)} MiB`;
}

export const homeDir = () => os.homedir();

/** Fetch JSON with timeout; returns null on network failure. */
export async function fetchJson(url, { method = 'GET', body, timeout = 5000, headers = {} } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      signal: ctl.signal,
      headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { ok: res.ok, status: res.status, json, text };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Find a free TCP port on localhost. */
export async function freePort() {
  const net = await import('node:net');
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Spawn a long-running process, capturing its output into a ring buffer. */
export function spawnLogged(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  const lines = [];
  const push = (buf) => {
    for (const l of String(buf).split(/\r?\n/)) if (l) { lines.push(l); if (lines.length > 400) lines.shift(); }
  };
  child.stdout?.on('data', push);
  child.stderr?.on('data', push);
  const exited = new Promise((r) => child.on('exit', (code, signal) => r({ code, signal })));
  return { child, lines, exited };
}

export async function killProcess(child, graceMs = 5000) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  child.kill(PLATFORM === 'win32' ? undefined : 'SIGTERM');
  const done = await Promise.race([new Promise((r) => child.once('exit', () => r(true))), sleep(graceMs).then(() => false)]);
  if (!done) child.kill('SIGKILL');
}

/** Sample overall CPU busy % between two os.cpus() snapshots (cross-platform). */
export function cpuSnapshot() {
  return os.cpus().map((c) => ({ ...c.times }));
}
export function cpuBusyPercent(a, b) {
  let idle = 0, total = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const ta = a[i], tb = b[i];
    const t = (tb.user - ta.user) + (tb.nice - ta.nice) + (tb.sys - ta.sys) + (tb.idle - ta.idle) + (tb.irq - ta.irq);
    idle += tb.idle - ta.idle;
    total += t;
  }
  return total > 0 ? 100 * (1 - idle / total) : 0;
}
