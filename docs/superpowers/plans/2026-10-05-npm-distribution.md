# npm Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm install -g llm-tuner` gives the user the `llm-tuner` CLI and the `llm-tuner-desktop` app, and a push to the `release` branch publishes a new version.

**Architecture:** The package becomes a plain npm package with a `files` whitelist and two `bin` commands. Electron is a regular dependency and downloads its own runtime on the first desktop launch, so no install script is added. Two GitHub Actions workflows cover pull request checks and the release.

**Tech Stack:** Node >= 22 (ESM), `node:test`, Electron 44.5.1, npm 11, GitHub Actions (`actions/checkout@v7`, `actions/setup-node@v7`).

**Spec:** `docs/superpowers/specs/2026-10-05-npm-distribution-design.md`

## Global Constraints

- Node >= 22, ESM, no build step, no new dependencies.
- Code, comments, documentation and commit messages are in English. The `es` catalog and `README.es.md` are the only translations.
- Every user-facing string goes through `src/i18n` and exists in both `en` and `es`.
- `src/web/` is not modified.
- Code authorship (`AGENTS.md`): code under `src/`, `electron/` and `test/` is requested from the `pumbastudio` MCP tool `openai_chat` first, with a self-contained prompt. The code blocks in this plan are the reference the answer is reviewed against. If `pumbastudio` is unavailable, apply the code from this plan and report that the fallback was used. Configuration files (`package.json`, workflows), documentation and i18n strings are written by the agent.
- Tests that touch settings set `LLM_TUNER_CONFIG_DIR` to a temporary directory.
- Commits use Conventional Commits and carry no AI attribution and no `Co-Authored-By` line.
- Pushing, opening pull requests, creating the `release` branch, creating the npm account or token, and publishing are the owner's actions. No task performs them.

## Review Focus

1. **First desktop launch without network.** The runtime download fails inside `require('electron')`. Expected: one localized message, exit code 1, no stack trace. The automated test exercises the sibling path (the runtime cannot be spawned), which goes through the same `fail` function; the download path itself is checked by hand in Task 6, Step 4.
2. **A runtime file that is not in the `files` whitelist.** A future top-level directory the app imports would work in the repository and break after install. Expected: the installed package starts. Pinned by the install-from-tarball check in Task 6, Steps 1 to 3, which must be repeated when a top-level directory is added.
3. **`--web` followed by another option.** The parser treats unknown options as taking a value, so `llm-tuner --web --presets` swallows `--presets` and opens the wizard. Expected by the spec: `--web` is ignored like any unknown option. Pinned in Task 3 by the test that the CLI no longer loads the web server.
4. **Merging into `release` without a version bump.** Expected: the workflow stops before publishing with a message that names the version. It cannot be run locally; the guard is read back in Task 4, Step 3, and is first exercised on the first release.
5. **Windows.** `npm` is a `.cmd` shim there, so spawning it needs a shell. Expected: the package test passes on Windows. Pinned in Task 1 by `shell: process.platform === 'win32'`; CI does not run on Windows yet, so this stays unverified until someone runs `npm test` there.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` (modify) | Manifest: two commands, publish whitelist, Electron as a dependency. |
| `LICENSE` (create) | MIT license text. |
| `build/` (delete) | Icons used only by `electron-builder`. |
| `electron/launch.js` (modify) | Installed command that starts the desktop app and reports a start failure. |
| `src/cli/index.js` (modify) | CLI without the web mode. |
| `src/i18n/en.js`, `src/i18n/es.js` (modify) | New launcher message, help text without `--web`. |
| `test/package.test.js` (create) | Manifest and package contents. |
| `test/launcher.test.js` (create) | Launcher shebang and start-failure message. |
| `test/cli.test.js`, `test/i18n.test.js` (modify) | Web mode removal; key references in `electron/`. |
| `.github/workflows/ci.yml`, `.github/workflows/release.yml` (create) | Pull request checks and the release. |
| `README.md`, `README.es.md`, `docs/PROYECTO.md`, `CLAUDE.md` (modify) | Install, usage and release documentation. |

---

### Task 0: Branch

**Files:** none changed.

- [ ] **Step 1: Create the feature branch from the remote main**

The spec and this plan are untracked files and move with the checkout. `.atl/` has unrelated uncommitted changes: leave them unstaged for the whole plan.

```bash
git fetch origin
git switch -c feat/npm-distribution origin/main
```

- [ ] **Step 2: Commit the spec and the plan**

```bash
git add docs/superpowers/specs/2026-10-05-npm-distribution-design.md docs/superpowers/plans/2026-10-05-npm-distribution.md
git commit -m "docs: add the npm distribution spec and plan"
```

---

### Task 1: Package manifest and contents

**Files:**
- Create: `test/package.test.js`
- Create: `LICENSE`
- Modify: `package.json` (whole file)
- Modify: `package-lock.json` (regenerated)
- Delete: `build/icon.ico`, `build/icon.png`

**Interfaces:**
- Consumes: nothing.
- Produces: the `bin` entry `llm-tuner-desktop` → `electron/launch.js`, which Task 2 turns into a working command.

- [ ] **Step 1: Write the failing test**

Create `test/package.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));

