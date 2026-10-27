export function isTrustedServerSender(event, webContents, expectedOrigin) {
  if (!event || !webContents) return false;
  const frame = event.senderFrame;
  if (!frame) return false;
  return (
    event.sender === webContents &&
    frame === webContents.mainFrame &&
    frame.origin === expectedOrigin
  );
}

export function createServerControls({ isTrusted, autostart, readConfig, copyText }) {
  const checkAuth = (event) => {
    if (!isTrusted(event)) {
      throw new Error('Local server controls are not authorized.');
    }
  };

  return {
    async getAutostartStatus(event) {
      checkAuth(event);
      return await autostart.status();
    },

    async setAutostartEnabled(event, enabled) {
      checkAuth(event);
      if (typeof enabled !== 'boolean') {
        throw new Error('Value must be a boolean');
      }
      const result = await autostart.setEnabled(enabled);
      if (result !== enabled) {
        throw new Error(`Could not confirm autostart state change to ${enabled}`);
      }
      return result;
    },

    async revealConnection(event) {
      checkAuth(event);
      const config = await readConfig();
      if (!config) {
        return { configured: false };
      }

      const { host, port, token } = config;
      if (
        typeof host !== 'string' || host.length === 0 ||
        !Number.isInteger(port) || port < 1 || port > 65535 ||
        typeof token !== 'string' || token.length === 0
      ) {
        throw new Error('Invalid server configuration');
      }

      return { configured: true, host, port, token };
    },

    async copyToken(event) {
      checkAuth(event);
      const config = await readConfig();
      if (!config || typeof config.token !== 'string' || config.token.length === 0) {
        throw new Error('Configuration error: no token available to copy');
      }
      await copyText(config.token);
      return { copied: true };
    }
  };
}
