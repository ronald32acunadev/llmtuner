# CLI Usability and Website Documentation Source

Make existing CLI workflows understandable to non-expert users and maintain one repository document for the existing website skill to consume.
Execution mode: all stories approved ("Dale me parece perfecto"; "Todas de una vez"). Reapplication authorized on 2026-10-31: "Peudes re aplicar los cambios". No website mutation, publication, or new skill is authorized. The 2026-10-31 full-parity correction below supersedes the earlier narrowed exclusions; GUI scope is now explicitly CLI plus Electron Desktop (not standalone browser); revised implementation approved: "Si lo aprubo datle". Execute all stories in dependency order; no per-story reapproval.

## Design and Revised Scope

- Target 100% functional parity between the CLI and Electron Desktop. Standalone browser usage is outside parity acceptance; do not delete its existing functionality or weaken its protections. Desktop renderer changes may still live in shared `src/web/public/` files.
- Use task-oriented navigation, explanations, feedback, and confirmations in both interfaces. Preserve existing scripted commands and flags.
- Distinguish connecting to another computer from sharing this computer. Correct the remote-load adapter as part of making that workflow usable.
- Maintain `docs/USER_GUIDE.md` as the single English website input, with stable section identifiers, usage steps, expected results, troubleshooting, platform differences, and dated user-visible changes.
- Reuse the other project's skill; its owner will update it. The former exclusion of CLI chat and other one-sided capabilities is superseded: every existing user-facing capability must have an equivalent CLI and GUI workflow. Capabilities absent from BOTH interfaces are not new parity requirements.

## US-01: Make Existing CLI Workflows Understandable

- **Statement**: As a non-expert user, I want task-oriented CLI guidance, so that I can use existing functions without memorizing commands or internal terminology.
- **Acceptance criteria**:
  1. Review menu, load, presets, MCP, settings, help, and server-start workflows against the GUI's explanations and sequence.
  2. Explain choices, prerequisites, progress, errors, completion and next steps; identify active local or remote targets where relevant.
  3. Preserve noninteractive commands/flags and explicit privileged actions/confirmations.
  4. Achieve 100% bidirectional functional parity for existing user-facing capabilities, with equivalent results and understandable workflows. Preserve permissions and existing automation; never silently omit a surface or weaken a guard.
- **Dependencies**: None.
- **Verification method**: Public-interface deterministic tests and baseline stdout/stderr/exit-code comparisons in isolated configuration. Meaningful new behavior observes RED/GREEN; preserve legacy flows.
- **Status**: Reopened for the full-parity scope correction; earlier restoration evidence preserved, revised acceptance pending.
- **Observed results**: Fresh task-guidance checks and 53 existing CLI regressions passed. Eight baseline/candidate public CLI scenarios have identical stdout, stderr and status. Final integrated run: 340/341 passed; remaining telemetry-event assertion is being classified against baseline. Original 340-case result remains historical.

## US-02: Guide Remote Computer Connections End to End

- **Statement**: As a CLI user, I want to configure and understand a connection to another computer, so that I can use its models without editing settings files manually.
- **Acceptance criteria**:
  1. Guide list/add/test/select/remove of saved servers using shared settings and client helpers.
  2. Explain connecting versus sharing, where the address/token belong, and which computer executes operations.
  3. Correct remote calls to nonexistent tuner methods and read planning/presets from the selected target. Never download locally for an empty remote inventory.
  4. Never silently ignore `--dry-run`. The earlier repair refuses remote dry-run; the revised full-parity scope must provide equivalent supported local/remote preview behavior in both interfaces. Historical refusal evidence below is not completion evidence for this revised requirement.
  5. Mask token entry, omit tokens from ordinary listings/logs, preserve explicit owner reveal, and do not contact real remote destinations without separate authorization.
