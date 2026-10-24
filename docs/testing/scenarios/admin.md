# Administrative mission, user, file and diagnostic flows

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Disposable missions, test users and temporary static directory; explicit admin and super-admin roles.

Source: [src/pages/admin/index.tsx](../../../src/pages/admin/index.tsx), [src/pages/admin/mission.tsx](../../../src/pages/admin/mission.tsx), [src/pages/admin/missionDuplicate.tsx](../../../src/pages/admin/missionDuplicate.tsx), [src/pages/admin/missionLayers.tsx](../../../src/pages/admin/missionLayers.tsx), [src/pages/admin/missionSTM.tsx](../../../src/pages/admin/missionSTM.tsx), [src/pages/admin/user.tsx](../../../src/pages/admin/user.tsx), [src/server/express/routes/file](../../../src/server/express/routes/file).

Scenario mapping: **0/10 (0%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/express/file.test.ts](../../../src/tests/vitest/express/file.test.ts), [src/tests/vitest/express/missionAutomergeFields.test.ts](../../../src/tests/vitest/express/missionAutomergeFields.test.ts), [src/tests/vitest/utils/missionDup.test.ts](../../../src/tests/vitest/utils/missionDup.test.ts).

## ADMIN-001: Admin mission lifecycle

**P0 · Gap**

Action: Create/edit/delete a disposable mission through admin UI; cancel destructive actions and refresh lists.

Expected: Fields and document listing agree, Cancel preserves state and deletion cleans only the chosen mission.

## ADMIN-002: Mission duplication identity and ownership

**P0 · Gap**

Action: Duplicate a graph-rich mission with/without supported asset options and observe progress/failure.

Expected: New document/relational IDs and internal references follow the copy contract; source remains unchanged and partial failure is reported.

## ADMIN-003: Mission layers and sublayers administration

**P0 · Gap**

Action: Create/edit/reorder/delete layer headers and each supported sublayer kind; import configured assets.

Expected: Document-backed layer definitions persist and existing presets reconcile without orphan or foreign-mission references.

## ADMIN-004: Admin STM configuration and import

**P0 · Gap**

Action: Load/edit v1/v2 science structures with valid/invalid files and referenced definitions.

Expected: Schema/reference failures are explained and do not partially replace a valid mission configuration.

## ADMIN-005: User permission administration

**P0 · Gap**

Action: Create/edit/revoke viewer/editor/admin grants and super-admin-only flags with another user online.

Expected: Server authorization matches persisted grants and prohibited privilege escalation cannot occur.

## ADMIN-006: Static files upload list rename delete

**P0 · Gap**

Action: Upload representative files, list/sort, rename and cancel/confirm deletion; try duplicate/invalid paths.

Expected: File bytes and listing agree, progress/errors are accurate and no traversal or cross-scope access changes unrelated files.

## ADMIN-007: Box browse and download progress

**P1 · Gap**

Action: Browse test folders, download a file, inject permission/network failure and retry.

Expected: Selection, bytes, progress, completion and failure recovery follow the external contract without duplicate partial files.

## ADMIN-008: Admin dump and Automerge diagnostics

**P1 · Gap**

Action: Open export/doc listing/manage-doc routes for valid/missing URLs with authorized and unauthorized users.

Expected: Diagnostics address the intended document; errors and write-capable operations are explicit and role-gated.

## ADMIN-009: Connection and integration monitors

**P1 · Gap**

Action: Open serverSocketStatus, Maestro, DUST and EMSS pages; join/leave clients and refresh.

Expected: Counts, mission rooms and connection detail reflect actual sessions without exposing another role's restricted controls.

## ADMIN-010: Environment controls and secrets

**P0 · Gap**

Action: Use environment/EMSS configuration routes as admin/super-admin and normal users.

Expected: Only declared roles can read/change each setting; response/UI content follow the intended secret-redaction boundary.
