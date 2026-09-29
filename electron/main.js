import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/web/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.platform === 'win32') {
  app.setAppUserModelId('dev.llm-tuner.app');
}

// The desktop app is the web UI in a native window, served on a random local port.
let server;

async function createWindow() {
  const started = await startServer({ port: 0 });
  server = started.server;
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const win = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 420,
    title: 'LLM Tuner',
    icon: path.join(__dirname, iconFile),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // External links open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  await win.loadURL(started.url);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  server?.close();
  app.quit();
});
