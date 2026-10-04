import { KV_TYPES, placeLayers } from './estimator.js';

// Load profiles: what the tuner optimizes for. Lossless choices (layer placement, GPU order,
// threads) apply to every profile; a profile only governs the lossy ones (weight quantization
// and KV cache type).
export const PROFILES = Object.freeze(['speed', 'balanced', 'quality']);
export const DEFAULT_PROFILE = 'balanced';

/** Returns the profile or the default if invalid. */
export function normalizeProfile(p) {
  return PROFILES.includes(p) ? p : DEFAULT_PROFILE;
}

// KV cache types precise enough for the quality profile.
export const QUALITY_KV_TYPES = Object.freeze(['f16', 'q8_0']);

/** Returns allowed KV types for a profile. */
export function kvTypesFor(profile, engineKvTypes) {
  if (profile === 'quality') {
    const allowed = engineKvTypes.filter((k) => QUALITY_KV_TYPES.includes(k));
    if (allowed.length > 0) return allowed;
  }
  return engineKvTypes;
}

/** Checks if a candidate meets the quality profile criteria. */
export function meetsQuality(candidate) {
  return candidate.fullOffload === true && !candidate.cpuMoeLayers && QUALITY_KV_TYPES.includes(candidate.kvType);
}

const tps = (r) => r.bench.deep?.genTps ?? r.bench.short.genTps;
const kvQuality = (r) => KV_TYPES[r.candidate.kvType].quality;
// Best element by a comparator, without touching the input (ties keep input order).
const top = (list, compare) => [...list].sort(compare)[0] || null;

/** Pick the winner of a measurement with the rule of the profile. */
export function pickBest(results, profile = DEFAULT_PROFILE) {
  const ok = results.filter((r) => r.bench?.ok);
  const balanced = (a, b) => tps(b) * kvQuality(b) - tps(a) * kvQuality(a);
  if (profile === 'speed') return top(ok, (a, b) => tps(b) - tps(a));
  if (profile === 'quality') {
    const precise = ok.filter((r) => meetsQuality(r.candidate));
    if (precise.length > 0) return top(precise, (a, b) => kvQuality(b) - kvQuality(a) || tps(b) - tps(a));
  }
  return top(ok, balanced);
}

/** True when the model fits fully on GPU with at least one of the KV types. */
export function fitsFullyOnGpu(meta, hw, { ctx, kvTypes }) {
  return kvTypes.some((kvType) => placeLayers(meta, hw.gpus, { ctx, kvType }).fullOffload);
}

const selectedVariant = (variants) => variants.find((v) => v.selected) || variants[0] || null;

// Lightest first. Bits per weight orders variants; file size is the fallback when any lacks it.
const byWeight = (variants) => {
  const fallback = variants.some((v) => v.meta.bitsPerWeight == null);
  return [...variants].sort((a, b) => fallback ? a.meta.fileBytes - b.meta.fileBytes : a.meta.bitsPerWeight - b.meta.bitsPerWeight);
};

/** Pick the model variant a profile loads (or recommends), with the reason as a code. */
export function pickVariant(profile, variants, hw, { ctx, kvTypes }) {
  if (!variants.length) return { variant: null, reasonCode: 'profile.variant.none', fallback: false };
  if (profile === 'speed') return { variant: byWeight(variants)[0], reasonCode: 'profile.variant.lightest', fallback: false };
  if (profile === 'quality') {
    const allowed = kvTypesFor('quality', kvTypes);
    const heaviestFit = byWeight(variants).reverse().find((v) => fitsFullyOnGpu(v.meta, hw, { ctx, kvTypes: allowed }));
    return heaviestFit
      ? { variant: heaviestFit, reasonCode: 'profile.variant.heaviestFit', fallback: false }
      : { variant: selectedVariant(variants), reasonCode: 'profile.variant.noFullGpu', fallback: true };
  }
  return { variant: selectedVariant(variants), reasonCode: 'profile.variant.selected', fallback: false };
}

/** Recommend the highest-quality profile whose outcome stays fully on GPU. */
export function recommendProfile(variants, hw, { ctx, kvTypes }) {
  const quality = pickVariant('quality', variants, hw, { ctx, kvTypes });
  if (quality.variant && !quality.fallback) return { profile: 'quality', reasonCode: 'profile.recommend.qualityFits' };
  const selected = selectedVariant(variants);
  if (selected && fitsFullyOnGpu(selected.meta, hw, { ctx, kvTypes })) {
    return { profile: 'balanced', reasonCode: 'profile.recommend.balancedFits' };
  }
  return { profile: 'speed', reasonCode: 'profile.recommend.partialOffload' };
}

// Heavier quantizations worth hinting at, with their bits per weight.
// Source: llama.cpp tools/quantize/README.md, Llama-3.1-8B table.
export const HINT_TARGETS = Object.freeze([
  { quant: 'Q8_0', bitsPerWeight: 8.5008 },
  { quant: 'Q6_K', bitsPerWeight: 6.5633 },
  { quant: 'Q5_K_M', bitsPerWeight: 5.7036 },
]);

/** Heavier quantizations, not downloaded, that would still fit fully on GPU (sizes estimated). */
export function variantHints(meta, hw, { ctx, kvTypes, downloadedQuants = [] }) {
  if (!meta.bitsPerWeight) return [];
  const allowed = kvTypesFor('quality', kvTypes);
  const downloaded = downloadedQuants.map((q) => String(q).toLowerCase());
  const results = [];
  for (const target of HINT_TARGETS) {
    if (target.bitsPerWeight <= meta.bitsPerWeight) continue;
    if (downloaded.includes(target.quant.toLowerCase())) continue;
    const scale = target.bitsPerWeight / meta.bitsPerWeight;
    const scaled = {
      ...meta,
      layerBytes: meta.layerBytes.map((b) => b * scale),
      layerExpertBytes: meta.layerExpertBytes.map((b) => b * scale),
      outputBytes: meta.outputBytes * scale,
      embdBytes: meta.embdBytes * scale,
      fileBytes: meta.fileBytes * scale,
    };
    if (fitsFullyOnGpu(scaled, hw, { ctx, kvTypes: allowed })) {
      results.push({
        quant: target.quant,
        bitsPerWeight: target.bitsPerWeight,
        estimatedBytes: Math.round(scaled.fileBytes),
      });
    }
  }
  return results;
}