- **Dependencies**: US-01 navigation conventions.
- **Verification method**: Public command/client tests with mocks and temporary configuration for invalid input, add/cancel/failure, real prompt validation/editing, explicit connection tests, persistent selection/removal, token redaction, remote planning/loading and dry-run exit/nonmutation. Independent verification for credential/shared CLI changes.
- **Status**: Reopened for the full-parity scope correction; earlier restoration evidence preserved, revised acceptance pending.
- **Observed results**: Restored real-Inquirer URL/editing/cancellation tests, saved-server operations/token redaction and public remote dry-run nonmutation. 24 focused cases pass. Independent null-profile-preview failure corrected with observed RED/GREEN and rechecked through actual client/SSE: all profiles selectable, saved/default choice retained, remote loading completes without a local tuner.

## US-03: Maintain One Complete Website Source Document

- **Statement**: As the website maintainer, I want one current document describing every implemented user-facing function and its usage, so that my existing external skill can regenerate the website after changes.
- **Acceptance criteria**:
  1. Maintain `docs/USER_GUIDE.md` as the CLI/Desktop function inventory and step-by-step website source. Retain accurate existing browser notes, clearly outside parity acceptance; do not advertise proposed functions as implemented.
  2. Document purpose, prerequisites, numbered steps, supported examples, expected results and recovery. Do not advertise planned behavior.
  3. Cover local/remote responsibilities, server configuration, sanitized tokens and HTTP limitations, loading/profiles, presets, MCP, settings and GUI-only functionality.
  4. Use stable identifiers and dated change entries linking affected workflows.
  5. Keep instructions synchronized with restored behavior; leave the external skill/site untouched.
- **Dependencies**: US-01 and US-02 for final CLI instructions.
- **Verification method**: Source-backed coverage and command checks, local anchor/link validation, no real engine/service/credential access. Passive documentation uses structural checks instead of RED/GREEN.
- **Status**: Reopened for the full-parity scope correction; earlier restoration evidence preserved, revised acceptance pending.
- **Observed results**: Canonical guide restored with all prior stable sections and dated reapplication entry; 15 unique anchors and 22 valid internal links verified. Source-backed coverage independently checked. No website/other skill changes.

## Approval and Execution Log

- Original intent: "creo que podemos hacer que el cli se igual de compresenbible para cualquier usuario" and "crear documentacion de todas las funciones y como deben utilizarse paso a paso para un sitio web que tengo lo pueda usar para regenerar el sitio con los cambios realizados".
- Scope correction: "tenia un skill en el otro proyecto me gustaria que este apuntara a un documento para ver los cambios"; confirmed "Correcto, no hace falta luego actualizo la otra".
- Approval: "Dale me parece perfecto"; all-stories execution: "Todas de una vez".
- Restoration request: "Peudes re aplicar los cambios". The clean f073e76 checkout lacks the earlier uncommitted implementation. Restore that approved scope without unrelated README or CLAUDE changes.
- [Implementation plan and log](../../../odd/tasks/cli-usability-and-user-guide.md). This file owns story status; the linked plan owns task execution evidence.
- Chain strategy, local commits, and candidate native review were not approved/completed in the previous run. Do not infer publication or merge permission.

- 2026-10-31: npm ci --ignore-scripts initially installed lockfile versions. Later package-lock.json and installed Electron/systeminformation versions changed unexpectedly during shared work; cause unconfirmed and neither parent nor implementer intentionally updated them. Preserve this unrelated lockfile delta; exclude it from the feature review/staging. No dependency upgrade is part of this feature.
- Verification limitation: first full suite 339/340 passed with an isolated Spanish subprocess status failure; exact case and complete CLI file pass on baseline and candidate. Final suite 340/341 passed with an extra telemetry event in unchanged core tuner event assertions; no third candidate retry or unrequested core/test fix.

- Final baseline diagnostic: 317/317 pass; candidate telemetry failure not reproduced, cause unknown. Reapplication is present but full-suite proof remains partial (340/341). Await authorization before expanding scope to unchanged core/test code; native review/commits remain pending.

