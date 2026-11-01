# Release 0.6.0

Publish the CLI and Desktop parity work through the existing release workflow.
Requested by the user: "Creemos un nuevo release entonces". Execution mode: one at a time. Approved by the user: "Apruebo, de a una".

## Facts Checked

- Published version and `package.json`: 0.5.0. Minor bump proposed because this release adds user-facing capabilities.
- `codex/cli-user-guide` merges into `origin/release` with no conflicts (checked with `git merge-tree`, nothing changed). It is 14 commits ahead of `origin/main`, which does not contain them.
- Pushes to `release` run the tests, publish to npm, then create the tag and GitHub release. Releases arrive through a pull request. npm publication cannot be undone for that version number.

## US-01: Prepare the 0.6.0 Release Candidate

- **Statement**: As a maintainer, I want the parity work prepared as version 0.6.0, so that it can go through the existing pipeline.
- **Dependencies**: None.
- **Acceptance criteria**:
  1. `package.json` and both root `package-lock.json` version fields change from 0.5.0 to 0.6.0. The unexplained local lockfile delta (Electron 44.10.1 and others) stays out of the release.
  2. `docs/releases/0.6.0.md` summarizes the application changes since v0.5.0 in English, and states what was not proven.
  3. `README.md` and `README.es.md` list the `/chat` command and the new Desktop capabilities.
  4. `npm test` and `npm pack --dry-run` run on the candidate with observed results recorded here. Confirm the package excludes `.context/`, `odd/` and `test/`.
- **Verification method**: Read back versions, inspect the scoped diff, run the suite and the pack dry run.
- **Status**: Complete.
- **Observed results**:
  - `package.json` and both root lockfile version fields read 0.6.0; `llm-tuner -v` prints 0.6.0. The staged lockfile diff has only those two lines, and the local Electron delta stays unstaged.
  - `npm test`: 496 passed, 0 failed, 0 skipped.
  - `npm pack --dry-run --json`: llm-tuner-0.6.0.tgz, 72 files, 1,595,344 unpacked bytes; no `.context/`, `odd/`, `test/`, `docs/` or `.agents/` files. All new `src/web/public` modules are included.
  - Clean export of the commit with `npm ci --ignore-scripts` on the committed lockfile (Electron 44.9.3): 496 passed, 0 failed. Run on Node 26.13.0; superseded by the Node 24 run below.
  - Scope revision, user: "Node 24 deberia ser el proyecto". Minimum raised from 22 to 24 in `engines`, both workflows and the documentation; recorded as a behavior change in the release notes. Local lockfile delta still excluded.
  - Clean export with `npm ci --ignore-scripts` on the committed lockfile, on Node 24.22.2 with plain `npm test` as CI runs it: 496 passed, 0 failed, 0 skipped.
  - READMEs updated in scope only; `-v` row no longer names a version, so it cannot go stale.

## US-02: Open the Release Pull Request

- **Statement**: As a maintainer, I want one pull request against `release`, so that the release goes through the existing route.
- **Dependencies**: US-01.
- **Acceptance criteria**:
  1. Push `codex/cli-user-guide` and open one pull request against `release` in `ronald32acunadev/llmtuner`, with a user-approved size exception (about 5,000 changed lines).
  2. CI results are read from the pull request, not assumed.
  3. The pull request is not merged here unless the user separately authorizes publication.
- **Verification method**: Pull request state and checks.
- **Status**: Pending approval.

## US-03: Publish

- **Statement**: As a maintainer, I want the approved pull request merged, so that 0.6.0 reaches npm.
- **Dependencies**: US-02 with green checks, and explicit user authorization for the merge.
- **Acceptance criteria**:
  1. The release workflow finishes; `npm view llm-tuner version` returns 0.6.0; tag `v0.6.0` and its GitHub release exist.
  2. A pull request brings the same commits to `main`, since `main` does not contain them.
- **Verification method**: Workflow run, npm registry and GitHub release, observed after the merge.
- **Status**: Pending approval.

## Known Gaps at Release Time

- Stories US-01, US-02 and US-03 of [the parity backlog](../cli-usability-and-user-guide/README.md) stay open until a real Electron window is checked. Confirmation, first-model download and shared hosting have automated and browser evidence only.
- No real GPU benchmark, model download or remote host was exercised.
- Native review was declined for the parity candidate. This release has no review record for it.
- Remaining advisories: `--candidates=abc` is ignored, `cli.loaded` prints a literal `{ctx}`.
