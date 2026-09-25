// Starts the desktop app. On Linux, Chromium's SUID sandbox helper must be
// root-owned with mode 4755; that's impossible on NTFS/exFAT drives or in an
// unpacked dev install, so the sandbox is disabled only in that case. The
// window only loads this app's own local server.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const electron = createRequire(import.meta.url)('electron');
const env = { ...process.env };
if (process.platform === 'linux') {
  try {
    const st = fs.statSync(path.join(path.dirname(electron), 'chrome-sandbox'));
    if (st.uid !== 0 || !(st.mode & 0o4000)) env.ELECTRON_DISABLE_SANDBOX = '1';
  } catch {
    env.ELECTRON_DISABLE_SANDBOX = '1';
  }
}
const main = path.join(path.dirname(fileURLToPath(import.meta.url)), 'main.js');
const child = spawn(electron, [main], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
