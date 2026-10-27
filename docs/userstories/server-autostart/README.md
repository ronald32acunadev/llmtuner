# Server startup after login

Start the remote LLM Tuner server after user login when explicitly enabled in Settings, with discoverable connection credentials in CLI and Desktop.

**Approval:** approved on 2026-10-27. **Execution mode:** remaining stories approved for sequential execution on 2026-10-27. US-02 and US-03 are now authorized.

## Scope and proposed design

- Use the operating system's per-user login-start mechanism to launch the headless server, independently of the Desktop window. Reuse the existing server configuration and token.
- Expose the same setting in CLI Settings and Desktop Settings. Default to disabled; disabling removes the login-start registration without deleting credentials.
- Reveal the token only after an explicit local action; provide a Desktop copy action and explain how to connect using the server computer's reachable address.
- Proposal: preserve Windows, macOS, and Linux support through platform-specific adapters. Availability and actual operating-system verification must be reported separately; mocks do not prove real login startup.
- Alternative considered: launch the Desktop application on login. Not recommended because the requested outcome is a background server, not opening a window. Machine-wide boot services are out of scope: the user explicitly selected startup after login.
- Exact labels, CLI syntax, and platform registration details remain implementation planning decisions, subject to the approved scope and verified platform documentation.

## US-01 — Manage login startup from CLI Settings

As a server owner, I want to enable or disable automatic server startup from CLI Settings, so that the server becomes available after I log in without a manual command.

**Status:** complete. **Dependencies:** none. Commit: `99874b1` (created externally, not by this agent).

### Acceptance criteria

- CLI Settings exposes automatic server startup and its current enabled/disabled state.
- Enabling registers the headless server for the current user's login, using the saved host, port, and token; initialize missing server configuration using existing defaults.
- Disabling removes this feature's registration and preserves server configuration and token.
- Registration failures are actionable and do not falsely report success; repeated enable/disable operations are safe.
- Existing manual `/serve` behavior and unrelated Settings remain unchanged.

**Verification:** deterministic adapter/configuration and CLI tests with temporary state outside the worktree; observe RED before implementation; platform smoke checks where available without logging out or changing the owner's actual startup registration without consent.

## US-02 — Control login startup from Desktop Settings

As a Desktop user, I want the same automatic server startup setting, so that I can manage it without using the terminal.

**Status:** complete. **Dependencies:** US-01 shared startup implementation.

### Acceptance criteria

- Desktop Settings displays and changes the same login-start state as CLI Settings.
- Success, failure, and disabled state are visible and accurately reflect the registration result.
- Closing the Desktop window does not remove the login-start registration or terminate an independently running login-start server.
- Remote clients cannot change the host computer's startup registration through these new controls.
- New UI text uses the existing English/Spanish localization catalogs.

**Verification:** settings/API authorization and UI tests plus Desktop smoke check; existing Settings and server authentication regression checks.

## US-03 — Discover server connection credentials

As a server owner, I want to view the server token from CLI Settings and reveal/copy it in Desktop Settings, so that I can connect from another computer.

**Status:** complete. **Dependencies:** shared server configuration; can reuse US-01 configuration handling.

### Acceptance criteria

- Explicit local actions reveal the existing saved token without regenerating it or starting another server.
- Desktop provides a copy action with success/failure feedback and keeps the token hidden by default.
- Missing server configuration has a clear explanatory state.
- Connection guidance distinguishes the listen address `0.0.0.0` from an address usable by another computer.
- New credential controls do not expose the token through remote state/telemetry or unauthenticated endpoints.
- Help and English/Spanish documentation explain login startup and token retrieval.

**Verification:** token stability, missing-config, local-access enforcement, clipboard/UI, and authentication regression tests; documentation readback. Never record a real token in tests, logs, or task evidence.

## Backlog review

Coverage: CLI and Desktop login startup, enable/disable, and token discovery are covered. Startup implementation is shared rather than duplicated. No machine-wide service, token rotation, firewall changes, remote execution, or automatic model loading is included.

Feasibility: the existing `/serve` command already persists server configuration and reuses the token. CLI and Desktop share settings; Desktop currently owns a separate local server tied to its window lifecycle, so login startup must remain independent.

