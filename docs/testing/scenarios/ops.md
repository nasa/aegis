# Operational acceptance outside browser scenario coverage

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Disposable deployment/database and representative synthetic GIS assets; record commands, baseline versions and independent oracles.

Source: [scripts/upgrade-db.sh](../../../scripts/upgrade-db.sh), [GIS_data_conversion_pipeline](../../../GIS_data_conversion_pipeline), [docker-compose.yml](../../../docker-compose.yml), [src/server/automerge/migrations](../../../src/server/automerge/migrations).

Scenario mapping: **—**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/server/automerge/migrationRegistry.test.ts](../../../src/tests/vitest/server/automerge/migrationRegistry.test.ts).

## OPS-001: Database migration and restart drill

**P0 · External**

Action: Upgrade a representative disposable prior database and open fresh/stale clients.

Expected: Migration order, entity identities and epoch recovery are correct; restart does not merge stale pre-migration client state.

Evidence boundary: Operational acceptance requires its own recorded drill/oracle; it is displayed separately and excluded only from the Playwright-eligible denominator.

## OPS-002: Backup restore and disaster recovery

**P0 · External**

Action: Back up and restore a disposable deployment including mission documents, relational rows and static assets.

Expected: Restored state is coherent and usable by fresh clients with measured recovery and no cross-mission loss.

Evidence boundary: Operational acceptance requires its own recorded drill/oracle; it is displayed separately and excluded only from the Playwright-eligible denominator.

## OPS-003: GIS product conversion and registration

**P0 · External**

Action: Generate a representative lunar product set and register it into a disposable mission.

Expected: DEM/COG/PMTiles/grid projections, scientific values and registration agree with independent oracles; publication is separately verified.

Evidence boundary: Operational acceptance requires its own recorded drill/oracle; it is displayed separately and excluded only from the Playwright-eligible denominator.

## OPS-004: Proxy authentication and container deployment

**P0 · External**

Action: Deploy the supported compose/proxy configuration and exercise real authentication and WebSocket upgrades.

Expected: HTTP/socket paths, roles, static ranges, health and reconnect work with the deployed topology.

Evidence boundary: Operational acceptance requires its own recorded drill/oracle; it is displayed separately and excluded only from the Playwright-eligible denominator.

## OPS-005: Load resource and long-session stability

**P1 · External**

Action: Run representative concurrent editors/viewers and large mission/map data over a sustained period.

Expected: Documented latency/resource limits and cleanup hold; no unbounded memory/socket growth or lost acknowledged changes occurs.

Evidence boundary: Operational acceptance requires its own recorded drill/oracle; it is displayed separately and excluded only from the Playwright-eligible denominator.

## OPS-006: Migration rollback and failed-write recovery

**P0 · External**

Action: Inject migration/storage failure in a disposable environment and perform the documented recovery procedure.

Expected: Failure is observable; partial data is recoverable to a coherent version without silent corruption.

Evidence boundary: Operational acceptance requires its own recorded drill/oracle; it is displayed separately and excluded only from the Playwright-eligible denominator.

## OPS-007: Diagnostic map sandbox classification

**P2 · External**

Action: Inspect /testMapPerformant registration and its intended developer-only usage.

Expected: The sandbox is recorded as a diagnostic surface and contributes no operational mission-workflow acceptance credit.

Evidence boundary: Operational acceptance requires its own recorded drill/oracle; it is displayed separately and excluded only from the Playwright-eligible denominator.
