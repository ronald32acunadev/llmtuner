# Server autostart
Objective: implement the approved backlog remaining stories sequentially; branch feat/remote-servers; runner node --test. Delivery strategy: single-pr (explicit user choice, size exception); forecast approximately 600 authored lines across the feature (estimate only).
Canonical story status, acceptance criteria, and execution evidence: [backlog](../../docs/userstories/server-autostart/README.md).

## Specs
S1: "Podemos añadir una funcion para cli y desktop para con una funcion iniciar el servicio al encender la computadora lo que no veo es donde ver el token del servidor para poder usuarlo en otra computadora"
S2: "Si es lo que quiero si lo habilito en settings"
S3: "Despues de iniciar session"
S4: "Apruevo el backlog por favor avancemos una a una"
S5: "OK continua con las demas tareas , cumpliendo la regla de modelo local por favor" (supersedes one-at-a-time approval stops for US-02/03).

## Tasks
T1 — S1-S4, US-01: inline orchestration with local-first synthesis; implemented and functionally verified; native review acknowledged after one correction; commit `99874b1` created externally. Mapping delegated because exploration exceeded bounded evidence; independent verification required for item 5 (OS startup registration).
T2 — S1-S5, US-02: inline pumbastudio synthesis; complete; functional verification passed, native review declined for this candidate; risk items2/5; partial controller commit `b61854e` created externally, completion commit pending authorized publication.
T3 — S1-S5, US-03: inline pumbastudio synthesis; complete; functional verification passed, native review declined for this candidate; risk item2; completion commit pending authorized publication.

## Log
L1: "Podemos añadir una funcion para cli y desktop para con una funcion iniciar el servicio al encender la computadora lo que no veo es donde ver el token del servidor para poder usuarlo en otra computadora"
Subsequent user corrections, decisions, and observed checks live in the canonical backlog linked above; this log does not duplicate its execution record.