Risk: security-sensitive token access and operating-system startup registration require independent verification after implementation checks. Platform availability may limit real login verification.

## Observed verification

Current verification: full isolated suite 303 passed, 0 failed/skipped; installed Electron main/preload/renderer smoke passed. See dated execution log below for prior RED/GREEN and remaining platform limitations. US-02/US-03 acceptance checks passed; user declined native review for this candidate.

## Request and decisions

- Original request: "Podemos añadir una funcion para cli y desktop para con una funcion iniciar el servicio al encender la computadora lo que no veo es donde ver el token del servidor para poder usuarlo en otra computadora"
- Settings requirement: "Si es lo que quiero si lo habilito en settings"
- Startup timing: "Despues de iniciar session"
- Execution evidence will be kept in this file. If ODD tracking becomes necessary, link it here rather than duplicating the execution log.

## Execution log

- 2026-10-27: User approved: "Apruevo el backlog por favor avancemos una a una". US-02 and US-03 remain pending and require subsequent approval before execution.
- US-01 preparation: confirmed existing CLI Settings and server configuration helpers; no implementation code or startup registrations changed.
- Blocker: the required `odd-explorer` model `gpt-6.1-luna` is unavailable in the session. The dispatch failed with `Unknown model`; `gpt-6-luna` is available, but selecting a replacement requires user authorization. No worker was launched.

- User authorized `gpt-6-luna` for read-only exploration. Map completed; source synthesis remains local-first. Implementation plan: deterministic OS-registration tests (RED), shared per-user startup adapter and saved-config launcher, CLI Settings integration, focused/suite/differential checks and independent verification. Operational tracking: [ODD tasks](../../../odd/tasks/server-autostart.md).

- US-01 implemented by supported hosted fallback `gpt-6-luna`: primary LM Studio model failed a test-generation correction; Ollama had no loaded model. Source authored by implementer, not planner.
- RED observed for missing adapter/launcher, CLI setting, Linux escaping/control characters, nonboolean rejection and Windows missing-directory case. One independent correction batch resolved Linux serialization and four existing CLI-navigation tests.
- Independent verifier: complete-copy `npm test` exit 0, 286 passed, 0 failed, 0 skipped. Linux `desktop-file-validate` and harmless actual `gio launch` passed plain/backslash/dollar/quote paths with exact recorded argv. Rejected controls wrote no configuration/registration. Windows directory creation tested with injected real filesystem; native Windows/macOS login not available. Baseline/current manual serve and version output identical; help differences limited to authorized additions.
- Parent spot check: focused five-file command exit 0; `git diff --check` passed. No owner startup registration was activated. US-02/US-03 remain pending.
- Needs decision: native review consent pending, high risk, staged projection, 10 files/581 changed lines. Target `sha256:278adf4f02363abe38184709a872a40de9215d3eee727f902d2454d0cfd86585`; lineage `review-8427246bf7f02efe`. Only US-01 implementation files are staged; pre-existing README/CLAUDE/script changes are excluded. No commit or publication. Feature exceeds the advisory 400-line delivery threshold; chain strategy must be chosen before any work-unit commit.

- Native review: user granted consent (`1`); four lenses completed. R3-001 corrected stale Windows shortcut false success using terminating PowerShell errors, explicit failure exit, and persisted metadata readback. Regression suite: parent observed 9 adapter tests passing. Previous full suite 286/286 predates this final two-file correction; no newer full-suite claim.
- Native targeted validation approved; exact acknowledgement returned `gentle-ai.review-acknowledged/v1`, action `acknowledged`, authority `burned`. Terminal target `sha256:7daaa10546f2fe476481d7a706f4d95a7ba46dcb2df878428f7902eb664cd67e`; lineage `review-8427246bf7f02efe`. No further lifecycle on unchanged content. No commit/publication; chain strategy pending before commit. US-02/03 unstarted, native Windows/macOS login still unverified.
- Prompt-learning clarification: reusable rejected-answer corrections are persisted in `.agents/local-llm-prompt-rules.md` for every subsequent local request; this improves prompt/context rather than model weights. Recorded JS runner/isolation/assertion guidance and explicit arrow-mock parameters.

