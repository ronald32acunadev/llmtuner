# CLI Usability and User Guide Implementation Plan

Objective: preserve the original implementation and plan the revised CLI/Desktop parity [user stories](../../docs/userstories/cli-usability-and-user-guide/README.md).
Branch: `codex/cli-user-guide`; runner: Node v26.13.0 (restoration; original v24.22.1), `node --test`, `npm test`. Delivery: ask-on-risk; no push, PR or website mutation authorized.

## Specs

- S1: "creo que podemos hacer que el cli se igual de compresenbible para cualquier usuario". Approved scope and acceptance checks: US-01 and US-02 in the linked backlog.
- S2: "crear documentacion de todas las funciones y como deben utilizarse paso a paso para un sitio web que tengo lo pueda usar para regenerar el sitio con los cambios realizados". Acceptance checks: US-03.
- S3: "tenia un skill en el otro proyecto me gustaria que este apuntara a un documento para ver los cambios"; "Correcto, no hace falta luego actualizo la otra". One document, no new skill and no changes to the other project.
- S4: "Dale me parece perfecto"; "Todas de una vez". All approved stories, in dependency order, without per-story reapproval.

- S5: "Como se solicito anteriormente deberian tener el 100% de funciones , debemos añadir en algun lugar cuando se pida alguna otra funcion debe quedar guardado que debe hacerse en el gui y cli". Revised full functional parity and mandatory future dual-surface policy; see US-04–US-14.
- S6: "CLi y desktop navagador no se usa". GUI means Electron Desktop; standalone browser parity is excluded without deleting or weakening existing browser/security behavior.

## Tasks

- T1 / S1,S4 / delegated synthesis (required project code-authorship hierarchy; both local providers have no loaded model) / restored; scoped checks pass / commit pending: task-oriented CLI and server settings, US-01 and US-02 connection management.
- T2 / S1,S4 / delegated synthesis (same code-authorship constraint) / restored; scoped checks pass / commit pending: remote load adapter and early dry-run refusal, remaining US-02.
- T3 / S2,S3,S4 / inline documentation / restored; scoped checks pass / commit pending: complete `docs/USER_GUIDE.md`, stable anchors and dated changes, US-03.
- T4 / S1-S4 / independent verifier for item 3 shared CLI load behavior and stored server credential handling / restoration recheck passed; integrated proof classification and native review pending / commit pending: isolated regression checks and source-document coverage.

- T5 / S5,S6 / route pending revised approval (local-first source synthesis; inline passive policy/docs) / pending / no commit: implement US-04 and paired CLI/Desktop acceptance checks from the revised backlog.
- T6 / S5,S6 / route pending revised approval (local-first source synthesis; inline passive policy/docs) / pending / no commit: implement US-05 and paired CLI/Desktop acceptance checks from the revised backlog.
- T7 / S5,S6 / route pending revised approval (local-first source synthesis; inline passive policy/docs) / pending / no commit: implement US-06 and paired CLI/Desktop acceptance checks from the revised backlog.
- T8 / S5,S6 / route pending revised approval (local-first source synthesis; inline passive policy/docs) / pending / no commit: implement US-07 and paired CLI/Desktop acceptance checks from the revised backlog.
- T9 / S5,S6 / route pending revised approval (local-first source synthesis; inline passive policy/docs) / pending / no commit: implement US-08 and paired CLI/Desktop acceptance checks from the revised backlog.
- T10 / S5,S6 / route pending revised approval (local-first source synthesis; inline passive policy/docs) / pending / no commit: implement US-09 and paired CLI/Desktop acceptance checks from the revised backlog.
- T11 / S5,S6 / route pending revised approval (local-first source synthesis; inline passive policy/docs) / pending / no commit: implement US-10 and paired CLI/Desktop acceptance checks from the revised backlog.
- T12 / S5,S6 / route pending revised approval (local-first source synthesis; inline passive policy/docs) / pending / no commit: implement US-11 and paired CLI/Desktop acceptance checks from the revised backlog.
- T13 / S5,S6 / route pending revised approval (local-first source synthesis; inline passive policy/docs) / pending / no commit: implement US-12 and paired CLI/Desktop acceptance checks from the revised backlog.
- T14 / S5,S6 / route pending revised approval (local-first source synthesis; inline passive policy/docs) / pending / no commit: implement US-13 and paired CLI/Desktop acceptance checks from the revised backlog.
- T15 / S5,S6 / route pending revised approval (local-first source synthesis; inline passive policy/docs) / pending / no commit: implement US-14 and paired CLI/Desktop acceptance checks from the revised backlog.

