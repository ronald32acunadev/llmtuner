import { TunerError } from '../core/errors.js';

const hasWhitespace = (value) => /\s/.test(value);

function validate({ host, port, token }) {
  if (typeof host !== 'string' || !host || hasWhitespace(host)) throw new TunerError('errors.invalidServerHost');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TunerError('errors.invalidServerPort');
  if (token !== undefined && (typeof token !== 'string' || !token || hasWhitespace(token))) throw new TunerError('errors.invalidServerToken');
}

export function createSharedServer({ readConfig, writeConfig, listen, newToken, resolveHost }) {
  let running = null;

  const publicStatus = ({ host, port }) => {
    const shown = resolveHost(host);
    const urlHost = shown.includes(':') ? `[${shown}]` : shown;
    return { running: true, host, port, url: `http://${urlHost}:${port}` };
  };

  return {
    async start({ host, port, token }) {
      validate({ host, port, token });
      if (running) {
        if (host === running.host && (port === running.requestedPort || port === running.port)) {
          return publicStatus(running);
        }
        throw new TunerError('errors.serverAlreadyRunning');
      }
      const config = await readConfig();
      const chosenToken = token ?? config?.token ?? newToken();
      let started;
      try {
        started = await listen({ host, port, token: chosenToken, serverMode: true });
      } catch {
        throw new TunerError('errors.serverBindFailed', { host, port });
      }
      await writeConfig({ port: started.port, host, token: chosenToken });
      running = { server: started.server, host, port: started.port, requestedPort: port };
      return publicStatus(running);
    },

    async status() {
      if (running) return { ...publicStatus(running), configured: true };
      const config = await readConfig();
      if (!config) return { running: false, configured: false };
      return { running: false, configured: true, host: config.host, port: config.port };
    },

    async close() {
      if (!running) return;
      const { server } = running;
      running = null;
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
