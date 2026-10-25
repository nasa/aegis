# Maestro, DUST and service contracts

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Disposable socket clients with valid/invalid endpoint token and EMSS master token; schema-valid deterministic payloads and two missions.

Source: [src/server/maestro/v2](../../../src/server/maestro/v2), [src/server/dust/v1](../../../src/server/dust/v1), [src/server/express/restApi.ts](../../../src/server/express/restApi.ts).

Scenario mapping: **10/10 (100%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/maestro/v2/sockets-maestro.test.ts](../../../src/tests/vitest/maestro/v2/sockets-maestro.test.ts), [src/tests/vitest/maestro/v2/mdauValidator.test.ts](../../../src/tests/vitest/maestro/v2/mdauValidator.test.ts), [src/tests/vitest/dust/v1/sockets-dust.test.ts](../../../src/tests/vitest/dust/v1/sockets-dust.test.ts), [src/tests/vitest/dust/v1/sockets-dust-emitters.test.ts](../../../src/tests/vitest/dust/v1/sockets-dust-emitters.test.ts).

## INTEGRATION-001: Maestro subscription and initial hydration

**P0 · Mapped**

Action: Connect matched-version Maestro client, list missions/REXes, subscribe/join and request current state.

Expected: Only authorized subscribed entities arrive with the correct concrete/ref UUID map; unsubscribe/leave prevents further delivery.

