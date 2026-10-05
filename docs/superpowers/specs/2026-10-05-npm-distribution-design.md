# npm distribution — design

Date: 2026-10-05
Status: approved in conversation, pending written review

## Goal

A user installs LLM Tuner with one command and gets both interfaces:

```bash
npm install -g llm-tuner
llm-tuner            # CLI wizard
llm-tuner-desktop    # desktop app
```

The maintainer publishes a new version by merging into a `release` branch. A GitHub Actions workflow tests, publishes to npm, tags the commit and creates the GitHub Release.

## Decisions

| # | Decision | Reason |
|---|---|---|
| 1 | npm is the only distribution channel. `electron-builder` and its binaries are removed. | One channel to maintain; no installers to sign or host. |
| 2 | The package ships the CLI and the desktop app. Electron is a regular dependency. | The user asked for the desktop to come with the install. |
| 3 | The Electron runtime downloads on the first desktop launch, not during `npm install`. | Electron 44 has no install script and downloads its binary on first use. A `postinstall` of our own would force about 283 MB on CLI-only users and depends on install scripts, which the npm 11.19 documentation says a future release will block when unreviewed. |
| 4 | The web interface stops being a user-facing mode. `src/web` stays. | The desktop app is the web UI in a native window: `electron/main.js` imports `startServer` from `src/web/server.js`. |
| 5 | Releases are triggered by a push to the `release` branch. The version is bumped by hand. | Same model the maintainer used in Azure DevOps; no extra release tool to configure. |

## Out of scope

- The update notice (tell the user a newer version exists). It is the next feature and gets its own design.
- npm trusted publishing (OIDC, no token). It can replace the token later without changing the flow.
- Running CI on Windows and macOS. The first version of CI runs on Ubuntu only.

## 1. Package manifest

Changes to `package.json`:

- Move `electron` from `devDependencies` to `dependencies`.
- Remove `electron-builder`, the `build` block, and the scripts `dist`, `dist:win` and `web`.
- Remove `allowScripts`. It pins `electron@38.8.6`, and Electron 44 has no install scripts to allow.
- Add the second command:

  ```json
  "bin": {
    "llm-tuner": "src/cli/index.js",
    "llm-tuner-desktop": "electron/launch.js"
  }
  ```

- Add the publish whitelist. `package.json`, `README.md` and `LICENSE` are always included by npm:

  ```json
  "files": ["src/", "electron/", "README.es.md"]
  ```

- Add `repository`, `homepage` and `bugs` pointing at `https://github.com/ronald32acunadev/llmtuner`, and `keywords`.

Other repository changes:

- Delete `build/`. It only holds `icon.ico` and `icon.png` for `electron-builder`; the app uses the copies in `electron/`.
- Add a `LICENSE` file with the MIT text. `package.json` already declares `"license": "MIT"`, but the file does not exist. Copyright holder: Ronald Daniel Acuña Arias, 2026.
- Regenerate `package-lock.json` with `npm install` after the dependency changes, because CI installs with `npm ci`.

## 2. Desktop launcher

`electron/launch.js` becomes an installed command:

- Add the shebang `#!/usr/bin/env node` as the first line.
- Keep the current behavior: resolve the Electron executable with `require('electron')`, disable the Chromium sandbox on Linux only when `chrome-sandbox` lacks root setuid, spawn Electron with `electron/main.js`.

No download or repair code is added. `require('electron')` already downloads the runtime when it is missing and prints `Downloading Electron binary...`.

Error handling: if `require('electron')` throws (no network, proxy, disk full), the launcher prints one localized message and exits with code 1. The message says the desktop runtime could not be downloaded, that a network connection is needed the first time, and that the CLI (`llm-tuner`) works without it. It is a new i18n key in both `en` and `es`, and the locale is resolved the same way the CLI resolves it.

## 3. Web mode removal

