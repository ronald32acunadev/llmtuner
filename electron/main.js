import { app, BrowserWindow, shell, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/web/server.js';

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
  const started = await startServer({ port: 0 });
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
    webPreferences: { contextIsolation: true, sandbox: true },
  });

  // External links open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
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