## Full-Parity Scope Correction — 2026-10-31

User correction (verbatim): "Como se solicito anteriormente deberian tener el 100% de funciones , debemos añadir en algun lugar cuando se pida alguna otra funcion debe quedar guardado que debe hacerse en el gui y cli".

This corrects the previous scope, not the already recorded evidence. The parent had narrowed the requested outcome incorrectly. Preserve implemented work, but do not call full parity complete. No application code or AGENTS policy is implemented by this planning amendment.

### Proposed Durable Rule — AGENTS.md

The repository-wide instruction belongs in `AGENTS.md`; `CLAUDE.md` already imports it, so do not duplicate competing rules. Proposed wording:

> Every new or changed user-facing capability must be implemented and maintained in both the CLI and Electron Desktop (GUI), using the shared core/API rather than duplicating business logic. Plan both interfaces in the same user story, with equivalent inputs, outcomes, errors, confirmations and local/remote target semantics. Include acceptance tests for both surfaces and update CLI help, both localization catalogs and `docs/USER_GUIDE.md` together. A feature is incomplete while either interface is missing its equivalent workflow. Maintain a bidirectional capability inventory as completion evidence. Platform/security restrictions require a secure equivalent or an explicit user-approved exception; never silently waive parity or bypass a guard.

### Verified Remaining Gaps

| Capability | Required counterpart | Main evidence |
|---|---|---|
| Conversation tester | CLI chat, context and selected-target behavior | `src/web/public/app.js:913-958`; `src/core/client.js:64-68` |
| Candidate count | GUI control with shared validation/defaults | `src/cli/commands/load.js`; `src/web/public/app.js:821` |
| Dry-run preview | GUI and remote API support, valid non-applied outcomes | `src/core/tuner.js:273,308-319`; `src/web/server.js:188-198` |
| Apply preview/confirmation | GUI and remote CLI inspection/accept/decline through one job | `src/cli/commands/load.js`; `src/web/server.js:190-197` |
| Full preset inventory | GUI listing/filtering, same local/remote records | `src/cli/commands/presets.js:12-29`; `src/web/server.js:183` |
| First-model download | Validated GUI operation with progress, no arbitrary shell endpoint | `src/cli/commands/load.js`; `src/web/public/app.js:537-542` |
| Saved-computer semantics | Matching add/select/test/remove validation and confirmations | `src/cli/commands/servers.js`; `src/web/public/app.js:385-479` |
| Configure/start shared server | GUI counterpart to CLI host/port/token/listener operation | `src/cli/commands/serve.js:28-49`; `electron/main.js:25-29,80-83` |
| MCP endpoint/configuration status | Equivalent engine eligibility and custom-name detection | `src/cli/commands/mcp.js:23-46,71-115`; `src/web/public/app.js:290-301,513-523` |
| Remote progress/results | Equivalent telemetry, candidate and profile-fallback information | `src/cli/commands/load.js`; `src/web/public/app.js:824-862` |

### Resolved Product Scope

User decision (verbatim): "CLi y desktop navagador no se usa".

GUI means Electron Desktop. Native startup, credential and shared-server controls must use the trusted local Desktop bridge or existing local platform services, equivalent to local CLI operations. A selected remote model target must not silently redirect local OS/agent configuration. Existing Electron trusted-sender checks, remote-install prohibition, authentication and token boundaries remain intact. No standalone-browser parity implementation, companion or removal is requested.

The following stories complete the revised backlog. Prior implementation and evidence are retained, not recreated or discarded. Approval of the old narrowed backlog does not approve these new contracts; request approval for this revised scope with the existing all-stories preference.


## US-04: Establish the Permanent CLI/Desktop Parity Rule