## Implementation Details

Architecture: reuse settings normalization/storage and `TunerApiClient`; keep new server-management interaction in `src/cli/commands/servers.js`, invoked by Settings. Do not change the web API or shared settings format. Remote dry-run is explicitly unsupported and must refuse before any update/network request.

### T1: Guided CLI and remote connection management

- Files: new `src/cli/commands/servers.js`, `test/cli-servers.test.js`; modify `src/cli/commands/settings.js`, `src/cli/router.js`, `src/i18n/en.js`, `src/i18n/es.js`; relevant existing CLI tests.
- Reuse `readSettings`, `writeSettings`, `getActiveServer`, `TunerApiClient`, `withNav` and `backChoice`; stable existing menu values and flags.
- Interface: `serversCommand(args, {lang,theme}, dependencies={})`, injectable select/input/password/confirm prompts, storage and client creation. Settings injects/delegates the new action for deterministic tests.
- First synthesize public-command tests for add/list/test/select/remove, local protection, invalid URL/name, no implicit connection, failures, cancellation and secret-safe output. Run them RED before production changes.
- Then synthesize implementation with HTTP(S)-only URLs, no embedded credentials, explicit test action, masked token input, active-target label and local fallback on removal. Retain explicit owner credential reveal.
- Update menu wording/help in both i18n catalogs for task intent, prerequisites and next steps, without altering noninteractive command results.
- Verify new tests plus `test/cli-router.test.js`, `test/cli-server-token.test.js`, `test/cli-autostart.test.js`, `test/cli.test.js`; defer full suite to final seam check.

### T2: Remote load correctness

- Files: `src/cli/commands/load.js`, new `test/cli-remote-load.test.js`; localized errors in catalogs if required, parent-owned catalog integration.
- First test fully specified remote load through the public CLI, wizard remote planning/presets using mocks, and early dry-run refusal with zero fetch calls and unchanged settings. Reproduce RED before production changes.
- Use `client.planModel({engine,model,ctx})` returning `{meta,maxContext,candidates,profiles}`; adapt to the existing wizard without calling local tuner methods or using local presets for a remote target.
- Do not initiate local downloads for an empty remote model list; tell the user to install/download on the target. Only attach tuner progress listeners on the local path; keep remote SSE progress handling.
- Preserve local loading, scripted output, default profiles and existing flags; no changes to API/client contracts.
- Verify focused tests, existing load/profile/router/client tests, and differential baseline probes for existing shared CLI commands. Scratch state stays under a `mktemp -d` root outside the worktree.

### T3: Website source document

- Create `docs/USER_GUIDE.md` in English; no new skill.
- Inventory implemented CLI/browser/Desktop functions against source. Cover prerequisites, step sequences, expected results, recovery, local/remote responsibilities, HTTP/token limitations, profiles, presets, MCP, settings, native startup and GUI-only chat.
- Use explicit stable anchors and a dated user-visible changes section linking changed workflows; never describe proposed or unavailable behavior as implemented.
- Structural and safe help checks replace RED/GREEN for passive docs. Reconcile final guide with actual completed behavior and record unavailable platform checks.

### T4: Final checks

- Independent verifier works in an outside scratch copy and compares realistic baseline behavior; no real services, credentials, engines or remote machines.
- Run `npm test` once for the integrated change (forecast: may take minutes and require loopback sockets, no engine installation). Parent reruns one reported check.
- Run all source-mutating normalization before any native review freeze; only check-only commands afterward.
- Read user-owned RDD mode; if on, use native assess and enter native lifecycle only when due. Candidate consent remains required.
- Forecast: likely more than 400 authored changed lines including regression tests and comprehensive docs. Chain strategy must be resolved before the first work-unit commit; no PR creation is implied.
- Update story statuses with observed checks only. Preserve pre-existing README/CLAUDE work. No generated cache or scratch files in the change.

## Revised Implementation Contracts — Approved Execution

All 14 revised stories approved: "Si lo aprubo datle". Additional user instruction: "Si ahora continuamos pumbastudio esta disponible sin embargo recuerda que el no es un experto asi que hay que indicarle y tu tienes acceso a internet para mandar las mejores indicaciones".

### Synthesis and ownership

