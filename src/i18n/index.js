import en from './en.js';
import es from './es.js';
import { LOCALES, DEFAULT_LOCALE, normalizeLocale, format } from './core.js';

export { LOCALES, DEFAULT_LOCALE, normalizeLocale, format };

export const CATALOGS = { en, es };

/** Translate `key`; falls back to English, then to the key itself so gaps are visible. */
export function t(locale, key, params) {
  return format(CATALOGS[normalizeLocale(locale)][key] ?? CATALOGS.en[key] ?? key, params);
}

/** Full message table for a locale, with English filling any gap. */
export function messagesFor(locale) {
  return { ...CATALOGS.en, ...CATALOGS[normalizeLocale(locale)] };
}

/** Text for an error: TunerErrors are translated, anything else is shown as-is. */
export function errorText(locale, err) {
  if (err?.name === 'TunerError' && err.code) return t(locale, err.code, err.params);
  return String(err?.message ?? err);
}
