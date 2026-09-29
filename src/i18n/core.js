// Locale helpers shared by Node and the browser (served at /i18n/core.js). No imports.

export const LOCALES = ['en', 'es'];
export const DEFAULT_LOCALE = 'en';

export const normalizeLocale = (value) => (LOCALES.includes(value) ? value : DEFAULT_LOCALE);

/** Replace {name} with params.name. Missing or null params stay visible as {name}. */
export function format(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (params?.[name] ?? null) === null ? match : String(params[name]));
}