Use currently loaded LM Studio model (verified `openai/gpt-oss-20b`), not a hardcoded future preference. Local model receives one file or exact replacement block per request: full project prompt rules, exact runtime/library brief, current relevant code, named acceptance tests and three-line checklist. It does not explore the repository. Agents orchestrate/review/apply local output, never synthesize source/tests themselves; one focused local correction per rejected answer, then report a blocker if still wrong. Use `scripts/ask_local_llm.py` because the MCP does not expose reasoning-off; serialize model requests with `/tmp/llmtuner-local-llm.lock` to avoid concurrent GPU pressure while workers prepare/review/test independently. No model loading or server setting changes.

Verified documentation: `.context/electron@44.10.1.md`, `.context/@inquirer-prompts@7.10.1.md`, `.context/node@26.13.0.md`. Exact Electron/Node release docs were not available through online fetch; cache distinguishes general official security guidance from exact local installed types. No invented APIs or dependency upgrades.

Parallel writer reason: A shared load transaction/API/CLI unit and C local CLI/native-host unit have disjoint source/test surfaces and each is independently testable with existing interfaces. Parent owns catalogs/router/guide/tracking seams. B renderer work follows A/C contracts, not a concurrent writer of their files. Source synthesis remains local-first in all units.

### A — load transaction and model-download contracts

- Additive `POST /api/load` request fields: existing engine/model/ctx/profile/force/candidates plus optional boolean `dryRun` and boolean `confirm`. Omitted confirmation keeps existing API auto-apply compatibility; Desktop explicitly opts into confirmation, remote CLI opts in unless `--yes`/noninteractive behavior explicitly accepts.
- Candidate domain ruling: default3 only when omitted, explicit values must be positive safe integers; no invented upper limit. Reject invalid input before job or persistence. This intentionally replaces silent invalid-value fallback; preserve valid existing options.
- Terminal SSE keeps `{type:'finished',ok,result,error?,code?,params?}`; result gains additive `outcome: loaded|preview|declined|manual`. Preview, explicit decline and pending-manual-command results are legitimate successes, not `loaded.ok` failures. Do not change raw core preset-before-confirm ordering: decline prevents final apply/load but measured presets can already exist.
- Confirmation factory owns `running -> awaiting-confirmation -> running -> finished` and one pending opaque ID; emit `confirmation-required` with ID/preview/expiresAt and `confirmation-resolved`. Authenticated `POST /api/jobs/:id/confirm` requires `{confirmationId,accepted:boolean}`. Unknown404; wrong/duplicate/expired409; invalid boolean400; no extra side effects. Timeout120000ms or subscriber disconnect resolves false and cleans timer/promise. Never re-benchmark to obtain confirmation.
- Client adds `confirmLoad(jobId,payload)` and optional third `loadModel` argument `{confirmApply}`; await only the dedicated confirmation callback, keeping ordinary progress informational. Preserve existing callback-free job creation and existing defined request fields.
- Freeze selected saved-server URL/token at proxied job creation in server-owned job-target bindings; SSE and confirmation must use that captured target after settings change. Never accept client-provided arbitrary target URLs.
- Shared `downloadModel({engineId,name,onLine,detectEngine,runInstall})` validates supported engine and safe named-model identifier, rejects option/shell/control injection, and invokes existing detected binary with structured `pull` or `get ... -y` arguments. Reuse it from CLI first-model flow and local-only `POST /api/models/download -> {jobId}`. Log and finished events match existing jobs. Remote caller/remote target denied before job/executable work; no arbitrary command endpoint.
- Source owner A: server.js/client.js/load.js and its new helpers/tests. Parent owns all EN/ES catalog and guide integration from A's local-generated key manifest. A may not mutate native/renderer/chat files.

### C — local CLI and trusted Desktop hosting contracts

