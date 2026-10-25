# Administrative mission, user, file and diagnostic flows

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Disposable missions, test users and temporary static directory; explicit admin and super-admin roles.

Source: [src/pages/admin/index.tsx](../../../src/pages/admin/index.tsx), [src/pages/admin/mission.tsx](../../../src/pages/admin/mission.tsx), [src/pages/admin/missionDuplicate.tsx](../../../src/pages/admin/missionDuplicate.tsx), [src/pages/admin/missionLayers.tsx](../../../src/pages/admin/missionLayers.tsx), [src/pages/admin/missionSTM.tsx](../../../src/pages/admin/missionSTM.tsx), [src/pages/admin/user.tsx](../../../src/pages/admin/user.tsx), [src/server/express/routes/file](../../../src/server/express/routes/file).

Scenario mapping: **9/10 (90%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/express/file.test.ts](../../../src/tests/vitest/express/file.test.ts), [src/tests/vitest/express/missionAutomergeFields.test.ts](../../../src/tests/vitest/express/missionAutomergeFields.test.ts), [src/tests/vitest/utils/missionDup.test.ts](../../../src/tests/vitest/utils/missionDup.test.ts).

## ADMIN-001: Admin mission lifecycle

**P0 · Mapped**

Action: Create/edit/delete a disposable mission through admin UI; cancel destructive actions and refresh lists.

Expected: Fields and document listing agree, Cancel preserves state and deletion cleans only the chosen mission.