- **Statement**: As the project owner, I want one mandatory repository rule for both interfaces, so that future features cannot be delivered in only the CLI or Desktop.
- **Acceptance criteria**:
  1. Add the proposed mandatory rule to root `AGENTS.md`, explicitly defining GUI as Electron Desktop, excluding standalone browser as a parity target and preserving all security boundaries. `CLAUDE.md` already imports it; do not duplicate the rule.
  2. Require both surfaces in every user-facing story, shared core/API business logic, equivalent capabilities/outcomes/errors/confirmations/target semantics, paired acceptance checks, EN/ES strings, help and `docs/USER_GUIDE.md` updates.
  3. Require a stable bidirectional capability inventory in the existing guide with CLI/Desktop entry points, coverage evidence and pending/complete states. No claim of 100% while a capability or required proof is missing; no unilateral exception.
  4. Clarify that presentation differences (terminal output versus visual controls) do not require identical widgets. Existing automation remains supported; capabilities absent from both interfaces are not invented as parity work.
- **Dependencies**: None; implement this story first after approval.
- **Verification method**: Read back the exact policy, verify the CLAUDE import and scope, reconcile inventory with the source-backed gap table and all revised stories. Passive policy documentation does not have a meaningful runtime RED; use structural/semantic readback, not a fabricated functional test.
- **Status**: Complete (passive policy/inventory readback verified).
- **Observed results**: Root AGENTS.md now contains the mandatory CLI/Electron Desktop parity rule, paired checks/docs requirement, explicit browser exclusion without removing guards, and no unilateral completion/exception. CLAUDE import verified. Canonical guide inventory added with entry points and explicit pending proof states; no 100% claim is made.

## US-05: Offer the Existing Conversation Tester in the CLI

- **Statement**: As a CLI user, I want to test a loaded model with successive messages, so that I can perform the same conversation check as in Desktop.
- **Acceptance criteria**:
  1. Provide a discoverable CLI conversation workflow with engine/model and active local/remote target, reusing existing chat/core/client support.
  2. Preserve conversation history for successive messages, expose responses/errors and let the user leave without changing models or saved settings unexpectedly.
  3. Match Desktop chat behavior for explicit inputs and document both entry points; do not turn this into a new general-purpose agent or model-management feature.
- **Dependencies**: US-04.
- **Verification method**: RED/GREEN public CLI and Desktop-handler tests using the same fake engine/client conversation, message order/history, errors and exit behavior; no real engine/remote connection.
- **Status**: Implemented and independently verified; manual Desktop window check pending.
- **Observed results**: `/chat` with guided loop and `--prompt`; test/cli-chat.test.js 10/10; help and guide updated. Desktop chat already existed.

## US-06: Expose Candidate Count in Desktop

- **Statement**: As a Desktop user, I want to choose the candidate count, so that tuning has the same configurable limit as the CLI.
- **Acceptance criteria**:
  1. Add an accessible localized Desktop control and forward the explicit count to the shared load operation for local and remote targets.
  2. Reuse the shared accepted domain/default; invalid input must not launch a job. Preserve existing valid CLI options and default behavior.
  3. Use equivalent labels/instructions without duplicating candidate generation in either interface.
- **Dependencies**: US-04.
- **Verification method**: Paired CLI/Desktop request and tuner-argument assertions for the default, valid explicit count and invalid rejected input, including no job/persistence on rejection.
- **Status**: Implemented and independently verified; manual Desktop window check pending.
- **Observed results**: Desktop control and CLI share parseCandidateCount; invalid values are refused before any job (test/load-flow.test.js, test/load-transaction.test.js, test/cli-remote-load.test.js).

## US-07: Support Equivalent Dry-Run Outcomes Locally and Remotely

- **Statement**: As a CLI or Desktop user, I want the existing dry-run operation available through either interface and target, so that preview behavior is not interface-dependent.
- **Acceptance criteria**:
  1. Add a Desktop dry-run choice and transport the same option through the existing remote client/API/job path; replace the temporary remote refusal only after support exists.
  2. Reuse core semantics: measurements/unloading may occur, but no final preset save, application or final model load. Do not advertise side-effect-free planning.
  3. Return/display a valid preview outcome instead of treating the absence of `loaded.ok` as failure. Explicit dry-run must never be ignored.