- Add `chatCommand(args,{lang,theme},dependencies={})`, using shared local tuner/remote client chat, optional explicit `--prompt` for scripted one-message operation and a guided multi-turn loop with `/exit`. No model auto-download/load or new general agent feature. Parent wires parser/router/menu/help; C supplies exact wiring/key manifest.
- MCP checks chosen custom name before displaying configured-agent state, accepts existing supported explicit endpoint settings without requiring local engine installation, and continues writing only LOCAL agent config using existing shared installers/backups.
- Native bridge remains `window.llmTunerServer` from `electron/preload.cjs`. Add `getSharedServerStatus()->{running,configured,host?,port?,url?}` and `startSharedServer({host,port,token?})->{running:true,host,port,url}`, with no token in ordinary replies. Existing explicit reveal/copy remains the only token-display path.
- Reuse a new `src/platform/shared-server.js` helper across CLI `/serve` and Desktop: centralized host/port/token validation/reuse/generation, server config IO and injected listener lifecycle. Preserve existing serve exports for callers. Allow ephemeral port0 for isolated tests, persist actual bound port on success; failed bind must leave prior config unchanged. Duplicate matching start returns existing status; conflicting start refuses without restart. IPv6 URLs must be usable. Do not add stop/restart/remote administration.
- Validate trusted Electron sender/mainFrame/origin BEFORE any await/read/write/start. Keep shared listener separate from private random UI port; close owned listener on Desktop quit. Native configuration belongs to local Desktop host regardless active model target.
- C exclusively owns new chat, CLI MCP/serve, shared-server helper, Electron main/preload/controls, `src/web/public/server-settings.js` native UI and dedicated tests. It must not edit app.js/index.html/server.js/client.js/catalogs/router/guide. Native hosting fields can be added dynamically under existing local server settings container; tests exercise real handler behavior.

### B — Desktop renderer follow-up

After A/C return, one owner updates app.js/index.html/style.css and dedicated renderer helpers/tests for candidate count, dry-run/confirmation/outcome controls, global preset inventory/filtering, local first-model download, explicit saved-server add/test/select/confirmed-remove semantics and MCP endpoint eligibility. It uses A/C signatures above and does not mutate their source. It owns a browser-compatible `server-validation.js` reused by renderer and CLI (parent mechanical CLI integration), preserving matching input/error rules. It supplies local-generated i18n additions. Parent integrates chat route and catalog/help/guide updates, then one seam suite and independent high-risk verifier before native review.

### Verification and limits

Every source behavior restores/writes deterministic RED before local implementation and records exact GREEN; tests public commands/handlers, persistence hashes, no unauthorized side effects, real Inquirer editing, actual SSE/client behavior, and mocked privileged sender identities. No real GPU/server/agent changes, OS service registration, remote destination calls or dependency changes. Parent owns git and scratch cleanup. Existing unknown lock delta remains untouched. Full-suite telemetry failure from restoration must be classified/fixed only with observed causality; no false green or endless retries. No final 100% claim with pending inventory/manual proof. Existing chain strategy and native consent remain human-owned; no push/PR/merge.

## Log

- L1: Original request: "Por lo que he usuado la guid es la version mas compresible de uso para un usuario , creo que podemos hacer que el cli se igual de compresenbible para cualquier usuario, por cierto vamos a tener que hacer un skill para que crear documentacion de todas las funciones y como deben utilizarse paso a paso para un sitio web que tengo lo pueda usar para regenerar el sitio con los cambios realizados".
- L2: Scope correction: "mmmm tenia un skill en el otro proyecto me gustaria que este apuntara a un documento para ver los cambios"; confirmed "Correcto, no hace falta luego actualizo la otra".
- L3: Backlog approved: "Dale me parece perfecto". Execution mode: "Todas de una vez".
- L4: Read-only map established server management and remote adapter edit boundaries. Historical remote story completion labels are not proof; regression tests must reproduce the current defect.
- L5: Local provider check: LM Studio MCP reports no loaded model; Ollama `/api/ps` reports no running models. Use available lightweight hosted `gpt-6-luna` for code synthesis, with parent review/application/verification. Explorer class's configured `gpt-6.1-luna` is not exposed by this runtime.
- L6: Ruling: refuse remote dry-run before any network operation rather than extend the API. This is explicitly allowed by US-02, avoids silently ignored flags and shared API changes.

- L7: Hosted implementation self-checks: 13 new focused cases pass; 53 existing regression cases pass with sandbox escalation. Original remote tests did not produce a clean RED observation; do not claim complete remote TDD evidence.
- L8: Independent isolated suite: 330 individual tests pass. Baseline 42 regression cases and five public CLI differential scenarios pass. Remote dry-run exits 1, zero fetch, unchanged settings hash. Guide has 15 anchors / 22 valid internal links.
- L9: Independent verifier reproduced candidate-caused URL validation and Backspace editing blockers. One bounded correction batch includes both, regression probes, and parent-noted target/profile guidance corrections. Scratch /tmp/llmtuner-verify.cTq8Sx retained for parent cleanup. Real GPU/Desktop/login/remote verification remains unavailable.

