# Release 0.5.0 Preparation

Prepare the current local `main` changes for version 0.5.0 using the existing release workflow.
Execution mode: implement the single approved story in full. Approved by the user: "Si lo apruebo".

## US-01: Prepare the 0.5.0 Release Candidate

- **Statement**: As a maintainer, I want the current main changes prepared as version 0.5.0, so that the application can be released through the existing pipeline.
- **Dependencies**: None.
- **Acceptance criteria**:
  1. Update package.json and both package-lock.json package-version fields from 0.4.4 to 0.5.0 without changing dependencies.
  2. Prepare English release notes summarizing the application changes since v0.4.4, distinguishing implementation evidence from historical verification claims.
  3. Run the existing npm test suite and inspect npm pack --dry-run output; record observed results and any missing proof.
  4. Preserve the existing release workflow and application behavior. Do not push, publish to npm, create remote releases, or merge into release as part of preparation.
- **Verification method**: Read back manifest and lockfile versions, inspect the scoped diff, execute npm test and npm pack --dry-run, and review release notes against the commit range.
- **Allowed implementation surfaces**: package.json, package-lock.json, docs/releases/0.5.0.md, and this story file.
- **Status**: Complete (local preparation only; not published).
- **Observed results**:
  - package.json and both root package-lock.json version fields match 0.5.0; independent parsed comparisons against baseline e25ad7b confirm dependencies and other manifest fields are unchanged.
  - npm test: 317 passed, 0 failed, 0 skipped, exit 0. The restricted run produced no test results and was interrupted; the successful run used elevated local execution for loopback sockets with a 180-second limit.
  - npm pack --dry-run --json: exit 0; llm-tuner-0.5.0.tgz, 60 files, 1,542,492 unpacked bytes. No archive was produced or published.
  - git diff --check: passed. Independent verifier confirmed source, tests, Electron, and workflows are unchanged against baseline and release notes match feature evidence.
  - RED/GREEN and command differential tests are not applicable: no executable behavior changed, only release metadata and documentation.
  - Risk: item 5 (release metadata changes package delivery identity). Independent verification passed after recording this evidence.
  - Native readability review: user granted consent; no findings. Candidate sha256:2689bc0b4fbebc0b040282740255eab4651ec3f39d6fc6a7646bc487c7c460f8, lineage review-60568fbeb7fb86c4, approved and acknowledged with authority burned. This final status entry is a subsequent passive documentation update, not a change to the reviewed package metadata.
  - No commit, push, npm publication, release-branch merge, or GitHub release was performed. Publication remains a separate user decision.

## Scope and Delivery

- User confirmed preparing 0.5.0 with current main changes: "SI por favor".
- Preparation is local only. Publishing requires separate explicit authorization for the destination, operation, and credential/session.
- The existing workflow runs on pushes to release, tests before npm publication, and creates a GitHub release afterward. It must not be triggered during preparation.
- This file is the sole story tracker for this small preparation task.
- Follow-up delivery authorization: the user explicitly approved committing, pushing a release-preparation branch, and opening one pull request against `release` in `ronald32acunadev/llmtuner` with the connected GitHub session; merging is not authorized.
- Delivery strategy: single PR with a user-approved size exception for the accumulated main-to-release changes (approximately 10,700 changed lines). Preserve the existing commits rather than splitting the release promotion.