// The list of files npm would publish. `npm` is a .cmd shim on Windows, so it needs a shell there.
function packedFiles() {
  const r = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout)[0].files.map((f) => f.path);
}

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
    'electron/icon.ico',
  ];
  for (const file of required) assert.ok(files.includes(file), `missing from the package: ${file}`);
});

test('the package leaves out tests, internal docs and agent files', () => {
  const excludedDirs = ['test/', 'docs/', 'odd/', 'openspec/', 'build/', '.atl/', '.agents/', '.codegraph/', '.github/'];
  const excludedFiles = ['AGENTS.md', 'CLAUDE.md', 'package-lock.json'];
  const leaked = files.filter((f) => excludedDirs.some((d) => f.startsWith(d)) || excludedFiles.includes(f));
  assert.deepEqual(leaked, []);
});

test('both commands point at files that exist', async () => {
  assert.deepEqual(pkg.bin, {
    'llm-tuner': 'src/cli/index.js',
    'llm-tuner-desktop': 'electron/launch.js',
  });
  for (const target of Object.values(pkg.bin)) await fs.access(path.join(ROOT, target));
});

test('electron is a runtime dependency and the installer builder is gone', () => {
  assert.ok(pkg.dependencies.electron, 'electron must be in dependencies');
  assert.equal(pkg.devDependencies?.electron, undefined);
  assert.equal(pkg.devDependencies?.['electron-builder'], undefined);
  assert.equal(pkg.build, undefined);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/package.test.js`
Expected: FAIL. The first test reports `missing from the package: LICENSE`, the second lists leaked files under `test/` and `docs/`, the third reports a `bin` mismatch, the fourth reports `electron must be in dependencies`.

- [ ] **Step 3: Replace `package.json`**

Write the whole file:

```json
{
  "name": "llm-tuner",
  "version": "0.1.0",
  "description": "Detects your hardware and finds the fastest configuration to run local LLMs with LM Studio or Ollama.",
  "keywords": [
    "llm",
    "lm-studio",
    "ollama",
    "gguf",
    "llama.cpp",
    "benchmark",
    "gpu",
    "vram"
  ],
  "homepage": "https://github.com/ronald32acunadev/llmtuner#readme",
  "bugs": {
    "url": "https://github.com/ronald32acunadev/llmtuner/issues"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/ronald32acunadev/llmtuner.git"
  },
  "license": "MIT",
  "type": "module",
  "main": "src/core/index.js",
  "bin": {
    "llm-tuner": "src/cli/index.js",
    "llm-tuner-desktop": "electron/launch.js"
  },
  "files": [
    "src/",
    "electron/",
    "README.es.md"
  ],
  "scripts": {
    "start": "node src/cli/index.js",
    "desktop": "node electron/launch.js",
    "test": "node --test test/*.test.js"
  },
  "engines": {
    "node": ">=22"
  },
  "dependencies": {
    "@inquirer/prompts": "^7.0.0",
    "electron": "^44.5.1",
    "systeminformation": "^5.23.0"
  }
}
```

- [ ] **Step 4: Create `LICENSE`**

```text
MIT License

Copyright (c) 2026 Ronald Daniel Acuña Arias

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 5: Remove the `electron-builder` icons and regenerate the lockfile**

```bash
git rm -r build
npm install
```

Expected: `npm install` removes the `electron-builder` packages and rewrites `package-lock.json`. `electron` stays at 44.5.1.

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test test/package.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS, no failures.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json LICENSE test/package.test.js
git commit -m "feat(package): ship the CLI and the desktop app in one npm package"
```

---

### Task 2: Desktop launcher command

**Files:**
- Create: `test/launcher.test.js`
- Modify: `electron/launch.js` (whole file)
- Modify: `src/i18n/en.js`, `src/i18n/es.js` (one new key each, after the `'cli.help'` entry and before `'cli.settingsTitle'`)
- Modify: `test/i18n.test.js:85-92`

**Interfaces:**
- Consumes: `readSettings()` from `src/core/settings.js` (returns `{ lang, theme, profile }`, never throws) and `t(locale, key, params)` from `src/i18n/index.js`.
- Produces: the i18n key `cli.desktopStartFailed` with the single param `{error}`.

Background for the implementer: `require('electron')` returns the path of the Electron executable. In Electron 44.5.1 it also downloads the runtime when it is missing and throws when that download fails. When the environment variable `ELECTRON_OVERRIDE_DIST_PATH` is set, it returns `<that directory>/<executable name>` without downloading and without checking that the file exists. The test uses that variable, pointed at an empty directory, to get a runtime that cannot be spawned without touching the network.

- [ ] **Step 1: Write the failing tests**

Create `test/launcher.test.js`:

```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAUNCH = path.join(ROOT, 'electron', 'launch.js');
const CLI = path.join(ROOT, 'src', 'cli', 'index.js');
const configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-launch-'));
const emptyDist = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-tuner-dist-'));
const settings = path.join(configDir, 'settings.json');

// Starts the launcher with a runtime directory that holds no executable.
const launch = () => spawnSync(process.execPath, [LAUNCH], {
  env: { ...process.env, LLM_TUNER_CONFIG_DIR: configDir, ELECTRON_OVERRIDE_DIST_PATH: emptyDist },
  encoding: 'utf8',
  timeout: 20000,
});

beforeEach(async () => { await fs.rm(settings, { force: true }); });

test('both commands start with a shebang so npm can install them', async () => {
  for (const file of [LAUNCH, CLI]) {
    const firstLine = (await fs.readFile(file, 'utf8')).split('\n')[0];
    assert.equal(firstLine, '#!/usr/bin/env node', path.relative(ROOT, file));
  }
});

test('a runtime that cannot start fails with exit code 1 and a clear message', () => {
  const r = launch();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Could not start the desktop app/);
  assert.match(r.stderr, /llm-tuner-desktop/);
  assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack trace');
});

test('the failure message follows the saved language', async () => {
  await fs.writeFile(settings, JSON.stringify({ lang: 'es' }));
  const r = launch();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No se pudo iniciar la aplicación de escritorio/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/launcher.test.js`
Expected: FAIL. The shebang test fails on `electron/launch.js`. The other two fail because the unhandled spawn error prints a Node stack trace instead of the message.

- [ ] **Step 3: Add the message to both catalogs**

In `src/i18n/en.js`, after the `'cli.help'` entry and before `'cli.settingsTitle'`:

```js
  'cli.desktopStartFailed': 'Could not start the desktop app: {error}\nThe desktop runtime (Electron) is downloaded the first time you run llm-tuner-desktop, so that first run needs a network connection.\nThe terminal interface works without it: run llm-tuner.',
```

In `src/i18n/es.js`, in the same position:

```js
  'cli.desktopStartFailed': 'No se pudo iniciar la aplicación de escritorio: {error}\nEl entorno de escritorio (Electron) se descarga la primera vez que ejecutas llm-tuner-desktop, así que esa primera ejecución necesita conexión a la red.\nLa interfaz de terminal funciona sin él: ejecuta llm-tuner.',
```

- [ ] **Step 4: Rewrite `electron/launch.js`**

Whole file:

```js
#!/usr/bin/env node
// Starts the desktop app. On Linux, Chromium's SUID sandbox helper must be
// root-owned with mode 4755; that's impossible on NTFS/exFAT drives or in an
// npm install, so the sandbox is disabled only in that case. The window only
// loads this app's own local server.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

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
}
const main = path.join(path.dirname(fileURLToPath(import.meta.url)), 'main.js');
const child = spawn(electron, [main], { stdio: 'inherit', env });
child.on('error', fail);
child.on('exit', (code) => process.exit(code ?? 0));
```

- [ ] **Step 5: Make the i18n reference check cover `electron/`**

In `test/i18n.test.js`, replace the test at lines 85 to 92:

```js
test('every key referenced in src/ and electron/ exists in the English catalog', async () => {
  const missing = [];
  for (const dir of ['src', 'electron']) {
    for (const file of await sourceFiles(path.join(ROOT, dir))) {
      const text = await fs.readFile(file, 'utf8');
      for (const m of text.matchAll(KEY_RE)) if (!(m[1] in CATALOGS.en)) missing.push(`${path.relative(ROOT, file)}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test test/launcher.test.js test/i18n.test.js`
Expected: PASS.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS, no failures.

- [ ] **Step 8: Commit**

```bash
git add electron/launch.js src/i18n/en.js src/i18n/es.js test/launcher.test.js test/i18n.test.js
git commit -m "feat(desktop): make the launcher an installable command"
```

---

### Task 3: Remove the web mode from the CLI

**Files:**
- Modify: `src/cli/index.js:57-58` and `src/cli/index.js:293`
- Modify: `src/i18n/en.js` and `src/i18n/es.js` (one help line each)
- Modify: `test/cli.test.js` (two new tests, after the test `help is in English by default`)

**Interfaces:**
- Consumes: the `cli(...args)` helper already defined at the top of `test/cli.test.js`, and its `CLI` constant with the path of `src/cli/index.js`.
- Produces: nothing other tasks use.

- [ ] **Step 1: Write the failing tests**

In `test/cli.test.js`, after the test `help is in English by default`:

```js
test('help does not offer a web mode in either language', () => {
  assert.doesNotMatch(cli('--help').stdout, /--web/);
  assert.doesNotMatch(cli('--lang', 'es', '--help').stdout, /--web/);
});

test('the CLI does not load the web server', async () => {
  const source = await fs.readFile(CLI, 'utf8');
  assert.doesNotMatch(source, /web\/server\.js/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --test-name-pattern="web" test/cli.test.js`
Expected: FAIL, both tests: the help lists `--web` and the source imports `../web/server.js`.

- [ ] **Step 3: Remove the web branch and the flag**

In `src/cli/index.js`, delete these two lines:

```js
} else if (args.web) {
  await import('../web/server.js').then((m) => m.startServer({ open: true }));
```

The line that follows them already reads `} else if (args.presets) {`, so the chain stays valid.

In `parseArgs`, replace:

```js
  const flags = new Set(['help', 'yes', 'dry-run', 'json', 'web', 'force', 'presets', 'settings']);
```

with:

```js
  const flags = new Set(['help', 'yes', 'dry-run', 'json', 'force', 'presets', 'settings']);
```

- [ ] **Step 4: Remove the help line from both catalogs**

In `src/i18n/en.js`, delete from `'cli.help'`:

```text
  --web                        Open the web interface
```

In `src/i18n/es.js`, delete from `'cli.help'`:

```text
  --web                        Abrir la interfaz web
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/cli.test.js test/i18n.test.js`
Expected: PASS.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS, no failures.

- [ ] **Step 7: Commit**

```bash
git add src/cli/index.js src/i18n/en.js src/i18n/es.js test/cli.test.js
git commit -m "feat(cli)!: remove the web mode

BREAKING CHANGE: the --web option and the web script are gone. The desktop app is the graphical interface."
```

---

### Task 4: Workflows

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `npm test` and the `version` field of `package.json`.
- Produces: the secret name `NPM_TOKEN` and the environment name `npm`, which Task 5 documents.

No runnable test exists for a workflow in this repository. The check is a YAML parse plus a read-back; GitHub validates `ci.yml` for real when the pull request is opened, and `release.yml` on the first release. CI runs Node 22, the minimum in `engines`; the reference machine only has Node 24, so that first CI run is also the first time the suite runs on Node 22.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npm ci
      - run: npm test
```

- [ ] **Step 2: Create `.github/workflows/release.yml`**

```yaml
name: Release
on:
  push:
    branches: [release]

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npm ci
      - run: npm test

  publish:
    needs: test
    runs-on: ubuntu-latest
    environment: npm
    permissions:
      contents: write # create the tag and the GitHub Release
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - name: Fail if this version is already published
        run: |
          VERSION=$(jq -r .version package.json)
          if npm view "llm-tuner@$VERSION" version >/dev/null 2>&1; then
            echo "llm-tuner@$VERSION is already on npm. Bump the version first." >&2
            exit 1
          fi
          echo "VERSION=$VERSION" >> "$GITHUB_ENV"
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - name: Tag and create the GitHub Release
        run: gh release create "v$VERSION" --target "$GITHUB_SHA" --generate-notes
        env:
          GH_TOKEN: ${{ github.token }}
```

- [ ] **Step 3: Check that both files parse and read the guard back**

Run:

```bash
python3 -c "import sys, yaml; [yaml.safe_load(open(f)) for f in sys.argv[1:]]; print('ok')" .github/workflows/ci.yml .github/workflows/release.yml
```

Expected: `ok`. PyYAML 6.0.3 is installed on the reference machine. On a machine without it the command fails with `ModuleNotFoundError`: record the check as not run.

Then read `release.yml` and confirm: the `publish` job has `needs: test`; the version check runs before `npm publish`; the check exits with 1 when `npm view` finds the version.

- [ ] **Step 4: Check the guard logic against the registry**

The package is not published yet, so the lookup must report "not found". Run:

```bash
VERSION=$(jq -r .version package.json); if npm view "llm-tuner@$VERSION" version >/dev/null 2>&1; then echo "already published"; else echo "free to publish $VERSION"; fi
```

Expected: `free to publish 0.1.0`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/release.yml
git commit -m "ci: test pull requests and publish from the release branch"
```

---

### Task 5: Documentation

**Files:**
- Modify: `README.md:40-61`
- Modify: `README.es.md:40-61`
- Modify: `docs/PROYECTO.md:38-54`, item 6 of "Ideas and pending items" in section 10, and a new section 11 at the end
- Modify: `CLAUDE.md` (intro, Commands, Gotchas)

**Interfaces:**
- Consumes: the commands `llm-tuner` and `llm-tuner-desktop` (Task 1), the secret `NPM_TOKEN` and the environment `npm` (Task 4).
- Produces: nothing.

Documentation only: no test cycle. The check is the read-back in Step 5.

- [ ] **Step 1: `README.md`, Usage section**

Replace lines 40 to 57 (from `## Usage` through the closing fence of the non-interactive block) with:

````markdown
## Install

```bash
npm install -g llm-tuner
llm-tuner               # terminal wizard
llm-tuner-desktop       # desktop app
```

It needs Node.js 22 or later. The desktop app downloads its runtime (Electron) the first time you run `llm-tuner-desktop`, so that first run needs a network connection and takes longer. The terminal wizard works without it.

## Usage

Non-interactive mode:

```bash
llm-tuner --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --yes
llm-tuner --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --profile quality --yes
llm-tuner --presets          # lists the saved presets
llm-tuner --help
llm-tuner --lang <en|es>     # UI language; saved for next time
```
````

Replace the sentence that starts line 61, `The web and desktop app have an EN/ES selector in the side rail`, with `The desktop app has an EN/ES selector in the side rail`. Keep the rest of that paragraph.

Add at the end of the file:

````markdown
## Development

```bash
git clone https://github.com/ronald32acunadev/llmtuner.git
cd llmtuner
npm install
npm start               # terminal wizard
npm run desktop         # desktop app
npm test
```
````

- [ ] **Step 2: `README.es.md`, same changes in Spanish**

Replace lines 40 to 57 (from `## Uso` through the closing fence of the non-interactive block) with:

````markdown
## Instalación

```bash
npm install -g llm-tuner
llm-tuner               # asistente en la terminal
llm-tuner-desktop       # app de escritorio
```

Necesita Node.js 22 o posterior. La app de escritorio descarga su entorno de ejecución (Electron) la primera vez que ejecutas `llm-tuner-desktop`, así que esa primera ejecución necesita conexión a la red y tarda más. El asistente de terminal funciona sin él.

## Uso

Modo no interactivo:

```bash
llm-tuner --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --yes
llm-tuner --engine lmstudio --model qwen/qwen2.5-coder-32b --ctx 16384 --profile quality --yes
llm-tuner --presets          # lista los presets guardados
llm-tuner --help
llm-tuner --lang <en|es>     # idioma de la interfaz; se guarda para la próxima vez
```
````

Replace the sentence that starts line 61, `La web y la app de escritorio tienen un selector EN/ES en la barra lateral`, with `La app de escritorio tiene un selector EN/ES en la barra lateral`. Keep the rest of that paragraph.

Add at the end of the file:

````markdown
## Desarrollo

```bash
git clone https://github.com/ronald32acunadev/llmtuner.git
cd llmtuner
npm install
npm start               # asistente en la terminal
npm run desktop         # app de escritorio
npm test
```
````

- [ ] **Step 3: `docs/PROYECTO.md`**

In section 2, replace the first code block (lines 40 to 46) with:

````markdown
Installed from npm:

```bash
npm install -g llm-tuner
llm-tuner            # CLI wizard (src/cli/index.js)
llm-tuner-desktop    # desktop app (electron/launch.js → electron/main.js)
```

From a clone of the repository:

```bash
npm install
npm start          # CLI wizard
npm run desktop    # desktop app
npm test           # node --test test/
```
````

In the non-interactive block of the same section, replace `node src/cli/index.js` with `llm-tuner` on the three command lines, and remove `--web, ` from the `# other options:` line.

In section 10, replace item 6 of "Ideas and pending items" with:

```markdown
6. Tell the user when a newer version is on npm (notify only: version, changes and the install command).
```

Add at the end of the file:

````markdown
## 11. Distribution and releases

npm is the only distribution channel. The package `llm-tuner` ships the CLI and the desktop app; there are no installers.

- `package.json` publishes only `src/`, `electron/` and the READMEs (`files`), and declares two commands: `llm-tuner` and `llm-tuner-desktop`.
- Electron is a regular dependency. Electron 44 has no install script: `require('electron')` downloads the runtime the first time the desktop starts. `electron/launch.js` adds no download code; it only reports a start failure in the saved language.
- The web UI in `src/web` is not a user-facing mode. It is the content of the desktop window: `electron/main.js` starts `startServer` on a random local port.

### Workflows

- `.github/workflows/ci.yml`: `npm test` on every pull request to `main` and on pushes to `main`, on Ubuntu with Node 22.
- `.github/workflows/release.yml`: on every push to `release`, runs the tests, stops if the version in `package.json` is already on npm, publishes, and creates the tag `vX.Y.Z` and the GitHub Release.

### One-time setup (owner)

1. Create an npm account and enable two-factor authentication.
2. Create a granular access token with read and write permission on packages.
3. In the GitHub repository, create the environment `npm` and store the token there as the secret `NPM_TOKEN`. Required reviewers on that environment give a manual approval before publishing.
4. Create the `release` branch from `main` and protect it so changes arrive only through pull requests.

npm reserves the name `llm-tuner` only when the first version is published.

### Each release

1. On `main`: `npm version patch|minor|major`.
2. Open a pull request from `main` into `release` and merge it.
3. The workflow publishes the version and creates the tag and the GitHub Release.

If the publish succeeds and the release creation fails, create it by hand with `gh release create vX.Y.Z --target <sha> --generate-notes`. Re-running the job would stop at the version check.
````

- [ ] **Step 4: `CLAUDE.md`**

In the intro paragraph, replace `It has three interfaces over the same core: CLI, web and Electron.` with `It has two interfaces over the same core: the CLI and the desktop app (Electron), which shows the web UI in a native window.`

In Commands, replace these three lines:

```text
npm run web                  # http://127.0.0.1:7860 (PORT env overrides)
npm run desktop              # Electron (electron/launch.js → main.js)
npm run dist / dist:win      # electron-builder (AppImage / Windows portable / dmg)
```

with:

```text
npm run desktop              # Electron (electron/launch.js → main.js)
```

In the same block, replace `# other flags: --force, --dry-run, --candidates N, --json, --presets, --web, --lang <en|es>` with `# other flags: --force, --dry-run, --candidates N, --json, --presets, --lang <en|es>`.

After the Commands block, add:

```markdown
Distribution is npm only (`llm-tuner`, commands `llm-tuner` and `llm-tuner-desktop`). A push to the `release` branch publishes; see `docs/PROYECTO.md` §11.
```

In Gotchas, replace the first bullet with:

```markdown
- Electron 44 has no install script: `npm install` leaves `node_modules/electron/dist` without the binary, and the first `npm run desktop` or `llm-tuner-desktop` downloads it. If that download fails: extract `~/.cache/electron/*/electron-*.zip` into `node_modules/electron/dist` and create `node_modules/electron/path.txt` containing `electron`.
```

- [ ] **Step 5: Read back**

Run:

```bash
rg -n "npm run web|--web|electron-builder|npm run dist|dist:win" README.md README.es.md CLAUDE.md docs/PROYECTO.md
```

Expected: no matches.

Run: `npm test`
Expected: PASS, no failures (the package test confirms the READMEs are still shipped).

- [ ] **Step 6: Commit**

```bash
git add README.md README.es.md docs/PROYECTO.md CLAUDE.md
git commit -m "docs: document the npm install and the release procedure"
```

---

### Task 6: Install from the tarball

**Files:** none changed. The results go in the feature document.

**Interfaces:**
- Consumes: everything from Tasks 1 to 3.
- Produces: the verification record for the first release.

This is the check that the installed package works, which the unit tests cannot give: they run inside the repository, where every file exists.

- [ ] **Step 1: Pack and install into a throwaway prefix**

```bash
npm pack
PREFIX=$(mktemp -d)
npm install -g --prefix "$PREFIX" ./llm-tuner-0.1.0.tgz
```

Expected: the install finishes without errors and without downloading the Electron runtime.

- [ ] **Step 2: Run the CLI from the install**

```bash
"$PREFIX/bin/llm-tuner" --help
```

Expected: the help text, starting with `llm-tuner —`, with no `--web` line, exit code 0.

- [ ] **Step 3: Confirm the runtime was not installed**

```bash
test -e "$PREFIX/lib/node_modules/llm-tuner/node_modules/electron/dist" && echo "runtime present" || echo "runtime absent"
```

Expected: `runtime absent`.

- [ ] **Step 4: First launch without network**

```bash
electron_config_cache=$(mktemp -d) unshare -rn "$PREFIX/bin/llm-tuner-desktop"; echo "exit code: $?"
```

Expected: the message that starts with `Could not start the desktop app:`, no stack trace from `electron/launch.js`, `exit code: 1`. Electron prints its own download error above the message; that is expected. If `unshare` is not permitted on the machine, record this step as not run.

- [ ] **Step 5: First launch with network (owner, needs a display)**

```bash
"$PREFIX/bin/llm-tuner-desktop"
```

Expected: `Downloading Electron binary...`, then the LLM Tuner window opens. On the reference machine the zip may come from `~/.cache/electron`, so the download can be instant.

- [ ] **Step 6: Clean up**

```bash
rm -f llm-tuner-0.1.0.tgz
rm -rf "$PREFIX"
```

Run: `git status --short`
Expected: only the unrelated `.atl/` changes.