- Scope update: "OK continua con las demas tareas , cumpliendo la regla de modelo local por favor". Execute US-02 then US-03 without another transition approval. First use pumbastudio and immediately persist reusable rejection corrections before retry/provider changes.
- Design for remaining stories: restricted Electron IPC, not HTTP endpoints, for local startup/credentials; validate sender WebContents, top frame and origin. Preload exposes only named operations. Pass actual Node executable from the Node-based Desktop launcher, never use Electron executable as Node. No changes to generic HTTP settings/telemetry.

- US-02/03 progress: pumbastudio generated IPC controller, sandbox preload, Electron integration, Node runtime forwarding, isolated UI module, markup and catalogs. RED then GREEN observed for controller 5 tests, preload 2, UI interaction 6. Reusable corrections persisted before each single local retry. No fallback used for these stories; integration and CLI token tests/independent final checks remain pending.

- Repository checkpoint changed externally during local generation: HEAD is now `b61854e` (preceded by `df8a51b` and `99874b1`). No agent commit was issued. Existing controller/test/tracking files became tracked; bytes of the controller match the reviewed local output. Preserved these commits and all remaining worktree changes.

- US-02/US-03 independent verification: complete isolated `npm test` exit 0, 303 passed, 0 failed/skipped. Direct controller 5, preload 2, UI 6 and CLI token 3 tests passed. Syntax/diff checks and English/Spanish catalog parity passed; 89 referenced localization keys verified. Parent repeated controller/UI/CLI focused commands successfully.
- Security probes: 20 unauthorized IPC invocations caused zero effects and preserved configuration hash. Explicit reveal/copy preserved token bytes; malformed reveal config rejected. Differential `--version` and manual serve output identical to reviewed US-01; help changed only by authorized connection guidance.
- Installed Electron runtime smoke (hidden/headless) passed: real main/preload/renderer boot, bridge, disabled startup status, missing config, explicit synthetic-token reveal, Escape clearing, and unchanged configuration bytes. No real clipboard or startup registration was modified. Existing repository sandbox-disable behavior was used, without additional weakening. This is not visual layout proof or a real logout/login test; native Windows/macOS registration remains unavailable.
- Review scope for remaining stories must include the externally committed controller `b61854e` plus current changes; use preceding `df8a51b` as review boundary to exclude unrelated prior README/CLAUDE/script commits. External commits are preserved. No new agent commit or publication performed.

- User selected `2`: native review omitted only for the remaining candidate. Exact provider invocation returned `action: declined`, `consent: declined_this_candidate`, matching target `sha256:8831aa5bebf5e4dbe31268e02ec63607f5c26c63516fc27d4ed9bd9a92f52154`. No review approval or record is claimed; future reviews remain enabled. US-02/US-03 functional acceptance complete with 303 passing tests and isolated Electron smoke. No new agent commit/push/PR, clipboard mutation, or owner startup activation. Delivery strategy remains ask-on-risk; choose a chain strategy before an agent work-unit commit for the >400-line remaining change.

- Delivery authorization: user requested one PR ("Hagamos un pr y yo luego pruebo") and explicitly approved publishing `feat/remote-servers` to `ronald32acunadev/llmtuner` against `main` using this session GitHub connection. Strategy: single-pr, size exception explicitly requested. Current full branch includes prior remote-server/client and documentation commits; scope is 51 files, 3,554 additions and 371 deletions before final bookkeeping. Fresh workspace `npm test`: 303 passed, 0 failed/skipped, exit 0. No automatic merge requested. Manual logout/login and Windows/macOS testing remain for the user.

- Publication commit: `940102e4f5448ec60d546d4b0d7a1dd126e6b741` (`feat(server): add desktop startup controls and token discovery`), parent `b61854e`. Tree uploaded with the connected GitHub session exactly matches the local staged tree. Single-PR branch boundary is `feat/remote-servers` against `main`; includes prior remote-server/client branch commits plus all three stories. Branch update and PR creation follow this metadata checkpoint; no automatic merge.
