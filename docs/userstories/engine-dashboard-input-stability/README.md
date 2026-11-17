# Backlog: Engine Dashboard Input Stability & Non-Destructive Polling

## Overview
Eliminate UI resets where background polling every 5 seconds wiped out `container.innerHTML`, clearing user-edited storage paths, losing focus, and destroying the sudo password prompt during user interaction.

## Execution Summary
- **Execution Mode**: All stories at once (approved by user).
- **Status**: Complete.
- **Verification**: 542/542 tests passing (`npm test`).

## User Stories

### US-01: Non-Destructive In-Place Dashboard Polling
**As a** user viewing an engine management dashboard,  
**I want** periodic background polling to update status and model tables in-place without destroying the container DOM,  
**So that** input fields, cursor focus, and UI state are preserved across background refreshes.

#### Status: Complete

#### Acceptance Criteria
- `US-01 / AC-01`: The dashboard creates the layout structure once and updates dynamic sections (status tags, version, active models table, installed models table) in-place without wiping `container.innerHTML`.
- `US-01 / AC-02`: The models filter search input (`#models-filter`) retains its value and focus during background refreshes.

---

### US-02: Storage Input and Sudo Form State Protection
**As a** user editing or selecting the storage path or entering a sudo password,  
**I want** the storage input and active sudo password prompt to remain undisturbed by background polling,  
**So that** my input is never reset, overwritten, or closed while I am typing or submitting.

#### Status: Complete

#### Acceptance Criteria
- `US-02 / AC-01`: While `input[name="path"]` is focused or modified by the user, background polling does not overwrite `input.value`.
- `US-02 / AC-02`: When `#sudo-form` is active, background polling is paused or `#sudo-form` is preserved in-place so password entry is not interrupted.
- `US-02 / AC-03`: Submitting the storage form or sudo form pauses polling during execution and displays loading state until the operation finishes and refreshes.

---

## QA Traceability & Verification Matrix

| Story / Criterion | Test File & Procedure | Observed Result |
| --- | --- | --- |
| `US-01 / AC-01` | `test/web-engine-panels.test.js`: verify background refresh updates tables in-place without wiping `container.innerHTML` | Passed (`node --test test/web-engine-panels.test.js`) |
| `US-01 / AC-02` | `test/web-engine-panels.test.js`: verify `#model-filter` value is preserved across refreshes | Passed (`node --test test/web-engine-panels.test.js`) |
| `US-02 / AC-01` | `test/web-engine-panels.test.js`: verify user-edited storage path is not overwritten by background refresh | Passed (`node --test test/web-engine-panels.test.js`) |
| `US-02 / AC-02` | `test/web-engine-panels.test.js`: verify active `#sudo-form` is not destroyed during polling refresh | Passed (`node --test test/web-engine-panels.test.js`) |
| `US-02 / AC-03` | `test/web-engine-panels.test.js`: verify polling pause/resume during storage submission | Passed (`node --test test/web-engine-panels.test.js`) |
