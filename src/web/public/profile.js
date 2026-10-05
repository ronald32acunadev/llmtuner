// View-model of the load profile selector. Pure: no DOM and no imports, so the browser and the Node tests load the same file.
// `plan` is the `profiles` object of POST /api/plan (a `Tuner.profilePlan()` result), or null while there is none;
// `t(key, params)` translates a catalog key.

export const PROFILE_IDS = Object.freeze(['speed', 'balanced', 'quality']);
export const DEFAULT_PROFILE = 'balanced';

// Reasons of a `variant-picked` event that mean the profile could not be honoured: the core flags them with a `profile-fallback` event right after.
const FALLBACK_REASONS = new Set(['profile.variant.noFullGpu']);

/** Profile to preselect: the one stored in the settings, else the recommended one, else balanced. */
export function initialProfile(settingsProfile, plan) {
  return settingsProfile ?? plan?.recommended?.profile ?? DEFAULT_PROFILE;
}

/** The options of the selector as `{ id, name, description, recommended }`; none is recommended without a plan. */
export function profileOptions(plan, t, ids = PROFILE_IDS) {
  return ids.map((id) => ({
    id,
    name: t(`profile.name.${id}`),
    description: t(`profile.desc.${id}`),
    recommended: id === plan?.recommended?.profile,
  }));
}

/**
 * Lines under the selector for the chosen profile, as `{ kind, level, text }`: what will load and why (`detail`),
 * why a profile is recommended (`recommend`), a warning that the preview is conservative while VRAM is in use (`busy`),
 * one estimate per heavier variant that would fit (`hint`) and the advice to select another variant in the engine (`switch`).
 * Empty without a plan.
 */
export function profileDetailLines(plan, profile, t, { engineName, formatBytes }) {
  const info = plan?.profiles?.[profile];
  if (!info) return [];
  // What the engine will load: the selected variant when it cannot switch to the profile's pick.
  const loaded = plan.variants.find((v) => v.key === info.loads);
  const detail = t('web.profileDetail', { quant: loaded?.quant ?? info.loads, kv: info.kvTypes.join(', ') });
  const reason = t(info.reasonCode, { quant: info.quant ?? '?', key: info.variant });
  const lines = [{ kind: 'detail', level: info.fallback ? 'warn' : 'note', text: `${detail} ${reason}` }];

  if (plan.recommended?.reasonCode) {
    lines.push({ kind: 'recommend', level: 'note', text: t(plan.recommended.reasonCode) });
  }
  // The plan was made with the VRAM that is free now; a real load frees it first.
  if (plan.vramBusy) {
    lines.push({ kind: 'busy', level: 'warn', text: t('profile.preview.vramBusy') });
  }
  for (const hint of plan.hints ?? []) {
    lines.push({ kind: 'hint', level: 'note', text: t('web.profileHint', { quant: hint.quant, size: formatBytes(hint.estimatedBytes) }) });
  }
  if (info.recommendSwitch) {
    lines.push({ kind: 'switch', level: 'note', text: t('web.profileSwitch', { quant: info.quant ?? info.variant, engine: engineName }) });
  }
  return lines;
}

/**
 * Lines to log for a `variant-picked` or `profile-fallback` progress event, as `{ text, level }` with level `note` or `warn`.
 * `previous` is the progress event before it; without `engineName` the switch advice is left out.
 */
export function profileEventLines(event, t, { engineName = null, previous = null } = {}) {
  const { variant } = event;
  // Nothing to say without the variant; throwing here would break the progress handler of a running load.
  if (!variant) return [];
  const isFallback = event.type === 'profile-fallback';
  const lines = [];

  // A fallback that repeats the reason of the line before it is not logged again.
  if (!(isFallback && event.reasonCode === previous?.reasonCode)) {
    const level = isFallback || FALLBACK_REASONS.has(event.reasonCode) ? 'warn' : 'note';
    lines.push({ text: t(event.reasonCode, { quant: variant.quant ?? '?', key: variant.key }), level });
  }

  // The engine cannot load the pick itself: tell the user which variant to select there.
  if (event.type === 'variant-picked' && event.recommendSwitch && engineName) {
    lines.push({ text: t('web.profileSwitch', { quant: variant.quant ?? variant.key, engine: engineName }), level: 'note' });
  }

  return lines;
}

/** Presets measured with a profile; an entry saved before profiles existed has none and counts as balanced. */
export function presetsFor(presets, profile) {
  return presets.filter((p) => (p.profile || DEFAULT_PROFILE) === profile);
}

/** The preset of a context and profile, or null. */
export function presetFor(presets, ctx, profile) {
  return presetsFor(presets, profile).find((p) => p.ctx === ctx) ?? null;
}

/** True when an answer requested for an engine and model still belongs to the selection; the context is ignored. */
export function isCurrentModel(requested, current) {
  return requested.engine === current.engine && requested.model === current.model;
}

/** True when a plan requested for an engine, model and context is still the plan of the selection. */
export function isCurrentPlan(requested, current) {
  return isCurrentModel(requested, current) && requested.ctx === current.ctx;
}
