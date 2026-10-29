#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveCommand } from './commands/serve.js';

function validConfig(config) {
  return config && typeof config === 'object' && !Array.isArray(config)
    && typeof config.host === 'string' && config.host.length > 0
    && Number.isInteger(config.port) && config.port > 0 && config.port <= 65535
    && typeof config.token === 'string' && config.token.length > 0;
}

export async function startSavedServer({ configDir, environment = process.env, readConfig, start = serveCommand } = {}) {
  if (!configDir) throw new Error('A configuration directory is required to start the saved server.');
  environment.LLM_TUNER_CONFIG_DIR = configDir;
  const config = readConfig
    ? await readConfig()
    : await fs.readFile(path.join(configDir, 'server.json'), 'utf8').then(JSON.parse).catch((error) => {
      throw new Error(`Could not read the saved server configuration at ${configDir}: ${error.message}`);
    });
  if (!validConfig(config)) throw new Error(`The saved server configuration at ${configDir} is invalid; the server was not started.`);
  const options = { host: config.host, port: config.port, token: config.token };
  if (start !== serveCommand) return start(options);
  // Manual /serve prints the token; a login launcher must not leak it to startup logs.
  const log = console.log;
  console.log = () => {};
  try {
    return await start(options);
  } finally {
    console.log = log;
  }
}

function configDirectoryFrom(argv) {
  const index = argv.indexOf('--config-dir');
  const value = index >= 0 ? argv[index + 1] : null;
  if (!value) throw new Error('Missing --config-dir for the login-started server.');
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startSavedServer({ configDir: configDirectoryFrom(process.argv.slice(2)) }).catch((error) => {
    console.error(`Could not start the login-configured server: ${error.message}`);
    process.exitCode = 1;
  });
}