- L10: Bounded correction observed RED/GREEN for real Inquirer URL validation and populated-input navigation; regressions now exercise actual streams/TTY events. Hosted focused checks 23/23 and prior regressions 53/53 pass. Unrequested host fallback reverted. Remote profile guidance and target visibility corrected.
- L11: Independent blocker-only recheck passes both original probes and 4 targeted editing/cancellation cases; cancelled/rejected settings hash unchanged. Parent final `npm test`: 340 individual cases, 340 pass, 0 failed/skipped; parent guide check 15 unique anchors / 22 internal links, git diff --check passes. An initial parent doc-marker assertion used the wrong literal phrase; corrected the check without changing documentation.
- L12: All story acceptance checks functionally observed. Local commits, chain strategy and native RDD consent/review remain pending; do not claim final delivery. Best coherent slices must keep server behavior with its realistic prompt regressions even if one exceeds the advisory 400-line target. No real GPU/Desktop/login or real remote execution was performed.
- L13 (2026-10-31): User requested "Peudes re aplicar los cambios". Current clean checkout at f073e76 on release branch lacks previous uncommitted files/branch/dependencies. Restore the SAME approved scope; earlier check results are historical, not fresh evidence. No commit/chain strategy/publishing approval inferred. Website/other skill remain untouched.

- L14 (2026-10-31): Reapplied final T1/T2 and guide scope. Fresh focused tests 24/24, existing CLI regressions 53/53. Reproduced and fixed restored optional profiles:null fallback (RED/GREEN); independent actual-client/SSE recheck passes, no local tuner usage, stored profile or balanced default. Real prompt URL/edit/cancel regressions restored.
- L15: Parent integrated runs: initially 339/340 passed (Spanish CLI subprocess status mismatch, not reproduced by exact case or full CLI file on baseline/candidate); after bounded correction 340/341 passed, extra telemetry event in unchanged test/tuner.test.js event-sequence assertion. Baseline environmental diagnostic pending. Do not claim a green full suite. Guide anchors 15/links22 pass; eight public CLI differential scenarios unchanged.
- L16: Unexpected shared package-lock delta appeared after initial clean-lock install, Electron44.9.3->44.10.1 and systeminformation5.33.16->5.33.19. Neither parent nor implementer intentionally updated; provenance unknown. Preserve/exclude this unrelated delta, no dependency upgrade or cleanup authority inferred. No native candidate frozen yet.

- L17: One baseline-only diagnostic after the final candidate failure passes 317/317; neither telemetry nor Spanish failure reproduced. Causality remains UNKNOWN. No further candidate retry, new full review sweep or unrelated core/test correction authorized. Restoration is present; do not mark final integration proof complete. Needs decision: whether to expand scope to diagnose/correct the remaining tuner event-sequence failure. Native review/commits remain pending.

- L18 (2026-10-31), user scope correction verbatim: "Como se solicito anteriormente deberian tener el 100% de funciones , debemos añadir en algun lugar cuando se pida alguna otra funcion debe quedar guardado que debe hacerse en el gui y cli". Earlier CLI-chat/GUI-control exclusions were the parent's scope mistake. Existing S1 expands to 100% functional parity plus a mandatory future both-surfaces rule. Backlog amended with proposed AGENTS policy and source-backed gap inventory; old verification preserved, affected stories reopened. Platform scope (Desktop only versus also browser) blocks complete revised decomposition/approval; no application or AGENTS mutation yet.

- L19 (2026-10-31), GUI scope decision verbatim: "CLi y desktop navagador no se usa". Revised backlog now has 14 stories (US-01–US-03 preserved/reopened; US-04–US-14 new). US-04 establishes AGENTS policy and capability inventory first; other stories close verified one-sided features using shared core/API/secure native bridge. Proposed safe server-add semantics use explicit selection, preserving CLI behavior. Revised backlog approval requested with prior all-stories preference; no AGENTS or application mutation yet. Browser remains outside parity acceptance, not removed.

- L20: Revised all-story approval "Si lo aprubo datle"; local-model-guidance requirement recorded verbatim. Added actual mandatory AGENTS policy and guide capability inventory; US-04 passive readback complete. LM Studio loaded model verified dynamically; exact docs cache and cross-unit contracts established before source synthesis.

