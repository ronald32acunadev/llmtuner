import { app, BrowserWindow, shell } from 'electron';
import { startServer } from '../src/web/server.js';

// The desktop app is the web UI in a native window, served on a random local port.
let server;

async function createWindow() {
  const started = await startServer({ port: 0 });
  server = started.server;
  const win = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 420,
    title: 'LLM Tuner',
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
