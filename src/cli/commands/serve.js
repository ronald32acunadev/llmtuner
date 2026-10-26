import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { configDir, readJson } from '../../core/util.js';
import { startServer } from '../../web/server.js';

export function serverConfigPath() {
  return path.join(configDir(), 'server.json');
}

export async function readServerConfig() {
  try {
    return await readJson(serverConfigPath(), null);
  } catch {
    return null;
  }
}

export async function writeServerConfig(cfg) {
  await fs.mkdir(configDir(), { recursive: true });
  await fs.writeFile(
    serverConfigPath(),
    JSON.stringify(cfg, null, 2),
    'utf8'
  );
}

export async function serveCommand(args = {}) {
  const host = args.host || '0.0.0.0';
  const port = Number(args.port) || 7860;

  const existingConfig = await readServerConfig();
  const token = args.token || existingConfig?.token || randomBytes(32).toString('hex');

  await writeServerConfig({ port, host, token });

  const serverResult = await startServer({
    port,
    host,
    token,
    serverMode: true,
  });

  console.log(`LLM Tuner server mode running on http://${host}:${port}`);
  console.log(`Authentication Token: ${token}`);

  return {
    server: serverResult.server,
    url: serverResult.url,
    port: serverResult.port || port,
    host,
    token,
  };
}
