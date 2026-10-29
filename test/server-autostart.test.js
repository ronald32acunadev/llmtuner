import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createServerAutostart } from '../src/platform/server-autostart.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-autostart-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('Linux startup registration is idempotent and disabling preserves server config', async (t) => {
  const root = await fixture(t);
  const configPath = path.join(root, 'config', 'server.json');
  const configBytes = JSON.stringify({ host: '127.0.0.1', port: 8123, token: 'kept-secret' }, null, 2);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, configBytes);
  const autostart = createServerAutostart({ platform: 'linux', home: root, env: { XDG_CONFIG_HOME: path.join(root, 'xdg') }, execPath: '/opt/Node Runtime/node', entryPath: '/opt/LLM Tuner/100% ready/server-login.js', configPath });

  assert.equal(await autostart.status(), false);
  await autostart.setEnabled(true);
  const artifactPath = path.join(root, 'xdg', 'autostart', 'llm-tuner-server.desktop');
  const desktop = await fs.readFile(artifactPath, 'utf8');
  assert.match(desktop, /Terminal=false/);
  assert.doesNotMatch(desktop, /kept-secret/);
  assert.match(desktop, /100%% ready/);
  assert.equal(await autostart.status(), true);
  await autostart.setEnabled(true);
  assert.equal(await fs.readFile(configPath, 'utf8'), configBytes);

  await autostart.setEnabled(false);
  await autostart.setEnabled(false);
  assert.equal(await autostart.status(), false);
  assert.equal(await fs.readFile(configPath, 'utf8'), configBytes);
});

test('Linux Exec arguments receive both escaping layers for special characters and percent fields', async (t) => {
  const root = await fixture(t);
  const configPath = path.join(root, 'config', 'server.json');
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({ host: '127.0.0.1', port: 8123, token: 'stable-token' }));
  const entryPath = '/opt/LLM Tuner/100% ready/server-login.js';
  const autostart = createServerAutostart({
    platform: 'linux', home: root, env: { XDG_CONFIG_HOME: path.join(root, 'xdg') },
    execPath: '/opt/Node $HOME/"quoted"\\back`tick%/node', entryPath, configPath,
  });
  await autostart.setEnabled(true);
  const desktop = await fs.readFile(path.join(root, 'xdg', 'autostart', 'llm-tuner-server.desktop'), 'utf8');
  const execLine = desktop.split('\n').find((line) => line.startsWith('Exec='));
  const expectedExecutable = '"' + '/opt/Node ' + '\\\\$HOME/' + '\\\\"quoted' + '\\\\"' + '\\\\\\\\back' + '\\\\`tick%%/node"';
  assert.equal(execLine, `Exec=${expectedExecutable} "${entryPath.replace('%', '%%')}" --config-dir "${path.dirname(configPath)}"`);
  await autostart.setEnabled(false);
});

test('Linux registration rejects control characters before touching existing config or registration', async (t) => {
  const root = await fixture(t);
  const configPath = path.join(root, 'config', 'server.json');
  const configBytes = JSON.stringify({ host: '127.0.0.1', port: 8123, token: 'stable-token' });
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, configBytes);
  const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
  for (const execPath of ['/opt/Node\r\nInjected/node', '/opt/Node\0Injected/node', '/opt/Node\u0001Injected/node']) {
    const autostart = createServerAutostart({ platform: 'linux', home: root, env: { XDG_CONFIG_HOME: path.join(root, 'xdg') }, execPath, configPath });
    await assert.rejects(autostart.setEnabled(true), /control characters/i);
    assert.equal(await autostart.status(), false);
    assert.equal(hash(await fs.readFile(configPath)), hash(configBytes));
    assert.equal(await autostart.setEnabled(false), false);
  }
});

test('setEnabled rejects non-boolean values without initializing configuration', async (t) => {
  const root = await fixture(t);
  const configPath = path.join(root, 'config', 'server.json');
  const autostart = createServerAutostart({ platform: 'linux', home: root, env: { XDG_CONFIG_HOME: path.join(root, 'xdg') }, configPath });
  await assert.rejects(autostart.setEnabled('true'), /enabled must be a boolean/i);
  await assert.rejects(fs.access(configPath), { code: 'ENOENT' });
  assert.equal(await autostart.status(), false);
});

test('macOS registration escapes XML arguments and loads at user login', async (t) => {
  const root = await fixture(t);
  const configPath = path.join(root, 'Application Support', 'llm-tuner', 'server.json');
  const autostart = createServerAutostart({ platform: 'darwin', home: root, env: {}, execPath: '/Applications/Node & Runtime/node', entryPath: '/Applications/LLM Tuner/server-login.js', configPath });
  await autostart.setEnabled(true);
  const plist = await fs.readFile(path.join(root, 'Library', 'LaunchAgents', 'dev.llm-tuner.server.plist'), 'utf8');
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(plist, /Node &amp; Runtime/);
  assert.match(plist, /--config-dir/);
  assert.doesNotMatch(plist, /kept-secret/);
});

