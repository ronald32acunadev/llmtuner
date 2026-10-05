// Pure helpers of the CLI profile step: no top-level side effects, so the tests import them without starting the wizard.
import { PROFILES, fmtBytes } from '../core/index.js';

// Reasons of a `variant-picked` event that mean the profile could not be honoured: the core flags them with a `profile-fallback` event right after.
export const FALLBACK_REASONS = new Set(['profile.variant.noFullGpu']);

/** True when the CLI has to ask for the load profile; `args` are the parsed flags. */
export function shouldAskProfile(args) {
  if (args.profile || args.yes || args.json) return false;
  // Engine, model and context all from flags: a scripted run that asked nothing before the profiles existed, so it stays prompt-free.
  const flagged = Boolean(args.engine && args.model && Number(args.ctx));
  return !flagged;
}

/** Choices and preselection for the profile prompt, from a `Tuner.profilePlan()` result. */
export function profileChoices(plan, t, { stored = null, mark = (s) => s, dim = (s) => s } = {}) {
  const choices = PROFILES.map((profile) => {
    const info = plan.profiles[profile];
    // What the engine will load: the selected variant when it cannot switch to the profile's pick.
    const variant = plan.variants.find((v) => v.key === info.loads);
    const quant = variant?.quant ?? null;
    const uses = quant ? `${quant} · KV ${info.kvTypes.join(', ')}` : `KV ${info.kvTypes.join(', ')}`;
    const name = `${t(`profile.name.${profile}`)}  ${dim(`${t(`profile.desc.${profile}`)} · ${uses}`)}`;
    const isRecommended = profile === plan.recommended.profile;
    return {
      name: isRecommended ? `${name}${mark(`  ${t('cli.recommended')}`)}` : name,
      value: profile,
      short: t(`profile.name.${profile}`),
    };
  });
  return { choices, default: stored ?? plan.recommended.profile };
}

/** Lines shown with the profile prompt: why a profile is recommended and which heavier variants would fit. */
export function profileNotes(plan, t) {
  const notes = [t(plan.recommended.reasonCode)];
  for (const h of plan.hints) {
    notes.push(t('cli.profileHint', { quant: h.quant, size: fmtBytes(h.estimatedBytes) }));
  }
  return notes;
}

/** Advice to select another variant in the engine, or null when the profile loads its own pick. */
export function profileSwitchNote(plan, profile, t, engine) {
  const info = plan.profiles[profile];
  if (!info?.recommendSwitch) return null;
  return t('cli.profileSwitch', { quant: info.quant ?? info.variant, engine });
}

/** Lines to print for a `variant-picked` or `profile-fallback` event, as `{ text, level }` with level `note` or `warn`; `previous` is the event before it and `engine` the engine name, or null to leave the switch advice out. */
export function profileEventLines(event, previous, t, engine = null) {
  const { variant } = event;
  // Nothing to say without the variant; throwing here would reject the load from inside the progress listener.
  if (!variant) return [];
  const isFallback = event.type === 'profile-fallback';
  const lines = [];

  // A fallback that repeats the reason of the line before it is not printed again.
  if (!(isFallback && event.reasonCode === previous?.reasonCode)) {
    const level = isFallback || FALLBACK_REASONS.has(event.reasonCode) ? 'warn' : 'note';
    lines.push({ text: t(event.reasonCode, { quant: variant.quant ?? '?', key: variant.key }), level });
  }

  // The engine cannot load the pick itself: tell the user which variant to select there.
  if (event.type === 'variant-picked' && event.recommendSwitch && engine) {
    lines.push({ text: t('cli.profileSwitch', { quant: variant.quant ?? variant.key, engine }), level: 'note' });
  }

  return lines;
}
