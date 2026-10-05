import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { configDir, readJson, GiB } from './util.js';
import { DEFAULT_PROFILE, normalizeProfile } from './profiles.js';

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

/** Returns the path to the preset file. */
export function presetPath(engine, modelKey, ctx, profile = DEFAULT_PROFILE) {
  // The profile is part of the file name: anything that is not a known profile is balanced.
  const safe = normalizeProfile(profile);
  const suffix = safe === DEFAULT_PROFILE ? '' : `__${safe}`;
  return path.join(presetsDir(), `${engine}__${slug(modelKey)}__${ctx}${suffix}.json`);
}

/** Identifies the downloaded variants of a model (keys + file sizes), order independent. */
export function variantsSignature(variants) {
  if (!Array.isArray(variants) || !variants.length) return '';
  return variants.map((v) => `${v.key}:${v.sizeBytes}`).sort().join('|');
}

/** Return the preset if it exists and was measured on this hardware/model/variants file. */
export async function findPreset({ engine, modelKey, ctx, hw, modelBytes, profile: rawProfile = DEFAULT_PROFILE, variants }) {
  const profile = normalizeProfile(rawProfile);
  // A preset without a profile field is a balanced preset.
  const p = await readJson(presetPath(engine, modelKey, ctx, profile));
  if (!p) return { preset: null, reason: 'none' };
  if (p.fingerprint !== hardwareFingerprint(hw)) return { preset: null, stale: p, reason: 'hardware' };
  if (profile !== DEFAULT_PROFILE && Array.isArray(variants)) {
    const signature = variantsSignature(variants);
    if (signature !== variantsSignature(p.variants)) {
      return { preset: null, stale: p, reason: 'variants' };
    }
    // Engines report [] when listing fails: an empty signature proves nothing, so the model file size decides.
    if (signature) return { preset: p, reason: 'hit' };
  }
  if (modelBytes && p.modelBytes && p.modelBytes !== modelBytes) {
    return { preset: null, stale: p, reason: 'model' };
  }
  return { preset: p, reason: 'hit' };
}

/** Save the winner of a measurement as the preset of its profile. */
export async function savePreset({ engine, modelKey, ctx, hw, modelBytes, best, results, profile: rawProfile = DEFAULT_PROFILE, variant = null, variants = null }) {
  // An unknown profile is stored as balanced, never as part of a file name.
  const profile = normalizeProfile(rawProfile);
  const { placement, score, ...candidate } = best.candidate;
  const preset = {
    version: 1,
    engine,
    model: modelKey,
    ctx,
    profile,
    modelBytes: modelBytes || null,
    fingerprint: hardwareFingerprint(hw),
    hardware: { cpu: hw.cpu.brand, gpus: hw.gpus.map((g) => ({ index: g.index, name: g.name, totalBytes: g.totalBytes, pcieGen: g.pcieGen, pcieWidth: g.pcieWidth })) },
    createdAt: new Date().toISOString(),
    candidate,
    bench: best.bench,
    tried: (results || []).map((r) => ({ id: r.candidate.id, ok: r.bench.ok, error: r.bench.error || null, shortTps: r.bench.short?.genTps ?? null, deepTps: r.bench.deep?.genTps ?? null })),
  };
  if (profile !== DEFAULT_PROFILE) {
    Object.assign(preset, { variant, variants: Array.isArray(variants) ? [...variants].map((v) => ({ key: v.key, sizeBytes: v.sizeBytes })).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : null });
  }
  const file = presetPath(engine, modelKey, ctx, profile);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(preset, null, 2));
  return { file, preset };
}

/** All presets for a model (to show which contexts and profiles are already tuned). */
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
    out.push({ file: path.join(dir, f), engine: p.engine, model: p.model, ctx: p.ctx, profile: p.profile || 'balanced', variant: p.variant?.key || null, createdAt: p.createdAt, fingerprint: p.fingerprint, kvType: p.candidate.kvType, fullOffload: p.candidate.fullOffload, shortTps: p.bench?.short?.genTps, deepTps: p.bench?.deep?.genTps });
  }
  return out.sort((a, b) => a.ctx - b.ctx || a.profile.localeCompare(b.profile));
}
