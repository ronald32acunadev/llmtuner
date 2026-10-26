import fs from 'node:fs/promises';
import path from 'node:path';
import { configDir, readJson } from './util.js';
import { normalizeLocale } from '../i18n/core.js';
import { PROFILES } from './profiles.js';

// User preferences shared by the CLI, the web UI and Electron.

export const THEMES = Object.freeze(['system', 'light', 'dark']);
export const DEFAULT_THEME = 'system';

export const DEFAULT_SERVERS = Object.freeze([
  Object.freeze({ id: 'local', name: 'Local Machine', url: 'http://127.0.0.1:7860', token: null }),
]);
export const DEFAULT_ACTIVE_SERVER_ID = 'local';

/** Returns the value if it is a valid profile, otherwise null. */
function storedProfile(value) {
  return PROFILES.includes(value) ? value : null;
}

export function normalizeTheme(theme) {
  return THEMES.includes(theme) ? theme : DEFAULT_THEME;
}

export function normalizeServers(servers) {
  if (!Array.isArray(servers)) return [...DEFAULT_SERVERS];
  const list = servers
    .filter((s) => s && typeof s === 'object' && s.id)
    .map((s) => ({
      id: String(s.id),
      name: String(s.name || s.id),
      url: String(s.url || '').replace(/\/+$/, ''),
      token: s.token ? String(s.token) : null,
    }));
  if (list.length === 0) return [...DEFAULT_SERVERS];
  if (!list.some((s) => s.id === 'local')) {
    list.unshift(DEFAULT_SERVERS[0]);
  }
  return list;
}

export function normalizeActiveServerId(activeId, servers) {
  const list = normalizeServers(servers);
  return list.some((s) => s.id === activeId) ? activeId : DEFAULT_ACTIVE_SERVER_ID;
}

export function getActiveServer(settings) {
  const servers = normalizeServers(settings?.servers);
  const activeId = normalizeActiveServerId(settings?.activeServerId, servers);
  return servers.find((s) => s.id === activeId) || servers[0];
}

export const settingsPath = () => path.join(configDir(), 'settings.json');

/** Current settings. A missing, corrupt or hand-edited file yields the defaults; never throws. */
export async function readSettings() {
  const s = await readJson(settingsPath(), null);
  const servers = normalizeServers(s?.servers);
  const activeServerId = normalizeActiveServerId(s?.activeServerId, servers);
  return {
    lang: normalizeLocale(s?.lang),
    theme: normalizeTheme(s?.theme),
    profile: storedProfile(s?.profile),
    servers,
    activeServerId,
  };
}

/** Merge `patch` into the saved settings and write them. */
export async function writeSettings(patch) {
  const current = await readJson(settingsPath(), null);
  const base = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  const lang = normalizeLocale(patch?.lang !== undefined ? patch.lang : base.lang);
  const theme = normalizeTheme(patch?.theme !== undefined ? patch.theme : base.theme);
  const profile = storedProfile(patch?.profile) ?? base.profile;
  const servers = patch?.servers !== undefined ? normalizeServers(patch.servers) : normalizeServers(base.servers);
  const activeServerId = patch?.activeServerId !== undefined
    ? normalizeActiveServerId(patch.activeServerId, servers)
    : normalizeActiveServerId(base.activeServerId, servers);

  const next = { ...base, ...patch, lang, theme, profile, servers, activeServerId };
  await fs.mkdir(configDir(), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(next, null, 2));
  return {
    lang: next.lang,
    theme: next.theme,
    profile: storedProfile(next.profile),
    servers: next.servers,
    activeServerId: next.activeServerId,
  };
}
