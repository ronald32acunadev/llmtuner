import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { configDir, readJson, resolveConnectableHost } from '../../core/util.js';
import { startServer } from '../../web/server.js';
import { createSharedServer } from '../../platform/shared-server.js';

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

export function createDefaultSharedServer(listen = startServer) {
  return createSharedServer({
    readConfig: readServerConfig,
    writeConfig: writeServerConfig,
    listen,
    newToken: () => randomBytes(32).toString('hex'),
    resolveHost: resolveConnectableHost,
  });
}

export async function serveCommand(args = {}) {
  const host = args.host || '0.0.0.0';
  const port = args.port !== undefined ? Number(args.port) : 7860;

  let serverResult;
  const shared = createDefaultSharedServer(async (options) => {
    serverResult = await startServer(options);
    return serverResult;
  });
  const status = await shared.start({ host, port, token: args.token });
  const { token } = await readServerConfig();

  const displayHost = resolveConnectableHost(host);
  const resolvedPort = status.port;
  const connectableUrl = `http://${displayHost}:${resolvedPort}`;

  console.log(`LLM Tuner server mode running on ${connectableUrl}`);
  console.log(`Authentication Token: ${token}`);

  return {
    server: serverResult.server,
    url: connectableUrl,
    port: resolvedPort,
    host,
    connectableHost: displayHost,
    token,
  };
}