- **Dependencies**: US-04; coordinate shared result contracts with US-08.
- **Verification method**: Paired public CLI/Desktop tests through fake API/jobs and core spies; assert result/status, final save/apply/load call counts and unchanged persisted preset data; keep local behavior regression coverage.
- **Status**: Implemented and independently verified; manual Desktop window check pending.
- **Observed results**: Dry run through API, client, remote CLI and Desktop checkbox, with outcome preview inside the result.

## US-08: Confirm or Decline Application in Both Interfaces

- **Statement**: As a CLI or Desktop user, I want to inspect proposed engine changes and accept or decline them, so that changing configuration requires an equivalent explicit decision.
- **Acceptance criteria**:
  1. Expose the existing core application preview in Desktop and remote CLI before final application, through one load job rather than re-running benchmarks.
  2. Support explicit acceptance and rejection; rejection is a valid non-applied result and does not save/apply/load beyond the existing core confirmation contract. Verify actual core persistence ordering before changing it; never silently promise rollback of prior measurement effects.
  3. Bind a response to the correct authorized job/target; handle duplicate/stale replies and disconnected clients without bypassing confirmation or hanging indefinitely. Preserve supported local scripted confirmation flags.
  4. Keep errors/status understandable in both interfaces and never expose credentials in the preview.
- **Dependencies**: US-04 and US-07 shared result-outcome handling.
- **Verification method**: Deterministic core/API/client/CLI/Desktop tests for accept/decline, unauthorized/wrong/stale/duplicate response, connection loss and single-job measurements. Independent verification for auth/shared contracts/concurrency; final implementation plan must name exact state transitions before code.
- **Status**: Implemented and independently verified; manual Desktop window check pending.
- **Observed results**: Accept, decline, expiry, disconnect, stale and duplicate answers verified on API and remote CLI by an independent verifier; Desktop panel renders in a browser smoke check, but a real confirmation was not run.

## US-09: Expose the Full Preset Inventory in Desktop

- **Statement**: As a Desktop user, I want all saved presets and engine/model filters, so that I can inspect the same tuning results as the CLI.
- **Acceptance criteria**:
  1. Provide an accessible Desktop inventory independent of the currently selected model, using the existing preset listing/filtering operation.
  2. Show matching context, profile, variant and recorded performance for local and remote targets; handle empty results and failures.
  3. Retain existing model/context chips and do not add preset deletion, rename, import or export, which neither interface currently supports.
- **Dependencies**: US-04.
- **Verification method**: Paired CLI/Desktop fixture results for unfiltered/filtered inventories, metadata, empty/error cases and target routing.
- **Status**: Implemented and independently verified; manual Desktop window check pending.
- **Observed results**: Settings → Saved presets; test/presets-view.test.js; browser smoke shows the empty state with no console errors.

## US-10: Download the First Model from Desktop

- **Statement**: As a Desktop user with an empty local model inventory, I want the same named-model download flow as the CLI, so that I can proceed without switching interfaces.
- **Acceptance criteria**:
  1. Offer named-model download for installed local Ollama/LM Studio engines, using the same engine-specific commands as the CLI, then refresh selection.
  2. Validate model input and invoke structured executable/argument operations, never arbitrary shell text. Show progress, completion and actionable errors.
  3. Preserve the existing remote-install/download prohibition in both interfaces; instruct remote users to prepare the engine computer. Do not automatically download profile variants or add general model-library CRUD.
- **Dependencies**: US-04.
- **Verification method**: Fake engine executables/runner tests compare exact CLI/Desktop operations, input rejection, success/error refresh, and zero execution for unauthorized remote callers; no model download during tests.
- **Status**: Implemented and independently verified; manual Desktop window check pending.
- **Observed results**: Shared downloadModel for CLI and local-only route; test/model-download.test.js 8/8 and test/model-download-api.test.js 6/6; no real download was run.

