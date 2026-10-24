# Authentication, permissions and connection gates

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Distinct guest, viewer, editor, admin and super-admin sessions; two missions with different grants.

Source: [src/utils/permissions.ts](../../../src/utils/permissions.ts), [src/pages/mission.tsx](../../../src/pages/mission.tsx), [src/pages/admin/index.tsx](../../../src/pages/admin/index.tsx), [src/server/express/routes/auth.ts](../../../src/server/express/routes/auth.ts).

Scenario mapping: **0/8 (0%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/express/login.test.ts](../../../src/tests/vitest/express/login.test.ts), [src/tests/vitest/express/appUser.test.ts](../../../src/tests/vitest/express/appUser.test.ts).

## AUTH-001: Signed-out and expired-session entry

**P0 · Gap**

Action: Open home, editor, dashboard and admin without a session and with an expired session.

Expected: Authentication recovery follows the configured proxy contract and never exposes protected data or edit controls.

## AUTH-002: Viewer cannot mutate

**P0 · Gap**

Action: As a view-only user open fields, menus, geometry editing and execution controls; issue equivalent direct writes.

Expected: Read access works; UI and server reject mutations with the mission unchanged.

## AUTH-003: Editor access stays mission-scoped

**P0 · Gap**

Action: As an editor for mission A attempt reads and writes for mission B by URL, API and Automerge socket.

Expected: Mission A remains editable and mission B stays protected across all transports.

## AUTH-004: Admin and super-admin boundaries

**P0 · Gap**

Action: Visit every admin route as viewer, editor, admin and super-admin and call its mutation endpoint.

Expected: Visibility and server enforcement agree with each route's declared policy, including super-admin-only controls.

## AUTH-005: Permission revocation in an open session

**P0 · Gap**

Action: Revoke edit/view permission while the user's editor and socket are open; attempt another mutation.

Expected: The next protected action follows revocation policy; no unauthorized persisted mutation occurs.

## AUTH-006: Edit mode field and menu matrix

**P0 · Gap**

Action: Toggle Edit off/on for mission, entity, preset, report, position and execution controls.

Expected: Each control observes its permission and mode requirements; canceling drafts does not enable a write.

## AUTH-007: Transport-specific disconnect gate

**P0 · Gap**

Action: Drop only Automerge while keeping HTTP and Socket.IO alive, and then restore it.

Expected: Edit and Save are disabled while the document transport is unavailable and recover only after synchronization.

## AUTH-008: Session and request error recovery

**P1 · Gap**

Action: Fail a protected request with 401/403/500 while a dialog is open; restore the session and retry.

Expected: Failure is visible, saved values remain intact, and retry does not apply a duplicate mutation.
