import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as runCommand } from '../core/util.js';

const ENTRY_NAME = 'dev.llm-tuner.server';

function missing(error) {
  return error?.code === 'ENOENT';
}

function validConfig(config) {
  return config && typeof config === 'object' && !Array.isArray(config)
    && typeof config.host === 'string' && config.host.length > 0
    && Number.isInteger(config.port) && config.port > 0 && config.port <= 65535
    && typeof config.token === 'string' && config.token.length > 0;
}

function desktopArgument(value) {
  const execEscaped = String(value).replace(/([\\"$`])/g, '\\$1').replace(/%/g, '%%');
  return `"${execEscaped.replace(/\\/g, '\\\\')}"`;
}

function assertNoControlCharacters(values) {
  if (values.some((value) => /[\u0000-\u001f\u007f-\u009f]/u.test(String(value)))) {
    throw new Error('Startup command paths cannot contain control characters.');
  }
}

function xml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function powershellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function windowsArgument(value) {
  const text = String(value);
  if (!/[\s"]/.test(text)) return text;
  let quoted = '"';
  let slashes = 0;
  for (const character of text) {
    if (character === '\\') {
      slashes += 1;
    } else if (character === '"') {
      quoted += `${'\\'.repeat(slashes * 2 + 1)}"`;
      slashes = 0;
    } else {
      quoted += `${'\\'.repeat(slashes)}${character}`;
      slashes = 0;
    }
  }
  return `${quoted}${'\\'.repeat(slashes * 2)}"`;
}

function plist(argumentsList) {
  const values = argumentsList.map((value) => `    <string>${xml(value)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key>\n  <string>${ENTRY_NAME}</string>\n  <key>ProgramArguments</key>\n  <array>\n${values}\n  </array>\n  <key>RunAtLoad</key>\n  <true/>\n</dict>\n</plist>\n`;
}

export function createServerAutostart({
  platform = process.platform,
  home = os.homedir(),
  env = process.env,
  execPath = process.execPath,
  entryPath = fileURLToPath(new URL('../cli/server-login.js', import.meta.url)),
  configPath,
  fileSystem = fs,
  run = runCommand,
} = {}) {
  let artifactPath;
  if (platform === 'linux') {
    artifactPath = path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'autostart', 'llm-tuner-server.desktop');
  } else if (platform === 'darwin') {
    artifactPath = path.join(home, 'Library', 'LaunchAgents', `${ENTRY_NAME}.plist`);
  } else if (platform === 'win32') {
    artifactPath = path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'LLM Tuner Server.lnk');
  } else {
    throw new Error(`Automatic server startup is not supported on ${platform}.`);
  }
  const defaultConfigRoot = platform === 'win32'
    ? (env.APPDATA || path.join(home, 'AppData', 'Roaming'))
    : platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support')
      : (env.XDG_CONFIG_HOME || path.join(home, '.config'));
  const resolvedConfigPath = configPath || path.join(env.LLM_TUNER_CONFIG_DIR || path.join(defaultConfigRoot, 'llm-tuner'), 'server.json');

  async function ensureConfig() {
    let contents;
    try {
      contents = await fileSystem.readFile(resolvedConfigPath, 'utf8');
    } catch (error) {
      if (!missing(error)) throw error;
      const initial = { host: '0.0.0.0', port: 7860, token: randomBytes(32).toString('hex') };
      await fileSystem.mkdir(path.dirname(resolvedConfigPath), { recursive: true });
      try {
        await fileSystem.writeFile(resolvedConfigPath, JSON.stringify(initial, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        return initial;
      } catch (writeError) {
        if (writeError?.code !== 'EEXIST') throw writeError;
        contents = await fileSystem.readFile(resolvedConfigPath, 'utf8');
      }
    }
    let config;
    try {
      config = JSON.parse(contents);
    } catch {
      throw new Error(`Server configuration at ${resolvedConfigPath} is malformed; automatic startup was not registered.`);
    }
    if (!validConfig(config)) {
      throw new Error(`Server configuration at ${resolvedConfigPath} is invalid; automatic startup was not registered.`);
    }
    return config;
  }

  async function register() {
    const configDirectory = path.dirname(resolvedConfigPath);
    assertNoControlCharacters([execPath, entryPath, configDirectory, artifactPath]);
    await ensureConfig();
    if (platform === 'linux') {
      const entry = `[Desktop Entry]\nType=Application\nName=LLM Tuner Server\nComment=Start the LLM Tuner server after login\nExec=${desktopArgument(execPath)} ${desktopArgument(entryPath)} --config-dir ${desktopArgument(configDirectory)}\nTerminal=false\n`;
      await fileSystem.mkdir(path.dirname(artifactPath), { recursive: true });
      await fileSystem.writeFile(artifactPath, entry, { encoding: 'utf8', mode: 0o600 });
      if (!(await status())) throw new Error('The Linux startup entry was not created.');
      return;
    }
    if (platform === 'darwin') {
      await fileSystem.mkdir(path.dirname(artifactPath), { recursive: true });
      await fileSystem.writeFile(artifactPath, plist([execPath, entryPath, '--config-dir', configDirectory]), { encoding: 'utf8', mode: 0o600 });
      if (!(await status())) throw new Error('The macOS startup entry was not created.');
      return;
    }

    await fileSystem.mkdir(path.dirname(artifactPath), { recursive: true });
    const args = `--config-dir ${windowsArgument(configDirectory)}`;
    const script = [
      `$ErrorActionPreference = 'Stop'`,
      `$expectedTarget = ${powershellLiteral(execPath)}`,
      `$expectedArguments = ${powershellLiteral(`${windowsArgument(entryPath)} ${args}`)}`,
      `$expectedWorkingDirectory = ${powershellLiteral(path.dirname(entryPath))}`,
      `try {`,
      `$shell = New-Object -ComObject WScript.Shell`,
      `$shortcut = $shell.CreateShortcut(${powershellLiteral(artifactPath)})`,
      `$shortcut.TargetPath = $expectedTarget`,
      `$shortcut.Arguments = $expectedArguments`,
      `$shortcut.WorkingDirectory = $expectedWorkingDirectory`,
      `$shortcut.Save()`,
      `$saved = $shell.CreateShortcut(${powershellLiteral(artifactPath)})`,
      `if ($saved.TargetPath -ne $expectedTarget -or $saved.Arguments -ne $expectedArguments -or $saved.WorkingDirectory -ne $expectedWorkingDirectory) { throw 'The saved startup shortcut did not match the requested settings.' }`,
      `} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`,
    ].join('\n');
    const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true });
    if (result.code !== 0) throw new Error(`Could not create the Windows startup shortcut: ${result.stderr || `PowerShell exited with code ${result.code}`}`);
    try {
      await fileSystem.access(artifactPath);
    } catch (error) {
      if (missing(error)) throw new Error('PowerShell reported success but did not create the Windows startup shortcut.');
      throw error;
    }
  }

  async function status() {
    try {
      await fileSystem.access(artifactPath);
      return true;
    } catch (error) {
      if (missing(error)) return false;
      throw error;
    }
  }

  return {
    status,
    async setEnabled(enabled) {
      if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean.');
      if (enabled) {
        await register();
      } else {
        await fileSystem.rm(artifactPath, { force: true });
      }
      return status();
    },
  };
}
