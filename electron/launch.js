#!/usr/bin/env node
// Starts the desktop app. On Linux, Chromium's SUID sandbox helper must be
// root-owned with mode 4755; that's impossible on NTFS/exFAT drives or in an
// npm install, so the sandbox is disabled only in that case. The
// window only loads this app's own local server.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

// Says why the desktop app could not start, in the saved UI language, and exits.
async function fail(error) {
  const { readSettings } = await import('../src/core/settings.js');
  const { t } = await import('../src/i18n/index.js');
  const { lang } = await readSettings();
  console.error(t(lang, 'cli.desktopStartFailed', { error: error?.message ?? String(error) }));
  process.exit(1);
}

// Requiring `electron` returns the path of its executable. It downloads the
// runtime first when it is missing, which happens on the first launch.
let electron;
try {
  electron = createRequire(import.meta.url)('electron');
} catch (error) {
  await fail(error);
}
const env = { ...process.env };

if (process.platform === 'linux') {
  try {
    const st = fs.statSync(path.join(path.dirname(electron), 'chrome-sandbox'));
    if (st.uid !== 0 || !(st.mode & 0o4000)) env.ELECTRON_DISABLE_SANDBOX = '1';
  } catch {
    env.ELECTRON_DISABLE_SANDBOX = '1';
  }

  // Ensure Linux desktop entry exists
  ensureLinuxDesktopEntry();
}

const main = path.join(path.dirname(fileURLToPath(import.meta.url)), 'main.js');
const child = spawn(electron, [main], { stdio: 'inherit', env });
child.on('error', fail);
child.on('exit', (code) => process.exit(code ?? 0));

function ensureLinuxDesktopEntry() {
  try {
    const appsDir = process.env.XDG_DATA_HOME
      ? path.join(process.env.XDG_DATA_HOME, 'applications')
      : path.join(os.homedir(), '.local', 'share', 'applications');

    fs.mkdirSync(appsDir, { recursive: true });

    const desktopFilePath = path.join(appsDir, 'llm-tuner.desktop');
    const iconPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'icon.png');

    const desktopContent = `[Desktop Entry]
Type=Application
Name=LLM Tuner
Comment=Find the fastest configuration to run local LLMs
Exec=${process.execPath} ${fileURLToPath(import.meta.url)}
Icon=${iconPath}
Terminal=false
StartupWMClass=llm-tuner
Categories=Development;Utility;
`;

    // Only write if file doesn't exist or content differs
    let currentContent = '';
    try {
      currentContent = fs.readFileSync(desktopFilePath, 'utf8');
    } catch {
      // File doesn't exist, so we'll write it
    }

    if (currentContent !== desktopContent) {
      fs.writeFileSync(desktopFilePath, desktopContent);
    }
  } catch {
    // Failures are ignored to avoid preventing app launch
  }
}
