import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));

// The list of files npm would publish. `npm` is a .cmd shim on Windows, so it needs a shell there.
const packedFiles = () => {
  const r = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout)[0].files.map((f) => f.path);
};

const files = packedFiles();

test('the package ships the CLI, the desktop app and the UI it loads', () => {
  const required = [
    'package.json',
    'LICENSE',
    'README.md',
    'README.es.md',
    'src/cli/index.js',
    'src/core/index.js',
    'src/i18n/en.js',
    'src/i18n/es.js',
    'src/web/server.js',
    'electron/launch.js',
    'electron/main.js',
    'electron/icon.png',
    'electron/icon.ico'
  ];

  for (const file of required) {
    assert.ok(files.includes(file), `missing from the package: ${file}`);
  }
});

test('the package leaves out tests, internal docs and agent files', () => {
  const excludedDirs = ['test/', 'docs/', 'odd/', 'openspec/', 'build/', '.atl/', '.agents/', '.codegraph/', '.github/'];
  const excludedFiles = ['AGENTS.md', 'CLAUDE.md', 'package-lock.json'];

  const leaked = files.filter((file) => {
    return excludedDirs.some((dir) => file.startsWith(dir)) || excludedFiles.includes(file);
  });

  assert.deepEqual(leaked, []);
});

test('both commands point at files that exist', async () => {
  assert.deepEqual(pkg.bin, { 'llm-tuner': 'src/cli/index.js', 'llm-tuner-desktop': 'electron/launch.js' });

  for (const target of Object.values(pkg.bin)) {
    await fs.access(path.join(ROOT, target));
  }
});

test('electron is a runtime dependency and the installer builder is gone', () => {
  assert.ok(pkg.dependencies.electron, 'electron must be in dependencies');
  assert.equal(pkg.devDependencies?.electron, undefined);
  assert.equal(pkg.devDependencies?.['electron-builder'], undefined);
  assert.equal(pkg.build, undefined);
});
