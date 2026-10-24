# Collaboration, persistence and recovery

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Two independent browser contexts for the same authorized test user and disposable mission; add distinct-user roles for permission scenarios.

Source: [src/client/automerge-network-adapter.ts](../../../src/client/automerge-network-adapter.ts), [src/client/automergeDocHandles.ts](../../../src/client/automergeDocHandles.ts), [src/server/automerge](../../../src/server/automerge).

Scenario mapping: **6/14 (42.9%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/utils/versionGatedNetworkAdapter.test.ts](../../../src/tests/vitest/utils/versionGatedNetworkAdapter.test.ts), [src/tests/vitest/automerge/integrityCheck.test.ts](../../../src/tests/vitest/automerge/integrityCheck.test.ts).

## COLLAB-001: a disconnected client catches up without reloading and can publish edits after reconnecting

**P0 · Mapped**

Action: a disconnected client catches up without reloading and can publish edits after reconnecting

Expected: Offline peer cannot enable editing, misses a server-persisted station rename, then catches up without navigation; a peer edit flows back and persists after reload.

Playwright: [src/tests/playwright/behavior/collaboration.spec.ts:37](../../../src/tests/playwright/behavior/collaboration.spec.ts#L37) — a disconnected client catches up without reloading and can publish edits after reconnecting (chromium).

## COLLAB-002: a saved edit reaches another client without changing that client's selected station

**P0 · Mapped**

Action: a saved edit reaches another client without changing that client's selected station

Expected: A saved station rename reaches the peer list without changing that peer's independently selected station, and remains after reload.

Playwright: [src/tests/playwright/behavior/collaboration.spec.ts:89](../../../src/tests/playwright/behavior/collaboration.spec.ts#L89) — a saved edit reaches another client without changing that client's selected station (chromium).

## COLLAB-003: simultaneous edits to different stations merge and persist in both clients

**P0 · Mapped**

Action: simultaneous edits to different stations merge and persist in both clients

Expected: Concurrent edits to different stations merge and persist in both clients without losing either value.

Playwright: [src/tests/playwright/behavior/collaboration.spec.ts:120](../../../src/tests/playwright/behavior/collaboration.spec.ts#L120) — simultaneous edits to different stations merge and persist in both clients (chromium).

## COLLAB-004: a canceled dialog draft never replaces the value shown by another client

**P0 · Mapped**

Action: a canceled dialog draft never replaces the value shown by another client

Expected: Canceled dialog draft never replaces the persisted or peer-visible value.

Playwright: [src/tests/playwright/behavior/collaboration.spec.ts:169](../../../src/tests/playwright/behavior/collaboration.spec.ts#L169) — a canceled dialog draft never replaces the value shown by another client (chromium).

## COLLAB-005: a station created by one client can be edited by another and deleted without stale list entries

**P0 · Mapped**

Action: a station created by one client can be edited by another and deleted without stale list entries

Expected: Station creation, peer editing and deletion converge without stale list entries or changes to unrelated station data.

Playwright: [src/tests/playwright/behavior/collaboration.spec.ts:200](../../../src/tests/playwright/behavior/collaboration.spec.ts#L200) — a station created by one client can be edited by another and deleted without stale list entries (chromium).

## COLLAB-006: a client joining after edits sees persisted state and later changes in both directions

**P0 · Mapped**

Action: a client joining after edits sees persisted state and later changes in both directions

Expected: Late joiner sees already persisted changes and subsequent edits propagate in both directions.

Playwright: [src/tests/playwright/behavior/collaboration.spec.ts:255](../../../src/tests/playwright/behavior/collaboration.spec.ts#L255) — a client joining after edits sees persisted state and later changes in both directions (chromium).

## COLLAB-007: Same-field conflict convergence

**P0 · Gap**

Action: Two independent clients concurrently rename/edit the same field, then reconnect and reload.

Expected: All clients and server converge on the documented conflict resolution while preserving unrelated fields; no arbitrary winner is asserted without a contract.

## COLLAB-008: Atomic graph edits observed by peers

**P0 · Gap**

Action: Observe entity graph while a peer duplicates/deletes EVA/REX/station/action trees.

Expected: Each logical atomic operation exposes valid ownership/order references; no peer observes half-built or orphan graphs.

## COLLAB-009: Delete while peer edits or selects

**P0 · Gap**

Action: Delete a station/action/EVA/REX while the peer has it selected and a draft open.

Expected: Selections and dialogs recover without resurrecting deleted identities or corrupting surviving relationships.

## COLLAB-010: Mission switch during synchronization

**P0 · Gap**

Action: Switch missions while changes, terrain requests and sockets from the first mission are in flight.

Expected: Late responses do not update the new mission, and both documents retain their intended independent changes.

## COLLAB-011: Server restart and epoch mismatch

**P0 · Gap**

Action: Restart a disposable server while an old tab remains open; attempt reconnect and stale edits.

Expected: Epoch gate prevents stale merging, directs the client to version recovery and resumes only with a fresh current document.

## COLLAB-012: Server unavailable then same-epoch recovery

**P0 · Gap**

Action: Drop/recover the server transport with failed version fetches and delayed document readiness.

Expected: Recovery keeps polling appropriately, disables editing and resumes only after authoritative same-epoch synchronization.

## COLLAB-013: Browser close and server persistence

**P0 · Gap**

Action: Save, close all clients and reopen; separately restart the server after a confirmed durable write.

Expected: Confirmed saved changes remain in the authoritative store; unsaved drafts do not become persisted data.

## COLLAB-014: Distinct-user presence and permissions

**P1 · Gap**

Action: Connect an editor and viewer as distinct accounts; edit, disconnect and revoke access.

Expected: Presence/counts and independent selections are correct while each user's write privileges remain enforced.