## US-11: Align Saved-Computer Operations

- **Statement**: As a CLI or Desktop user, I want consistent saved-computer operations, so that changing interfaces does not unexpectedly switch targets or alter deletion behavior.
- **Acceptance criteria**:
  1. Offer add, inspect, explicitly test a saved connection, select, and confirmed removal from both interfaces, with shared HTTP(S)/credential validation and secret-safe errors.
  2. Standardize on explicit target selection: adding/testing alone does not select a server; choosing use/select persists the active target. Explain this updated Desktop save behavior.
  3. Protect Local Machine and fall back to it when the selected remote entry is removed. Cancelled/rejected actions leave persisted settings unchanged.
  4. Preserve existing valid scripted `--server` selection and explicit owner credential reveal; no real remote probe is authorized by this backlog alone.
- **Dependencies**: US-04; reuse restored US-02 server manager.
- **Verification method**: Same operation sequence through CLI prompts and Desktop handlers against isolated real settings storage; compare saved state/active ID, explicit request counts, validation/error redaction, confirmation and cancellation.
- **Status**: Implemented and independently verified; manual Desktop window check pending.
- **Observed results**: Desktop add no longer selects, removal confirms; validation shared with the CLI; test/saved-servers.test.js. No real remote probe.

## US-12: Configure and Start the Shared Server from Desktop

- **Statement**: As a Desktop user, I want to configure and start this computer's shared server, so that I can do the same hosting operation as `/serve` without switching to a terminal.
- **Acceptance criteria**:
  1. Expose local host/port/token configuration and explicit server start with the same validation, persistence and token-generation/reuse rules as the CLI.
  2. Show the actual running listener/reachable connection details or a truthful startup error. Distinguish the authenticated shared listener from Electron's private random-port UI listener.
  3. Use trusted local IPC/platform services; preserve sender checks, local-only privilege boundaries and explicit secret reveal. Selecting a remote target does not start/configure its OS service.
  4. Keep existing autostart/reveal/copy functionality; do not add unrelated service stop/restart/remote administration features absent from both surfaces.
- **Dependencies**: US-04.
- **Verification method**: Fake lifecycle/IPC dependencies and isolated server config; compare CLI/Desktop host/port/token outcomes, bind/start failures and duplicate-start handling. Unauthorized renderer/frame calls must perform zero privileged operations. No real login/service registration.
- **Status**: Implemented and independently verified; manual Desktop window check pending.
- **Observed results**: Shared helper for `/serve` and trusted bridge; test/shared-server.test.js, test/desktop-server-controls.test.js, test/shared-hosting-ui.test.js. A real Electron window was not launched.

## US-13: Align MCP Endpoint and Configuration Status

- **Statement**: As a CLI or Desktop user, I want equivalent supported engine endpoint configuration and accurate custom-name status, so that agent setup behaves consistently.
- **Acceptance criteria**:
  1. Make the existing supported LM Studio/Ollama endpoint/name/key/agent choices available in both interfaces without a false local-install prerequisite for an explicitly supplied external endpoint.
  2. Check existing configuration using the chosen custom MCP name rather than incorrectly assuming the engine ID; show matching configured/collision status and per-agent outcomes.
  3. Continue writing agent configuration only on the local CLI/Desktop host, using shared installers, backups and preserved unrelated settings. Remote engine execution does not imply permission to alter remote agents.
- **Dependencies**: US-04.
- **Verification method**: Paired CLI/Desktop endpoint/name/agent fixtures with temporary configuration paths and fake detections; assert custom-name status, backup/preserved data, shared payloads, errors and no unintended remote/engine install.
- **Status**: Implemented and independently verified; manual Desktop window check pending.
- **Observed results**: CLI checks the chosen custom name; the Desktop MCP button no longer needs a local engine install.

