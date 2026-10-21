# Mission catalog and cold loading

Automerge remains the authoritative mission data. PostgreSQL holds two derived read models:

- `mission_catalog_db`: mission name, archive status, action-system version, timestamps, and
  the running REX identifier/name and PET clock parameters. The summary is small JSONB.
- `mission_eva_catalog_db`: mission ID, EVA UUID/name, and whether it is as-planned. Its key is
  `(mission_id, eva_uuid)` because mission duplication can preserve EVA UUIDs.

The homepage, admin mission list and Maestro `getMissions` query these tables without loading
documents. `getRexesByEva?evaUuid=...` resolves the EVA through the index and opens only matching
missions, including archived missions as before. Maestro's API parameters and response shapes
are unchanged. Full-document export endpoints and the one-time `getRefUuidMap` migration
endpoint still deliberately read full documents.

## Updates

After successfully saving an Automerge snapshot/incremental chunk, the PostgreSQL storage
adapter queues an index update for that document. This shared path covers user edits, admin
edits, remote sync and imports. Sync-state writes do not queue updates. An in-memory set
coalesces repeated notifications and processes documents sequentially, outside the save call.
There is no index polling, database trigger or persistent pending queue. The summary and EVA
rows update in one transaction; unchanged rows are not rewritten. Deleting a document listing
cascades through both indexes. Loading a cold mission also refreshes its entry.

Creation and admin archive/unarchive wait for projection before responding. Other synchronized
edits become visible after the storage save and its queued update. The homepage polls
the summary endpoint every five seconds; its PET clock continues ticking locally.

On startup, the API backfills missing or outdated summaries **before listening**. It loads
and releases one document at a time. Clean restarts query metadata only and load zero mission
documents. Increment `MISSION_CATALOG_VERSION` when the projection format or semantics change
to request a rebuild on the next start. An abrupt crash between document save and index update
can leave a stale entry until the mission is next loaded or saved. Failed index updates are
logged and retried on the next save/load. This deliberately accepts that small consistency gap
instead of maintaining a separate crash-recovery protocol.

This follows the current single API repository deployment. Run standalone document migrations,
restores and seeders with the API stopped, then restart it. Their changes refresh the index
when each mission is next loaded; bump the catalog version if an immediate rebuild is needed.
Sharing storage does not keep two independent live Automerge repositories synchronized;
multi-process writers would need a
separate ownership/synchronization design.

## Deployment and memory

Run the normal database migration pipeline. `Migration20261021000000` creates the read models
and URL/EVA lookup indexes. **The first deployment still reads every
existing mission once** to build the catalog; allow time for that backfill. Progress and timings
are logged under `mission-catalog`. Completed entries survive an interrupted backfill.

Cold `Repo.find()` calls are serialized, while already loading/resident handles bypass the
queue. Pending Automerge migrations also process, validate, flush and release one mission at a
time, rather than retaining the entire historical collection.

Idle documents are eligible for release after fifteen minutes. A separate once-per-minute
memory housekeeping timer checks resident handles; it does not query the catalog for changes.
Eviction is deliberately conservative: it waits until there are no Automerge peers, Aegis
visitors, Maestro/DUST handle
consumers or in-flight HTTP requests, and flushes/projects before releasing. It does not impose
a hard memory cap while clients remain connected. Opening a large individual mission can still
be expensive. Cache release uses the installed Repo's experimental `removeFromCache` API;
retest persistence and reloading when upgrading Automerge.

## Logging and diagnosis

All diagnostics use the existing `serverLogger` and its console/remote level controls.
Set `VITE_PUBLIC_CONSOLE_LOG_LEVEL=debug` for local tracing or
`VITE_PUBLIC_REMOTE_LOG_LEVEL=debug` for remote tracing (with `LOG_ENABLE_APP_LOGGING=true`
and the existing logging endpoint configured). Restart the API after changing these settings.
Normal production `info` logging includes startup, backfill progress, cold loads, eviction,
creation/archive/deletion, and shutdown. Routine saves, queue activity, catalog reads and
successful projections are `debug` so they can be enabled while diagnosing a problem.

Filter by `logId`:

- `mission-catalog`: backfill start/progress/completion, save/load queue source, coalescing,
  projection version, flush/transaction timings, changed mission/EVA row counts, missing
  listings, SQL-only list reads, EVA lookup matches, and shutdown drain. Failures include
  the document ID, available mission IDs, phase and Error stack. Multiple missions matching
  one EVA UUID are `notice`; an indexed EVA absent from its loaded mission is `warning`.
- `mission-load`: cached versus queued cold loads, queue wait versus load duration,
  resident document count and process RSS bytes, full-document read requests, and idle
  eviction. Housekeeping logs the active HTTP request, peer, visitor and integration-handle
  counts that prevent eviction. Unscoped bulk reads and the Maestro full-scan endpoints
  produce `notice` logs. Cold loads taking at least five seconds produce `warning` logs.
- `mission-storage`: saved document chunk type, bytes and database-write duration, whether
  a catalog listener is attached, loaded storage range sizes, and save errors. Sync-state
  saves do not emit routine success logs. Storage operations and projections taking at
  least one second produce `warning` logs.
- `automerge-migration`: the mission being loaded, progress, elapsed time and memory after
  release. The `server` readiness log includes API startup duration and resident documents.

For a stale entry, follow its `documentId` from chunk saved to update queued to projection
completed. Check `summaryRowsChanged`, `evaRowsChanged` and `evaRowsDeleted`: zero means the
projected values were unchanged, not that the update was skipped. For slow startup, compare
backfill progress, cold-load `queueWaitMs`/`durationMs` and storage-range timings. A cold-load
start without completion identifies the document currently loading. Mission-handle and
projection logs connect database mission IDs to Automerge document IDs.

Routine diagnostic fields contain identifiers, counts, timings and state flags rather than
document contents, mission titles or authentication tokens; failures retain the existing
Error/stack logging behavior. Memory values describe the whole process;
evicting a handle does not guarantee an immediate RSS decrease. Logging introduces no extra
catalog polling or document loads; SQL `RETURNING` supplies changed-row counts without
additional queries.

## Verification

The catalog integration tests use real Automerge documents and PostgreSQL storage. Apply the
schema migration to the test database before running them. They cover zero-load cold discovery,
selective EVA lookup (including duplicate UUIDs), remote merges, REX clock summaries, archive
permissions, initial backfill, refresh on load, concurrent saves, deletion and idle release.
The lazy repository test verifies bounded cold loads and immediate warm reads. Use a dedicated test database;
mission duplication tests mock asset deletion so test IDs cannot affect real static assets.
