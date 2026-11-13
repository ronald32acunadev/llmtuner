# Update README Audit and Synchronization

Audit, update, and synchronize `README.md` and `README.es.md` to reflect current codebase facts, Node.js >=24 requirements, and CLI/platform capabilities.

## Audit Findings & Discrepancies

- **Manifest Name & Version**: `llm-tuner@0.6.0`
- **Existing README.md H1**: `# LLM Tuner`
- **Companion READMEs**: `README.es.md: # LLM Tuner`
- **Classification**: **Drifted**
  - **Node.js Engine Badge**: `README.md` and `README.es.md` display `node->=22` badges while `package.json#engines` and CI require `>=24`.
  - **Settings Scope**: Documentation under `/settings` in both files only mentions language and theme, omitting automatic server startup after login and managed remote computers/servers.
  - **Repository Structure Map**: Architecture tree in both READMEs omits `chat.js` under `src/cli/commands/` and does not reflect all `src/platform/` service modules (`server-autostart.js`, `shared-server.js`).
  - **Synchronization**: `README.md` and `README.es.md` must maintain parity in structure, badges, options tables, and cross-references.

---

## US-01: Audit, Modernize, and Synchronize English and Spanish READMEs

- **Statement**: As a developer or user visiting the repository, I want accurate, verified, and synchronized documentation in English and Spanish matching `llm-tuner@0.6.0` and Node.js >=24, so that I have reliable setup instructions, complete CLI flag tables, and accurate architecture paths.
- **Acceptance criteria**:
  - `US-01 / AC-01`: Update Node.js version badges in both `README.md` and `README.es.md` to `>=24` matching `package.json#engines.node`.
  - `US-01 / AC-02`: Update `/settings` command descriptions and interactive menus in both READMEs to include automatic server startup after login and remote computer connection management.
  - `US-01 / AC-03`: Update repository tree in both READMEs to include `src/cli/commands/chat.js` and annotate `src/platform/` modules accurately.
  - `US-01 / AC-04`: Verify every command, script, flag, and relative link documented against codebase files with zero dead sections or placeholder links.
  - `US-01 / AC-05`: Maintain exact structural and linguistic synchronization between `README.md` (English) and `README.es.md` (Spanish).
- **Dependencies**: None.
- **Verification method**: Automated test suite (`npm test`), manifest verification (`package.json`), CLI parser audit (`src/cli/router.js`), and link/path checks.
- **Status**: Pending approval.
- **Observed results**: Pending.

---

## QA Traceability Matrix

| Story / criterion or change-related regression risk | Test file and test name, or reproducible manual procedure | Observed result and evidence |
| :--- | :--- | :--- |
| `US-01 / AC-01` | Inspect `README.md` and `README.es.md` line 7 against `package.json` `engines.node` | Pending |
| `US-01 / AC-02` | Check `/settings` descriptions in `README.md` and `README.es.md` against `src/cli/commands/settings.js` and `src/i18n/{en,es}.js` | Pending |
| `US-01 / AC-03` | Check repository tree in `README.md` and `README.es.md` against `ls -R src/` | Pending |
| `US-01 / AC-04` | Audit all CLI flags in Options table against `src/cli/router.js#parseCliArgs` and run `npm test` | Pending |
| `US-01 / AC-05` | Markdown section-by-section diff comparison between `README.md` and `README.es.md` | Pending |