Playwright: [src/tests/playwright/behavior/adminMission.spec.ts:33](../../../src/tests/playwright/behavior/adminMission.spec.ts#L33) — admin creates, edits, cancels destructive actions, and deletes only its chosen mission (chromium).

Evidence boundary: Creates two isolated missions in the admin UI, edits and verifies target fields through UI/API and its Automerge listing, cancels archive and delete confirmations, confirms archive and delete, reloads the lists, and verifies the survivor's listing/document and mission fields remain unchanged.

## ADMIN-002: Mission duplication identity and ownership

**P0 · Mapped**

Action: Duplicate a graph-rich mission with/without supported asset options and observe progress/failure.

Expected: New document/relational IDs and internal references follow the copy contract; source remains unchanged and partial failure is reported.

Playwright: [src/tests/playwright/behavior/adminDataWorkflows.spec.ts:20](../../../src/tests/playwright/behavior/adminDataWorkflows.spec.ts#L20) — duplicating a mission gives it a new document identity and preserves its graph and source (chromium).

Playwright: [src/tests/playwright/behavior/adminDataWorkflows.spec.ts:104](../../../src/tests/playwright/behavior/adminDataWorkflows.spec.ts#L104) — mission duplication reports a missing-source failure without creating a partial mission (chromium).

Playwright: [src/tests/playwright/behavior/adminCompleteness.spec.ts:7](../../../src/tests/playwright/behavior/adminCompleteness.spec.ts#L7) — mission asset options preserve source bytes and roll back an interrupted asset copy (chromium).

## ADMIN-003: Mission layers and sublayers administration

**P0 · Mapped**

Action: Create/edit/reorder/delete layer headers and each supported sublayer kind; import configured assets.

Expected: Document-backed layer definitions persist and existing presets reconcile without orphan or foreign-mission references.

Playwright: [src/tests/playwright/behavior/adminDataWorkflows.spec.ts:159](../../../src/tests/playwright/behavior/adminDataWorkflows.spec.ts#L159) — admin layer headers and linked sublayers persist, and deletion removes their document references (chromium).

Playwright: [src/tests/playwright/behavior/adminCompleteness.spec.ts:288](../../../src/tests/playwright/behavior/adminCompleteness.spec.ts#L288) — admin imports configured archives, persists every sublayer kind and reconciles header ordering and preset references (chromium).

## ADMIN-004: Admin STM configuration and import

**P0 · Mapped**

Action: Load/edit v1/v2 science structures with valid/invalid files and referenced definitions.

Expected: Schema/reference failures are explained and do not partially replace a valid mission configuration.

Playwright: [src/tests/playwright/behavior/adminDataWorkflows.spec.ts:291](../../../src/tests/playwright/behavior/adminDataWorkflows.spec.ts#L291) — admin STM import validates hierarchy references and preserves the existing tree on invalid input for v1 and v2 (chromium).

Playwright: [src/tests/playwright/behavior/adminCompleteness.spec.ts:441](../../../src/tests/playwright/behavior/adminCompleteness.spec.ts#L441) — v2 STM edits honor referenced rules and import validation preserves or clears dependent references atomically (chromium).

## ADMIN-005: User permission administration

**P0 · Mapped**

Action: Create/edit/revoke viewer/editor/admin grants and super-admin-only flags with another user online.

Expected: Grant administration persists viewer/editor/admin changes, HTTP authorization refreshes those grants, and non-super-admin privilege escalation is denied. Already-open Automerge sockets may continue writing after grant removal.

Playwright: [src/tests/playwright/behavior/adminPermissions.spec.ts:214](../../../src/tests/playwright/behavior/adminPermissions.spec.ts#L214) — super-admin grant changes deny HTTP access and capture existing Automerge writes (chromium).

Evidence boundary: The UI creates a view-only user, upgrades it to an admin with edit access, rejects user-admin API access and super-admin escalation, then revokes all grants and verifies fresh-login and existing-session HTTP requests are denied. User-confirmed policy on 2026-10-25 permits writes through an already-open Automerge socket; live socket revocation is not a missing acceptance requirement.

## ADMIN-006: Static files upload list rename delete

**P0 · Mapped**

Action: Upload representative files, list/sort, rename and cancel/confirm deletion; try duplicate/invalid paths.

Expected: File bytes and listing agree, progress/errors are accurate and no traversal or cross-scope access changes unrelated files.

Playwright: [src/tests/playwright/behavior/adminDataWorkflows.spec.ts:550](../../../src/tests/playwright/behavior/adminDataWorkflows.spec.ts#L550) — admin file manager uploads, lists, renames, cancels deletion, and deletes only the selected file (chromium).

Playwright: [src/tests/playwright/behavior/adminCompleteness.spec.ts:176](../../../src/tests/playwright/behavior/adminCompleteness.spec.ts#L176) — admin uploads show processing and duplicate errors and cannot operate on another mission path (chromium).

Evidence boundary: Upload bytes, listing order by name and size, rename, deletion confirmation/cancellation, duplicate/error handling and path-scope rejection are asserted. UI row values are checked against the documented sort choices.

## ADMIN-007: Box browse and download progress

**P1 · Mapped**

Action: Browse test folders, download a file, inject permission/network failure and retry.

Expected: Selection, bytes, progress, completion and failure recovery follow the external contract without duplicate partial files.

Playwright: [src/tests/playwright/behavior/adminDataWorkflows.spec.ts:446](../../../src/tests/playwright/behavior/adminDataWorkflows.spec.ts#L446) — Box browser flow browses folders, displays byte progress, reports provider errors, and retries cleanly (chromium).

Playwright: [src/tests/playwright/behavior/adminCompleteness.spec.ts:91](../../../src/tests/playwright/behavior/adminCompleteness.spec.ts#L91) — Box SDK provider bytes survive permission and interrupted-stream failures and archive retry (chromium).

## ADMIN-008: Admin dump and Automerge diagnostics

**P1 · Mapped**

Action: Open export/doc listing/manage-doc routes for valid/missing URLs with authorized and unauthorized users.

Expected: Diagnostics address the intended document; errors and write-capable operations are explicit and role-gated.

Playwright: [src/tests/playwright/behavior/adminDiagnostics.spec.ts:16](../../../src/tests/playwright/behavior/adminDiagnostics.spec.ts#L16) — admin export and Automerge diagnostics address their mission and reject missing or unauthorized data (chromium).

Playwright: [src/tests/playwright/behavior/adminDiagnostics.spec.ts:151](../../../src/tests/playwright/behavior/adminDiagnostics.spec.ts#L151) — export route hides prior mission controls while a changed mission ID is loading (chromium).

Evidence boundary: Checks the exact document listing and dump for the fixture mission, UI export text/download and Manage Automerge identity/write controls, missing listing/dump/export routes, and view-only denial of mission dumps and admin UI routes.

## ADMIN-009: Connection and integration monitors

**P1 · Mapped**

Action: Open serverSocketStatus, Maestro, DUST and EMSS pages; join/leave clients and refresh.

Expected: Counts, mission rooms and connection detail reflect actual sessions without exposing another role's restricted controls.

Playwright: [src/tests/playwright/behavior/adminDiagnostics.spec.ts:193](../../../src/tests/playwright/behavior/adminDiagnostics.spec.ts#L193) — super-admin connection monitors follow isolated visitors, refresh, leave, and role limits (chromium).

Evidence boundary: Uses an isolated view-only visitor scoped to the fixture mission to verify the super-admin socket monitor's mission count and connection detail, then joins/refreshes/leaves Maestro and DUST monitor sessions, checks EMSS status and canceled disable, and verifies monitor UI/API role gates.

## ADMIN-010: Environment and EMSS configuration controls

**P0 · Partial**

Action: Use environment/EMSS configuration routes as admin/super-admin and normal users.

Expected: Only super-admins can read/change the declared environment overrides and EMSS enable flag. Environment effective/default/override values, unknown-key rejection, and EMSS boolean validation match the configured handler contracts.

Playwright: [src/tests/playwright/behavior/adminDataWorkflows.spec.ts:679](../../../src/tests/playwright/behavior/adminDataWorkflows.spec.ts#L679) — super-admin environment configuration shows defaults and rejects viewer access and unknown keys (chromium).

Playwright: [src/tests/playwright/behavior/adminDataWorkflows.spec.ts:764](../../../src/tests/playwright/behavior/adminDataWorkflows.spec.ts#L764) — EMSS admin toggle requires a boolean, preserves confirmation cancellation, and restores its initial state (chromium).

Playwright: [src/tests/playwright/behavior/authBoundaries.spec.ts:237](../../../src/tests/playwright/behavior/authBoundaries.spec.ts#L237) — declared admin routes and field policies separate editor, admin, and super-admin (chromium).

Evidence boundary: Browser coverage checks super-admin defaults, viewer read/write rejection, and unknown keys. Save/clear of shared deployment overrides is covered by the environmentConfig server tests; browser mutation is omitted because parallel runs cannot isolate the server-wide setting. EMSS toggle coverage uses a disposable API process.
