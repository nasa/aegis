# Authentication, permissions and connection gates

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Distinct guest, viewer, editor, admin and super-admin sessions; two missions with different grants.

Source: [src/utils/permissions.ts](../../../src/utils/permissions.ts), [src/pages/mission.tsx](../../../src/pages/mission.tsx), [src/pages/admin/index.tsx](../../../src/pages/admin/index.tsx), [src/server/express/routes/auth.ts](../../../src/server/express/routes/auth.ts).

Scenario mapping: **8/8 (100%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/express/login.test.ts](../../../src/tests/vitest/express/login.test.ts), [src/tests/vitest/express/appUser.test.ts](../../../src/tests/vitest/express/appUser.test.ts).

## AUTH-001: Signed-out and expired-session entry

**P0 · Mapped**

Action: Open home, editor, dashboard and admin without a session and with an expired session.

Expected: Authentication recovery follows the configured proxy contract and never exposes protected data or edit controls.

Playwright: [src/tests/playwright/behavior/authEntry.spec.ts:9](../../../src/tests/playwright/behavior/authEntry.spec.ts#L9) — signed out home entry recovers to login without protected controls (chromium).

Playwright: [src/tests/playwright/behavior/authEntry.spec.ts:9](../../../src/tests/playwright/behavior/authEntry.spec.ts#L9) — signed out mission entry recovers to login without protected controls (chromium).

Playwright: [src/tests/playwright/behavior/authEntry.spec.ts:9](../../../src/tests/playwright/behavior/authEntry.spec.ts#L9) — signed out dashboard entry recovers to login without protected controls (chromium).

Playwright: [src/tests/playwright/behavior/authEntry.spec.ts:9](../../../src/tests/playwright/behavior/authEntry.spec.ts#L9) — signed out admin entry recovers to login without protected controls (chromium).

Playwright: [src/tests/playwright/behavior/authEntry.spec.ts:9](../../../src/tests/playwright/behavior/authEntry.spec.ts#L9) — expired cookie home entry recovers to login without protected controls (chromium).

Playwright: [src/tests/playwright/behavior/authEntry.spec.ts:9](../../../src/tests/playwright/behavior/authEntry.spec.ts#L9) — expired cookie mission entry recovers to login without protected controls (chromium).

Playwright: [src/tests/playwright/behavior/authEntry.spec.ts:9](../../../src/tests/playwright/behavior/authEntry.spec.ts#L9) — expired cookie dashboard entry recovers to login without protected controls (chromium).

Playwright: [src/tests/playwright/behavior/authEntry.spec.ts:9](../../../src/tests/playwright/behavior/authEntry.spec.ts#L9) — expired cookie admin entry recovers to login without protected controls (chromium).

Evidence boundary: The configured local cookie-session contract is exercised with no session and browser-expired authenticated cookies at home/editor/dashboard/admin entry. Login recovers with no protected controls; protected list/write HTTP calls reject without changing the mission. This does not assert a separately configured external proxy contract.

## AUTH-002: Viewer cannot mutate

**P0 · Mapped**

Action: As a view-only user open fields, menus, geometry editing and execution controls; issue equivalent direct writes.

Expected: Read access works; UI and server reject mutations with the mission unchanged.

Playwright: [src/tests/playwright/behavior/authBoundaries.spec.ts:76](../../../src/tests/playwright/behavior/authBoundaries.spec.ts#L76) — viewer can read fields, geometry and execution but UI and raw writes leave the mission unchanged (chromium).

## AUTH-003: Editor access stays mission-scoped

**P0 · Mapped**

Action: As an editor for mission A attempt reads and writes for mission B by URL, API and Automerge socket.

Expected: Mission A remains editable and mission B stays protected across all transports.

Playwright: [src/tests/playwright/behavior/authBoundaries.spec.ts:165](../../../src/tests/playwright/behavior/authBoundaries.spec.ts#L165) — editor access stays on mission A across direct URLs, REST reads and writes, and known-document sockets (chromium).

## AUTH-004: Admin and super-admin boundaries

**P0 · Mapped**

Action: Enumerate declared policies for registered admin routes and mutation endpoints; exercise each distinct policy boundary with viewer, editor, admin and super-admin accounts as applicable.

Expected: Visibility and server enforcement agree with each route's declared policy, including super-admin-only controls.

Playwright: [src/tests/playwright/behavior/authBoundaries.spec.ts:237](../../../src/tests/playwright/behavior/authBoundaries.spec.ts#L237) — declared admin routes and field policies separate editor, admin, and super-admin (chromium).

## AUTH-005: Permission revocation in an open session

**P0 · Mapped**

Action: Revoke edit/view permission while the user's editor is open; attempt HTTP reads/writes with the existing session and a fresh login.

Expected: Persisted grants are refreshed for subsequent HTTP requests: revoked mission reads/writes are denied in existing and fresh sessions. An already-open Automerge socket may continue writing after grant removal.

Playwright: [src/tests/playwright/behavior/adminPermissions.spec.ts:214](../../../src/tests/playwright/behavior/adminPermissions.spec.ts#L214) — super-admin grant changes deny HTTP access and capture existing Automerge writes (chromium).

Evidence boundary: User-confirmed policy on 2026-10-25 permits continued writes on existing Automerge sockets. The test asserts persisted grant removal, existing-session HTTP denial with unchanged data after the rejected write, fresh-login grants and HTTP denial. The socket attachment is characterization, not a socket-revocation acceptance assertion. Initial transport authorization remains in AUTH-002/003.

## AUTH-006: Edit mode field and menu matrix

**P0 · Mapped**

Action: Toggle Edit off/on for mission, entity, preset, report, position and execution controls.

Expected: Each control observes its permission and mode requirements; canceling drafts does not enable a write.

Playwright: [src/tests/playwright/behavior/editModeMatrix.spec.ts:37](../../../src/tests/playwright/behavior/editModeMatrix.spec.ts#L37) — global Edit gates shared fields and menus across mission, entity, preset, report and position surfaces (chromium).

Playwright: [src/tests/playwright/behavior/executionPolicy.spec.ts:204](../../../src/tests/playwright/behavior/executionPolicy.spec.ts#L204) — station, traverse and action statuses cycle without global Edit and preserve historical and planned data (chromium).

Playwright: [src/tests/playwright/behavior/mapEditing.spec.ts:198](../../../src/tests/playwright/behavior/mapEditing.spec.ts#L198) — dragging an interior vertex then Cancel preserves endpoints and the intended path after reload (chromium, firefox, webkit).

Evidence boundary: A live editor with global Edit off cannot open mission, station, or preset drafts, add or delete stations, add presets, mutate reports, or add position sources; authoritative mission data stays unchanged. Turning Edit on enables the supported field/menu writes. Mission-description and preset drafts are canceled and proven unchanged before a separate saved edit; station draft cancellation is also verified. The report campaign gate covers create, rename, and membership mutation, while local report viewing remains available. Supporting tests cover execution status controls under their independent execution permissions and map path edit/cancel persistence. This validates the editor global-mode UI matrix across the listed authoring surfaces; execution status controls intentionally remain available without global Edit.

## AUTH-007: Transport-specific disconnect gate

**P0 · Mapped**

Action: Drop only Automerge while keeping HTTP and Socket.IO alive, and then restore it.

Expected: Edit and Save are disabled while the document transport is unavailable and recover only after synchronization.

Playwright: [src/tests/playwright/behavior/transportRecovery.spec.ts:12](../../../src/tests/playwright/behavior/transportRecovery.spec.ts#L12) — Automerge-only disconnect gates Edit and an open Save before same-epoch recovery (chromium).

Evidence boundary: Only the real Automerge transport is closed; HTTP and incoming Socket.IO frames remain live. Open Save and Edit are gated, canceled drafts stay absent, a peer edit catches up and subsequent writes persist and survive reload.

## AUTH-008: Session and request error recovery

**P1 · Mapped**

Action: Fail a protected request with 401/403/500 while a dialog is open; restore the session and retry.

Expected: Failure is visible, saved values remain intact, and retry does not apply a duplicate mutation.

Playwright: [src/tests/playwright/behavior/requestRecovery.spec.ts:11](../../../src/tests/playwright/behavior/requestRecovery.spec.ts#L11) — 401, 403, and 500 user-save failures preserve the open form and recover without duplicate creation (chromium).

Evidence boundary: For each 401, 403, and 500 protected user-create request, the Create User form remains open with username/password intact, an error is visible, and the saved-user list remains unchanged. The browser session is cleared and restored with a fresh login while the dialog stays open; one retry succeeds, the form reports creation, and the authoritative list contains exactly one user. The 401 is a real unauthenticated server response; 403/500 are one-time injected responses at the same protected endpoint.