## US-14: Show Equivalent Remote Load Progress and Results

- **Statement**: As a remote CLI user, I want the same meaningful load events as Desktop, so that I can understand benchmarks, telemetry, profile fallbacks and failures.
- **Acceptance criteria**:
  1. Consume actual tuner/SSE event types for candidate results, telemetry, profile/variant choices, fallback notices, confirmation state and final outcomes; do not expect only synthetic progress/log events.
  2. Present equivalent information in terminal and Desktop without requiring identical formatting or breaking JSON output. Reuse existing profile/event helpers and preserve event order.
  3. Handle stream errors/disconnection and selected-target identification consistently; do not introduce coordinated cancellation as a new feature.
- **Dependencies**: US-04, US-07 and US-08 final event/result contracts.
- **Verification method**: Deterministic mock SSE sequences through public clients and interface consumers, asserting displayed information, JSON cleanliness, errors, terminal outcome and no duplicated side effects.
- **Status**: Complete (automated and independent checks observed).
- **Observed results**: Remote CLI uses the same event handler as local; lost streams and failed results handled after verifier blockers B1-B5.

## Revised Backlog Review and Execution

- Scope: 14 stories total, preserving/reopening US-01–US-03 and adding US-04–US-14 to close existing one-sided capabilities and persist the rule. Each new story has its own observable acceptance checks; none invents capabilities absent from both interfaces.
- Order: US-04 first; US-05/06/09/10/11/12/13 can follow their declared dependencies; US-07 → US-08 → US-14 must preserve shared contracts. Close US-01/02 cross-surface coverage and US-03 final documentation only after applicable counterparts are verified. Documentation evolves alongside each behavior, not only at the end.
- Preserve the existing CLI/Desktop shared core, valid automation defaults and security boundaries. Desktop-only native privilege uses its trusted bridge; browser use is outside the parity target, not permission to remove authentication.
- Final completion requires the bidirectional inventory to have no unapproved gaps, paired checks and documented usage, plus applicable suite/manual evidence. The unresolved telemetry assertion from restoration remains visible; investigate causality during integration and do not fabricate a green full suite or 100% proof.
- Execution mode requested previously: all stories. Revised scope approved: "Si lo aprubo datle". All-stories execution is authorized; application implementation follows the shared contracts in the linked plan. Commit-chain, push/PR/merge/publication authorization remains separate.

- Approved execution: "Si lo aprubo datle". Additional instruction: "Si ahora continuamos pumbastudio esta disponible sin embargo recuerda que el no es un experto asi que hay que indicarle y tu tienes acceso a internet para mandar las mejores indicaciones". Use the currently loaded local model first with exact API/version context and small reviewed requests; do not delegate repository exploration to it.

- 2026-10-31 checkpoint: full suite 409/409 pass. Not started: US-09, US-10, US-11 Desktop semantics, US-12, and all Desktop renderer controls. US-01, US-02 and US-03 stay reopened until those exist. No 100% parity claim.

- 2026-10-31: full suite 479/479. First independent verifier found 5 blockers on commit f027bca, corrected in 43412de. Recheck running. Real Electron window, GPU benchmark, model download and remote host checks not performed.

- 2026-10-31: second verifier round passed B1, B2, B4, B5 and the security surfaces; B3 and a new token blocker were corrected in 65d8024 with RED/GREEN regressions, not rechecked by the verifier again. Full suite 482/482. Native review offered and declined by the user for this candidate. US-01, US-02 and US-03 stay open until the manual Desktop check. No 100% parity claim until that check.

- 2026-10-31 user review of Desktop, verbatim: "La parte de presets deberia estar en otra seccion se vuelve confuso en donde esta , y el host deberia ser la ip de donde se esta ejecutando". US-09 inventory moved to its own sidebar panel; US-12 host field shows this computer's address.