- `src/cli/index.js`: remove the `--web` branch (the `args.web` case that imports `../web/server.js`) and remove `web` from the set of known flags in `parseArgs`. The CLI does not reject unknown options today, so `--web` is then ignored like any other unknown option; adding validation of unknown options is not part of this change.
- `src/i18n/en.js` and `src/i18n/es.js`: remove the `--web` line from the help text.
- `src/web/` is not modified.

## 4. Workflows

### `.github/workflows/ci.yml`

Runs on every pull request to `main` and on pushes to `main`.

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

Node 22 is the minimum declared in `engines`, so CI tests the oldest supported version.

### `.github/workflows/release.yml`

Runs on every push to `release`.

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

Failure cases:

| Failure | Result | Recovery |
|---|---|---|
| Tests fail | Nothing is published. | Fix on `main`, merge into `release` again. |
| Version already on npm | The job stops before publishing. | Bump the version on `main`, merge again. |
| `npm publish` fails | No tag, no release. | Fix the cause (usually the token), re-run the job. |
| Publish succeeds, release creation fails | The version is on npm without a tag. | Run `gh release create vX.Y.Z --target <sha> --generate-notes` by hand. Re-running the job would stop at the version check. |

## 5. Release procedure

One-time setup, done by the maintainer:

1. Create an npm account and enable two-factor authentication.
2. Create a granular access token with read and write permission on packages.
3. In the GitHub repository, create the environment `npm` and store the token there as the secret `NPM_TOKEN`. Adding required reviewers to the environment gives a manual approval before publishing.
4. Create the `release` branch from `main` and protect it so changes arrive only through pull requests.

The name `llm-tuner` was free on 2026-10-05, but npm reserves a name only when the first version is published.

Each release:

1. On `main`: `npm version patch|minor|major`. This updates `package.json` and `package-lock.json`.
2. Open a pull request from `main` into `release` and merge it.
3. The workflow publishes `llm-tuner@X.Y.Z`, creates the tag `vX.Y.Z` and the GitHub Release with notes generated from the merged pull requests.

## 6. Testing

- **Package contents** (new test): run `npm pack --dry-run --json` and assert that the file list includes `src/cli/index.js`, `src/web/server.js`, `electron/launch.js`, `electron/main.js`, `electron/icon.png`, `README.md` and `README.es.md`, and excludes everything under `test/`, `docs/`, `odd/`, `openspec/`, `.atl/` and `build/`, plus `AGENTS.md` and `CLAUDE.md`. On Windows the `npm` command needs `shell: true`.
- **Manifest** (same test file): both `bin` targets exist and start with the shebang; `electron` is in `dependencies`.
- **CLI**: update `test/cli.test.js` so the help text no longer lists `--web` and passing `--web` no longer starts the web server.
- **i18n**: `test/i18n.test.js` already fails when `en` and `es` diverge or when `src/` references a missing key. It covers the new launcher message and the removed help line.
- **Manual check before the first release**: `npm pack`, then `npm install -g ./llm-tuner-<version>.tgz` in a clean environment, then run `llm-tuner --help` and `llm-tuner-desktop`. Confirm the runtime downloads on that first launch and the window opens.

## 7. Documentation

- `README.md` and `README.es.md`: the Usage section starts with `npm install -g llm-tuner` and the two commands, and says the first desktop launch downloads the runtime. The `npm run web` line goes away. The non-interactive examples use `llm-tuner` instead of `node src/cli/index.js`. A short development section keeps `npm install`, `npm start`, `npm run desktop` and `npm test`.
- `docs/PROYECTO.md`: update the usage section and the flag list (no `--web`), replace the pending item about packaging with `electron-builder`, and add the release procedure.
- `CLAUDE.md`: remove `npm run web` and `npm run dist / dist:win` from Commands, and rewrite the Electron gotcha: the binary is not installed by `npm install`; it downloads the first time the desktop starts. The manual extraction from `~/.cache/electron` stays as the fallback when that download fails.