test('Windows registration checks the shortcut result and reports command failures', async (t) => {
  const root = await fixture(t);
  const configPath = path.join(root, 'config', 'server.json');
  const startupPath = path.join(root, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  const shortcutPath = path.join(startupPath, 'LLM Tuner Server.lnk');
  const calls = [];
  const autostart = createServerAutostart({
    platform: 'win32', home: root, env: { APPDATA: root }, execPath: 'C:\\Program Files\\Node\\node.exe', entryPath: 'C:\\LLM Tuner\\server-login.js', configPath,
    run: async (...args) => { calls.push(args); await fs.writeFile(shortcutPath, 'shortcut'); return { code: 0, stderr: '' }; },
  });
  await autostart.setEnabled(true);
  assert.equal(await autostart.status(), true);
  assert.equal(calls.length, 1);
  const powershell = Buffer.from(calls[0][1].at(-1), 'base64').toString('utf16le');
  assert.match(powershell, /CreateShortcut/);
  assert.match(powershell, /\$expectedTarget = 'C:\\Program Files\\Node\\node\.exe'/);
  assert.match(powershell, /\$expectedArguments = '"C:\\LLM Tuner\\server-login\.js" --config-dir/);
  await autostart.setEnabled(false);
  assert.equal(await autostart.status(), false);

  const failed = createServerAutostart({ platform: 'win32', home: root, env: { APPDATA: root }, execPath: 'node', entryPath: 'launcher.js', configPath, run: async () => ({ code: 1, stderr: 'denied' }) });
  await assert.rejects(failed.setEnabled(true), /denied/);
  const falseSuccess = createServerAutostart({ platform: 'win32', home: root, env: { APPDATA: root }, execPath: 'node', entryPath: 'launcher.js', configPath, run: async () => ({ code: 0, stderr: '' }) });
  await assert.rejects(falseSuccess.setEnabled(true), /reported success but did not create/i);
});

test('Windows registration reports a failed Save when a stale shortcut already exists', async (t) => {
  const root = await fixture(t);
  const configPath = path.join(root, 'config', 'server.json');
  const startupPath = path.join(root, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  const shortcutPath = path.join(startupPath, 'LLM Tuner Server.lnk');
  const staleBytes = 'stale shortcut bytes';
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.mkdir(startupPath, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({ host: '127.0.0.1', port: 8123, token: 'saved-token' }));
  await fs.writeFile(shortcutPath, staleBytes);
  let script = '';
  const autostart = createServerAutostart({
    platform: 'win32', home: root, env: { APPDATA: root }, execPath: 'node.exe', entryPath: 'launcher.js', configPath,
    run: async (_command, args) => {
      script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
      const isTerminating = /\$ErrorActionPreference\s*=\s*'Stop'/i.test(script)
        && /catch\s*\{[^}]*exit 1/s.test(script);
      return isTerminating ? { code: 1, stderr: 'Save failed' } : { code: 0, stderr: '' };
    },
  });

  await assert.rejects(autostart.setEnabled(true), /Save failed/);
  assert.equal(await fs.readFile(shortcutPath, 'utf8'), staleBytes);
  assert.equal((script.match(/CreateShortcut\(/g) || []).length, 2);
  assert.match(script, /\$saved\.TargetPath\s*-ne\s*\$expectedTarget/);
  assert.match(script, /\$saved\.Arguments\s*-ne\s*\$expectedArguments/);
  assert.match(script, /\$saved\.WorkingDirectory\s*-ne\s*\$expectedWorkingDirectory/);
});

test('missing configuration gets initialized once with a private token; malformed config is not overwritten', async (t) => {
  const root = await fixture(t);
  const configPath = path.join(root, 'config', 'server.json');
  const autostart = createServerAutostart({ platform: 'linux', home: root, env: {}, configPath });
  await autostart.setEnabled(true);
  const initial = await fs.readFile(configPath, 'utf8');
  const config = JSON.parse(initial);
  assert.deepEqual({ host: config.host, port: config.port }, { host: '0.0.0.0', port: 7860 });
  assert.match(config.token, /^[a-f0-9]{64}$/);
  assert.equal((await fs.stat(configPath)).mode & 0o777, 0o600);
  await autostart.setEnabled(true);
  assert.equal(await fs.readFile(configPath, 'utf8'), initial);

  const malformedPath = path.join(root, 'bad', 'server.json');
  await fs.mkdir(path.dirname(malformedPath), { recursive: true });
  await fs.writeFile(malformedPath, '{broken');
  const malformed = createServerAutostart({ platform: 'linux', home: root, env: {}, configPath: malformedPath });
  await assert.rejects(malformed.setEnabled(true), /configuration .* malformed/i);
  assert.equal(await fs.readFile(malformedPath, 'utf8'), '{broken');
});

test('registration status distinguishes permission errors from a missing artifact', async (t) => {
  const root = await fixture(t);
  const deniedFs = { ...fs, access: async () => { const error = new Error('denied'); error.code = 'EACCES'; throw error; } };
  const autostart = createServerAutostart({ platform: 'linux', home: root, env: {}, configPath: path.join(root, 'server.json'), fileSystem: deniedFs });
  await assert.rejects(autostart.status(), /denied/);
});
