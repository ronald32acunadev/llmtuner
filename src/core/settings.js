import fs from 'node:fs/promises';
import path from 'node:path';
import { configDir, readJson } from './util.js';
import { normalizeLocale } from '../i18n/core.js';
import { PROFILES } from './profiles.js';

// User preferences shared by the CLI, the web UI and Electron.

export const THEMES = Object.freeze(['system', 'light', 'dark']);
export const DEFAULT_THEME = 'system';

/** Returns the value if it is a valid profile, otherwise null. */
function storedProfile(value) {
  return PROFILES.includes(value) ? value : null;
}

export function normalizeTheme(theme) {
  return THEMES.includes(theme) ? theme : DEFAULT_THEME;
}

export const settingsPath = () => path.join(configDir(), 'settings.json');

/** Current settings. A missing, corrupt or hand-edited file yields the defaults; never throws. */
export async function readSettings() {
  const s = await readJson(settingsPath(), null);
  return {
    lang: normalizeLocale(s?.lang),
    theme: normalizeTheme(s?.theme),
    profile: storedProfile(s?.profile),
  };
}

/** Merge `patch` into the saved settings and write them. */
export async function writeSettings(patch) {
  const current = await readJson(settingsPath(), null);
  const base = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  const lang = normalizeLocale(patch?.lang !== undefined ? patch.lang : base.lang);
  const theme = normalizeTheme(patch?.theme !== undefined ? patch.theme : base.theme);
  const profile = storedProfile(patch?.profile) ?? base.profile;
  const next = { ...base, ...patch, lang, theme, profile };
  await fs.mkdir(configDir(), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(next, null, 2));
  return { lang: next.lang, theme: next.theme, profile: storedProfile(next.profile) };
}
