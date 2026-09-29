import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { configDir, readJson, GiB } from './util.js';

// A preset stores the benchmark winner for (engine, model, context, hardware),
// so the tuning scripts only run again when one of those changes.

export function presetsDir() {
  return path.join(configDir(), 'presets');
}

/** Identifies the hardware a preset was measured on (GPU models + VRAM + CPU). */
export function hardwareFingerprint(hw) {
  const parts = [
    hw.cpu.brand,
    ...hw.gpus.map((g) => `${g.name}|${Math.round(g.totalBytes / GiB)}G|pcie${g.pcieGen ?? '?'}x${g.pcieWidth ?? '?'}`).sort(),
  ];
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16);
}

const slug = (s) => s.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);

export function presetPath(engine, modelKey, ctx) {
  return path.join(presetsDir(), `${engine}__${slug(modelKey)}__${ctx}.json`);
}

/** Return the preset if it exists and was measured on this hardware/model file. */
export async function findPreset({ engine, modelKey, ctx, hw, modelBytes }) {
  const p = await readJson(presetPath(engine, modelKey, ctx));
  if (!p) return { preset: null, reason: 'none' };
  if (p.fingerprint !== hardwareFingerprint(hw)) return { preset: null, stale: p, reason: 'hardware' };
  if (modelBytes && p.modelBytes && p.modelBytes !== modelBytes) return { preset: null, stale: p, reason: 'model' };
  return { preset: p, reason: 'hit' };
}

export async function savePreset({ engine, modelKey, ctx, hw, modelBytes, best, results }) {
  const { placement, score, ...candidate } = best.candidate;
  const preset = {
    version: 1,
    engine,
    model: modelKey,
    ctx,
    modelBytes: modelBytes || null,
    fingerprint: hardwareFingerprint(hw),
    hardware: { cpu: hw.cpu.brand, gpus: hw.gpus.map((g) => ({ index: g.index, name: g.name, totalBytes: g.totalBytes, pcieGen: g.pcieGen, pcieWidth: g.pcieWidth })) },
    createdAt: new Date().toISOString(),
    candidate,
    bench: best.bench,
    tried: (results || []).map((r) => ({ id: r.candidate.id, ok: r.bench.ok, error: r.bench.error || null, shortTps: r.bench.short?.genTps ?? null, deepTps: r.bench.deep?.genTps ?? null })),
  };
  const file = presetPath(engine, modelKey, ctx);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(preset, null, 2));
  return { file, preset };
}

/** All presets for a model (to show which contexts are already tuned). */
export async function listPresets({ engine, modelKey } = {}) {
  const dir = presetsDir();
  const files = await fs.readdir(dir).catch(() => []);
  const out = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const p = await readJson(path.join(dir, f));
    if (!p) continue;
    if (engine && p.engine !== engine) continue;
    if (modelKey && p.model !== modelKey) continue;
    out.push({ file: path.join(dir, f), engine: p.engine, model: p.model, ctx: p.ctx, createdAt: p.createdAt, fingerprint: p.fingerprint, kvType: p.candidate.kvType, fullOffload: p.candidate.fullOffload, shortTps: p.bench?.short?.genTps, deepTps: p.bench?.deep?.genTps });
  }
  return out.sort((a, b) => a.ctx - b.ctx);
}
