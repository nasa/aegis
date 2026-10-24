# Maestro, DUST and service contracts

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Disposable socket clients with valid/invalid endpoint token and EMSS master token; schema-valid deterministic payloads and two missions.

Source: [src/server/maestro/v2](../../../src/server/maestro/v2), [src/server/dust/v1](../../../src/server/dust/v1), [src/server/express/restApi.ts](../../../src/server/express/restApi.ts).

Scenario mapping: **0/10 (0%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/maestro/v2/sockets-maestro.test.ts](../../../src/tests/vitest/maestro/v2/sockets-maestro.test.ts), [src/tests/vitest/maestro/v2/mdauValidator.test.ts](../../../src/tests/vitest/maestro/v2/mdauValidator.test.ts), [src/tests/vitest/dust/v1/sockets-dust.test.ts](../../../src/tests/vitest/dust/v1/sockets-dust.test.ts), [src/tests/vitest/dust/v1/sockets-dust-emitters.test.ts](../../../src/tests/vitest/dust/v1/sockets-dust-emitters.test.ts).

## INTEGRATION-001: Maestro subscription and initial hydration

**P0 · Gap**

Action: Connect matched-version Maestro client, list missions/REXes, subscribe/join and request current state.

Expected: Only authorized subscribed entities arrive with the correct concrete/ref UUID map; unsubscribe/leave prevents further delivery.

## INTEGRATION-002: MDAU schema reference and atomic rejection

**P0 · Gap**

Action: Send valid changes, invalid schema, foreign references and inconsistent action-order/membership.

Expected: Allowed changes reach UI and persistence atomically; rejected payloads leave the graph unchanged and return a useful failure.

## INTEGRATION-003: Maestro execution start and policy freeze

**P0 · Gap**

Action: Start a REX with mode/control metadata in the same inbound payload; stop/restart.

Expected: Policy applies before first-start freeze; execution identity, PET ownership and original numbering stay coherent across both applications.

## INTEGRATION-004: Maestro paused zero and duration semantics

**P0 · Gap**

Action: Exchange paused numeric PET zero, running sentinel and null/zero/manual durations.

Expected: Wire encoding preserves paused/running and computed/manual distinctions; displayed clocks and durations agree.

## INTEGRATION-005: Maestro concurrent names and lineage

**P0 · Gap**

Action: Rename both traverse endpoints in one update, reverse payload order, reorder actions and duplicate execution.

Expected: Names, order and concrete versus lineage IDs stay consistent with UI and persisted graph.

## INTEGRATION-006: Maestro disconnect rejection and resync

**P0 · Gap**

Action: Disconnect before send, reject after send and reconnect with current state; vary timestamp-only updates.

Expected: Retry/baseline behavior follows the actual delivery contract, no timestamp feedback loop occurs, and no durable delivery is assumed without evidence.

## INTEGRATION-007: DUST authentication join and resync

**P0 · Gap**

Action: Connect with valid/invalid DUST and EMSS tokens; request everything before/after join and after join failure.

Expected: Auth accepts its declared credentials, resync requires successful mission join and failed setup rolls back room/visitor state.

## INTEGRATION-008: DUST live payload and mission isolation

**P0 · Gap**

Action: Edit/delete positions, rename mission/REX/EVA/type/source and change running state while two mission clients subscribe.

Expected: Canonical payload updates reach only the intended mission with correct resolved names and complete positions; no unrelated rooms receive them.

## INTEGRATION-009: REST infrastructure authorization and errors

**P0 · Gap**

Action: Exercise each registered HTTP route with its declared role, missing resource and invalid input.

Expected: Wrapped status/HTTP semantics, scope and validation match the handler contract; route registration alone receives no scenario credit.

## INTEGRATION-010: Health version time logs and metrics

**P1 · Gap**

Action: Read health/version/time and permitted diagnostics; send client logs and fail a dependency.

Expected: No-cache/version-epoch, server-time and metrics/log policies hold and failure does not expose restricted configuration.
