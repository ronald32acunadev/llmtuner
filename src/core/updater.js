import fs from 'node:fs/promises';
import path from 'node:path';
import { configDir, readJson, fetchJson } from './util.js';

const pkgUrl = new URL('../../package.json', import.meta.url);
const pkgContent = await fs.readFile(pkgUrl, 'utf8');
export const CURRENT_VERSION = JSON.parse(pkgContent).version;

export const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org/llm-tuner/latest';
export const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const updateCachePath = () => path.join(configDir(), 'update-check.json');

/**
 * Parse a semver string into [major, minor, patch] numbers.
 * Strips any leading 'v' and ignores pre-release/build identifiers.
 */
export function parseSemver(v) {
  if (typeof v !== 'string') return null;
  const clean = v.trim().replace(/^v/, '');
  const [core] = clean.split('-');
  const parts = core.split('.').map((p) => Number(p));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n) || n < 0)) return null;
  return parts.slice(0, 3);
}

/**
 * Returns true if `latest` is strictly newer than `current`.
 */
export function isNewerVersion(latest, current) {
  const l = parseSemver(latest);
  const c = parseSemver(current);
  if (!l || !c) return false;
  for (let i = 0; i < 3; i++) {
    if (l[i] > c[i]) return true;
    if (l[i] < c[i]) return false;
  }
  return false;
}

/**
 * Checks npm registry for updates with a 24h cache.
 * Never throws; returns safe fallback on network or file errors.
 */
export async function checkUpdate({
  force = false,
  timeout = 2000,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  registryUrl = DEFAULT_REGISTRY_URL,
  currentVersion = CURRENT_VERSION,
} = {}) {
  try {
    const cacheFile = updateCachePath();
    if (!force) {
      const cached = await readJson(cacheFile, null);
      if (cached && typeof cached === 'object' && cached.lastChecked && cached.latestVersion) {
        if (Date.now() - cached.lastChecked < cacheTtlMs) {
          return {
            updateAvailable: isNewerVersion(cached.latestVersion, currentVersion),
            currentVersion,
            latestVersion: cached.latestVersion,
            cached: true,
          };
        }
      }
    }

    const res = await fetchJson(registryUrl, { timeout });
    if (res?.ok && res?.json?.version) {
      const latest = res.json.version;
      try {
        await fs.mkdir(configDir(), { recursive: true });
        await fs.writeFile(cacheFile, JSON.stringify({ lastChecked: Date.now(), latestVersion: latest }, null, 2));
      } catch {
        // Ignore cache write errors
      }
      return {
        updateAvailable: isNewerVersion(latest, currentVersion),
        currentVersion,
        latestVersion: latest,
        cached: false,
      };
    }

    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: null,
      cached: false,
    };
  } catch {
    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: null,
      cached: false,
    };
  }
}