- L21: Active implementation route: parallel independent units A (shared load/API/remote CLI and backend download) and C (local CLI chat/MCP/native hosting), source synthesized only by loaded LM Studio, prompts serialized with external flock. Disjoint file ownership declared; parent owns router/catalog/guide seams and git. B Desktop renderer follows captured A/C contracts. US-04 policy and inventory structurally read back; active US-05/06/07/08/10/12/13/14 marked in progress, not complete until paired proof.

- L22 (2026-10-31), resumed by Claude Code. User corrections verbatim: "Por eso dije recuerda que el no es un experto asi que hay que indicarle y tu tienes acceso a internet para mandar las mejores indicaciones"; "En mi definicion de agents lo dice claro que hay que construir un diccionario para mejorar las peticiones local, una vez extraida la informacion de internet"; "mmmm en ese caso no deberia estar en el gitignore"; "Puedes agregar esas mejoras en mi proyecto /run/media/pumba/Proyects/Proyects/projectsetup es para tener una configuracion para todos los proyectos"; "Por cierto te estoy usando a ti , codex , opencode , google antigravity , asi que necesito que funcione para todos".
- L23: `.context/` rebuilt from official docs for Node 26.13.0, Electron (44.9.3 docs plus installed 44.10.1 types) and Inquirer 7.10.1, and now versioned. Same rule ported to projectsetup, uncommitted. Exact Node docs were reachable, contrary to the earlier note.
- L24: Authorship. Local LM Studio wrote mcp.js, load-options.js, load-confirmation.js, the client change, server blocks and their tests. Hosted lightweight fallback wrote test/cli-chat.test.js and src/cli/commands/chat.js, before the dictionary existed. Parent applied mechanical edits: dependency renames, test fixes, SSE try/catch restoration, and the load.js extraction after the local model echoed the request.
- L25: Decision: pending manual commands keep `ok:false` with outcome `manual`, because test/server.test.js pins that behavior; this narrows the earlier contract line. Disconnects use `res.on('close')`, since `req 'close'` no longer signals them.
- L26: Full suite 409/409 with `--test-force-exit`. The earlier telemetry and Spanish failures did not reproduce in this run; cause still unknown. Independent verifier for Risk items 3 and 4 pending. Engram full-document mirror pending. Next: US-10 download, US-12 shared server, Desktop renderer, then help, guide and inventory.

- L27 (2026-10-31), user: "Sí, commitea y sigue". Commits: 230851f rules and dictionary; 72ca923 CLI servers, chat, MCP; f027bca load transaction; c9464ca model download; 382961b shared server; 43412de verifier fixes; 6bdafda Desktop parity; cd18176 local model workflow docs. package-lock.json delta excluded. No Co-Authored-By line: the user's global rule takes precedence. 382961b was first committed with one red test because a commit was chained after the suite, then amended before any push.
- L28: Authorship. Local model wrote the pure Desktop modules, panels, client correction and tests from dictionary plus skeleton. Parent wrote the HTML markup and app.js wiring as glue, plus one-line test and code fixes; that wiring goes beyond purely mechanical edits and is recorded here for review.
- L29: Verifier found B1-B5 on f027bca; one correction batch 43412de. Advisories left open: only subscriber leaving before the request waits up to 120 s; a late subscriber can see a replayed confirmation; `--json` without `--yes` prompts on stdout (same locally); `busy` race on parallel POSTs; `jobTargets` never pruned.
- L30: User asked to update projectsetup with the learned method for Claude, Codex, OpenCode and Antigravity: "Actualizemos tambien entonces la configuracion de /run/media/pumba/Proyects/Proyects/projectsetup con lo aprendido aqui". Guide, template, rules, AGENTS and README updated there, uncommitted. Installer now copies scripts/ and no longer ignores .context/.

- L31: Second verifier: B3 still failing (reader.cancel in finally) and new token blocker; corrected in 65d8024. Native review: consent relayed, user chose "Omitir esta vez"; decline executed. Open advisories: unescaped remote numbers in app.js innerHTML, `--candidates=abc` ignored by the parser, literal {ctx} in cli.loaded, web.connectionLost wording says local server, download origin 403 has no code. Manual Electron window check pending. Engram full-document mirror pending.

- L32: User: "Sí, corrígelo". Remote values in renderer markup (GPU rows, telemetry, plan rows, load speed) now go through src/web/public/markup.js with hostile-value tests; audit of app.js sinks recorded no remaining unescaped server value beyond numeric context chips filtered by comparison. Full suite 490/490, browser smoke with no console errors. Still open: `--candidates=abc`, literal {ctx}, manual Electron window check.