Playwright: [src/tests/playwright/behavior/maestroHydration.spec.ts:172](../../../src/tests/playwright/behavior/maestroHydration.spec.ts#L172) — Maestro auth, subscription hydration, UUID maps, unsubscribe, and leave gating (chromium).

Evidence boundary: Exercises authorized and invalid Maestro HTTP/socket authentication, mission and REX listing, exact reference/concrete UUID maps, subscription-scoped hydration and updates, unsubscribe suppression, and mission-leave suppression with real socket clients.

## INTEGRATION-002: MDAU schema reference and atomic rejection

**P0 · Mapped**

Action: Send valid changes, invalid schema, foreign references and inconsistent action-order/membership.

Expected: Allowed changes reach UI and persistence atomically; rejected payloads leave the graph unchanged and return a useful failure.

Playwright: [src/tests/playwright/behavior/maestroHydration.spec.ts:395](../../../src/tests/playwright/behavior/maestroHydration.spec.ts#L395) — valid MDAU edits reach the subscribed client and persist as one graph update (chromium).

Playwright: [src/tests/playwright/behavior/maestroHydration.spec.ts:480](../../../src/tests/playwright/behavior/maestroHydration.spec.ts#L480) — invalid-schema MDAU payload rejects all sibling writes without changing the graph (chromium).

Playwright: [src/tests/playwright/behavior/maestroHydration.spec.ts:524](../../../src/tests/playwright/behavior/maestroHydration.spec.ts#L524) — foreign MDAU entity references reject valid sibling changes atomically (chromium).

Playwright: [src/tests/playwright/behavior/maestroHydration.spec.ts:595](../../../src/tests/playwright/behavior/maestroHydration.spec.ts#L595) — inconsistent MDAU action order rejects parent edits without partial application (chromium).

Playwright: [src/tests/playwright/behavior/maestroHydration.spec.ts:641](../../../src/tests/playwright/behavior/maestroHydration.spec.ts#L641) — cross-parent MDAU action membership rejects valid sibling edits atomically (chromium).

Evidence boundary: Uses real Maestro socket payloads to prove valid station/action updates reach the subscribed client and persist, while malformed schema, foreign station references, and foreign action-order references return failure with unchanged mission graph and no dataAll event.

## INTEGRATION-003: Maestro execution start and policy freeze

**P0 · Mapped**

Action: Start a REX with mode/control metadata in the same inbound payload; stop/restart.

Expected: Policy applies before first-start freeze; execution identity, PET ownership and original numbering stay coherent across both applications.

Playwright: [src/tests/playwright/behavior/maestroExecution.spec.ts:172](../../../src/tests/playwright/behavior/maestroExecution.spec.ts#L172) — Maestro start applies policy before freeze and preserves execution identity across stop and restart (chromium).

Evidence boundary: Starts a real isolated REX with policy, event identity, and Maestro PET ownership in one MDAU; verifies the first-start action-number baseline, generated zero-PET positions, UI ownership, stop, and restart attempting a different mode while identity and frozen policy persist.

## INTEGRATION-004: Maestro paused zero and duration semantics

**P0 · Mapped**

Action: Exchange paused numeric PET zero, running sentinel and null/zero/manual durations.

Expected: Wire encoding preserves paused/running and computed/manual distinctions; displayed clocks and durations agree.

Playwright: [src/tests/playwright/behavior/maestroExecution.spec.ts:332](../../../src/tests/playwright/behavior/maestroExecution.spec.ts#L332) — Maestro preserves paused zero, running PET sentinel, and null, zero, and manual durations (chromium).

Evidence boundary: Sends paused numeric PET zero and a running +00:00:00 sentinel with an older timestamp, verifies the UI clock, and checks that null station duration uses the computed UI total while zero and manual action duration remain explicit in persistence and the UI.

## INTEGRATION-005: Maestro concurrent names and lineage

**P0 · Mapped**

Action: Rename both traverse endpoints in one update, reverse payload order, reorder actions and duplicate execution.

Expected: Names, order and concrete versus lineage IDs stay consistent with UI and persisted graph.

Playwright: [src/tests/playwright/behavior/maestroRecovery.spec.ts:154](../../../src/tests/playwright/behavior/maestroRecovery.spec.ts#L154) — Maestro resolves concurrent traverse names, action order, and concrete lineage IDs (chromium).

Evidence boundary: Uses a schema-valid mission with planned and executed entity copies plus a second action sharing its planned/executed ref UUID. One reverse-ordered MDAU renames both endpoints, reorders each action list, and checks exact getExecuteUuids, persisted identities/order, and visible EVA/action UI.

## INTEGRATION-006: Maestro disconnect rejection and resync

**P0 · Mapped**

Action: Disconnect before send, reject after send and reconnect with current state; vary timestamp-only updates.

Expected: Retry/baseline behavior follows the actual delivery contract, no timestamp feedback loop occurs, and no durable delivery is assumed without evidence.

Playwright: [src/tests/playwright/behavior/maestroRecovery.spec.ts:295](../../../src/tests/playwright/behavior/maestroRecovery.spec.ts#L295) — Maestro disconnect, rejection, reconnect snapshot, and timestamp-only updates follow delivery acknowledgements (chromium).

Evidence boundary: Verifies an emit after client disconnect receives no ack and changes no graph, reconnect getEverything returns current state, invalid sent payload returns an error with no change, accepted updates ack and persist before checking dataAll, timestamp-only updates deliver once, and identical resends produce no extra event.

## INTEGRATION-007: DUST authentication join and resync

**P0 · Mapped**

Action: Connect with valid/invalid DUST and EMSS tokens; request everything before/after join and after join failure.

Expected: Auth accepts its declared credentials, resync requires successful mission join and failed setup rolls back room/visitor state.

Playwright: [src/tests/playwright/behavior/dustContract.spec.ts:355](../../../src/tests/playwright/behavior/dustContract.spec.ts#L355) — DUST and EMSS socket authentication, mission join, resync, and failed-join rollback (chromium).

Evidence boundary: Uses real DUST namespace clients and two isolated schema-validated Automerge missions to verify accepted DUST/EMSS credentials, invalid token rejection, getEverything before and after joins, and failed setup cleanup through exposed visitor/listener diagnostics.

## INTEGRATION-008: DUST live payload and mission isolation

**P0 · Mapped**

Action: Edit/delete positions, rename mission/REX/EVA/type/source and change running state while two mission clients subscribe.

Expected: Canonical payload updates reach only the intended mission with correct resolved names and complete positions; no unrelated rooms receive them.

Playwright: [src/tests/playwright/behavior/dustContract.spec.ts:452](../../../src/tests/playwright/behavior/dustContract.spec.ts#L452) — DUST streams complete canonical updates only to the subscribed mission (chromium).

Evidence boundary: Uses two real mission subscriptions with independently known position values to verify add/edit/delete full payloads, mission/REX/EVA/type/source rename resolution, running-state gating, full resync, and absence of cross-mission events.

## INTEGRATION-009: REST infrastructure authorization and errors

**P0 · Mapped**

Action: Enumerate HTTP handler/method contracts, then exercise named authorization, missing-resource and invalid-input cases with explicit fixtures; reuse reviewed browser evidence from the owning scenario families.

Expected: Wrapped status/HTTP semantics, scope and validation match the handler contract; route registration alone receives no scenario credit.

Playwright: [src/tests/playwright/behavior/restAuthorizationContracts.spec.ts:9](../../../src/tests/playwright/behavior/restAuthorizationContracts.spec.ts#L9) — REST mission routes enforce grants and return their declared validation and missing-resource responses (chromium).

Playwright: [src/tests/playwright/behavior/authBoundaries.spec.ts:237](../../../src/tests/playwright/behavior/authBoundaries.spec.ts#L237) — declared admin routes and field policies separate editor, admin, and super-admin (chromium).

Playwright: [src/tests/playwright/behavior/infrastructure.spec.ts:4](../../../src/tests/playwright/behavior/infrastructure.spec.ts#L4) — health, version, time, and permitted diagnostics follow their service policies (chromium).

Playwright: [src/tests/playwright/behavior/infrastructure.spec.ts:113](../../../src/tests/playwright/behavior/infrastructure.spec.ts#L113) — server version dependency failure shows a safe startup diagnostic (chromium).

## INTEGRATION-010: Health version time logs and metrics

**P1 · Mapped**

Action: Read health/version/time and permitted diagnostics; send client logs and fail a dependency.

Expected: No-cache/version-epoch, server-time and metrics/log policies hold and failure does not expose restricted configuration.

Playwright: [src/tests/playwright/behavior/infrastructure.spec.ts:4](../../../src/tests/playwright/behavior/infrastructure.spec.ts#L4) — health, version, time, and permitted diagnostics follow their service policies (chromium).

Playwright: [src/tests/playwright/behavior/infrastructure.spec.ts:113](../../../src/tests/playwright/behavior/infrastructure.spec.ts#L113) — server version dependency failure shows a safe startup diagnostic (chromium).

Evidence boundary: Covers public health/version/time semantics, EMSS-token-protected Prometheus metrics, super-admin-only socket diagnostics, client-log submission, and a deterministic version-service failure rendered as a non-sensitive startup message.
