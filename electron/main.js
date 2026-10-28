import { app, BrowserWindow, shell, nativeImage, ipcMain, clipboard } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/web/server.js';
import { createOllamaAuthorizer } from '../src/platform/ollama-authorize.js';
import { createServerAutostart } from '../src/platform/server-autostart.js';
import { readServerConfig, serverConfigPath } from '../src/cli/commands/serve.js';
import { createServerControls, isTrustedServerSender } from './server-controls.js';
import { resolveConnectableHost } from '../src/core/util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Set app name early
app.name = 'LLM Tuner';

if (process.platform === 'win32') {
  app.setAppUserModelId('dev.llm-tuner.app');
} else if (process.platform === 'linux') {
  if (typeof app.setDesktopName === 'function') {
    app.setDesktopName('llm-tuner.desktop');
  }
}

// The desktop app is the web UI in a native window, served on a random local port.
let server;

async function createWindow() {
  const started = await startServer({ port: 0, authorizeOllama: createOllamaAuthorizer({ mode: 'desktop' }) });
  server = started.server;

  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const icon = nativeImage.createFromPath(path.join(__dirname, iconFile));

  const win = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 420,
    title: 'LLM Tuner',
    icon: !icon.isEmpty() ? icon : path.join(__dirname, iconFile),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // External links open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const controls = createServerControls({
    isTrusted: (event) => isTrustedServerSender(event, win.webContents, new URL(started.url).origin),
    autostart: {
      status: () => createServerAutostart({ configPath: serverConfigPath() }).status(),
      setEnabled: async (enabled) => {
        const nodePath = process.env.LLM_TUNER_NODE_EXEC_PATH;
        if (enabled) {
          if (!nodePath || !path.isAbsolute(nodePath)) {
            throw new Error('Please launch using llm-tuner-desktop to enable autostart.');
          }
          await fs.access(nodePath, fs.constants.X_OK);
        }
        return await createServerAutostart({
          configPath: serverConfigPath(),
          execPath: enabled ? (nodePath || process.execPath) : undefined,
        }).setEnabled(enabled);
      },
    },
    readConfig: readServerConfig,
    resolveHost: resolveConnectableHost,
    copyText: async (text) => {
      await clipboard.writeText(text);
    },
  });

  ipcMain.handle('llm-tuner:server-autostart-status', (event) => controls.getAutostartStatus(event));
  ipcMain.handle('llm-tuner:server-autostart-set', (event, enabled) => controls.setAutostartEnabled(event, enabled));
  ipcMain.handle('llm-tuner:server-connection-reveal', (event) => controls.revealConnection(event));
  ipcMain.handle('llm-tuner:server-token-copy', (event) => controls.copyToken(event));

  win.on('closed', () => {
    ipcMain.removeHandler('llm-tuner:server-autostart-status');
    ipcMain.removeHandler('llm-tuner:server-autostart-set');
    ipcMain.removeHandler('llm-tuner:server-connection-reveal');
    ipcMain.removeHandler('llm-tuner:server-token-copy');
  });

  await win.loadURL(started.url);
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && app.dock) {
    const iconFile = 'icon.png';
    const icon = nativeImage.createFromPath(path.join(__dirname, iconFile));
    if (!icon.isEmpty()) {
      app.dock.setIcon(icon);
    }
  }

  await createWindow();
});

app.on('window-all-closed', () => {
  server?.close();
  app.quit();
});
