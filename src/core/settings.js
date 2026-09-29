import fs from 'node:fs/promises';
import path from 'node:path';
import { configDir, readJson } from './util.js';
import { normalizeLocale } from '../i18n/core.js';

// User preferences shared by the CLI, the web UI and Electron.

export const settingsPath = () => path.join(configDir(), 'settings.json');

/** Current settings. A missing, corrupt or hand-edited file yields the defaults; never throws. */
export async function readSettings() {
  const s = await readJson(settingsPath(), null);
  return { lang: normalizeLocale(s?.lang) };
}

/** Merge `patch` into the saved settings and write them. */
export async function writeSettings(patch) {
  const current = await readJson(settingsPath(), null);
  const next = { ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}), ...patch };
  next.lang = normalizeLocale(next.lang);
  await fs.mkdir(configDir(), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(next, null, 2));
  return { lang: next.lang };
}
