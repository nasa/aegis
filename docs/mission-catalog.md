# Mission catalog and document loading

Automerge remains the authoritative mission data. PostgreSQL holds two derived read models:

- `mission_catalog_db`: mission name, archive status, action-system version, creation time, and
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
adapter queues a check of that document's indexed fields. The check compares a small in-memory
summary against the last successfully indexed values. Unrelated edits perform no catalog
queries or writes, and do not cause an extra document flush. This covers user edits, admin
edits, remote sync and imports. Sync-state writes do not queue checks. An in-memory set
coalesces repeated notifications and processes documents sequentially, outside the save call.
There is no index polling, database trigger or persistent pending queue. The summary and EVA
rows update in one transaction; unchanged rows are not rewritten. Deleting a document listing
cascades through both indexes. Loading an unloaded mission also refreshes its entry.

Index updates are triggered by mission ID/name/archive status/action-system version/creation
time, EVA UUID/name/as-planned membership, and the running REX's UUID/name/PET clock fields.
Position entries, descriptions, actions and other content are excluded. Mission `updatedAt`
remains in the full document but is not stored in the catalog or shown in the admin mission
list, so timestamp-only changes do not trigger indexing. No full Automerge
document is copied or retained for comparison; the small cached values expire with the handle.

Creation and admin archive/unarchive wait for projection before responding. Other synchronized
edits become visible after the storage save and its queued update. The homepage polls
the summary endpoint every five seconds; its PET clock continues ticking locally.

For this rollout, the temporary `populateMissionCatalogOnce` startup function builds missing
catalog entries before the API listens. It loads, projects, flushes and releases one document
at a time. The persisted catalog rows record progress: subsequent starts load no documents
for population, and an interrupted run resumes the missing entries. Remove the function and
its startup import/call in the next MR after rollout. Normal startup then preloads only
missions with an active REX. An abrupt crash between document save and index update
can leave a stale entry until the mission is next loaded or saved. Failed index updates are
logged and retried on the next save/load. This deliberately accepts that small consistency gap
instead of maintaining a separate crash-recovery protocol.

This follows the current single API repository deployment. Run standalone document migrations,
restores and seeders with the API stopped, then restart it. Their changes refresh the index
when each mission is next loaded.
Sharing storage does not keep two independent live Automerge repositories synchronized;
multi-process writers would need a
separate ownership/synchronization design.

## Deployment and memory

Run the existing `npm run migration:up` pipeline. The PostgreSQL `Migration20261021000000`
creates the read models and URL/EVA lookup indexes. The temporary API startup function then
populates them; no catalog Automerge migration or migration ordering changes are needed.
**The first deployment still reads every existing mission once** to build the catalog;
allow time for that backfill. Progress and timings use the `mission-catalog` logs.

`Repo.find()` calls for unloaded documents are serialized, while documents that are already
loaded or loading bypass the queue. Pending Automerge migrations also process, validate, flush
and release one mission at a time, rather than retaining the entire historical collection.

Idle documents are eligible for release after four hours. A separate once-per-minute
memory housekeeping timer checks loaded documents; it does not query the catalog for changes.
Eviction retains missions with a running REX, Aegis visitors, or Maestro/DUST visitors or
retained handles. When the last such consumer disappears, a new four-hour grace period starts.
Any in-flight HTTP request pauses eviction. Connected Automerge peers alone do not prevent
eviction. Eligible documents are flushed and projected before release; activity during that
work cancels eviction. There is no hard memory cap for retained missions. Opening a large individual mission can still
be expensive. Cache release uses the installed Repo's experimental `removeFromCache` API through
`releaseMissionDocument`, after flushing the real document. The helper skips the unload
transition while Repo clears its caches and synchronizer: Repo 2.5.6 otherwise broadcasts and
schedules persistence of the empty unloaded placeholder, which can replace stored mission
data. The orphaned handle and document are collected after pending callbacks finish. Retest
delayed saves and reloading from a fresh repository when upgrading Automerge.

## Logging

The existing `serverLogger` reports initial population progress and one timing entry when an
unloaded document is loaded (`mission-load`, including queue wait). Loads of five seconds or
more use warning level; failures retain their Error and document ID where available. The server-ready
log includes startup time and process memory. No counters or cumulative metrics are maintained
for logging, and there are no periodic activity reports or routine per-save, cache-hit or SQL-read logs.

## Verification

The catalog integration tests use real Automerge documents and PostgreSQL storage. Apply the
schema migration to the test database before running them. They cover discovery with no loaded
documents, selective EVA lookup (including duplicate UUIDs), remote merges, REX clock summaries, archive
permissions, initial backfill, refresh on load, concurrent saves, deletion and idle release.
The repository test verifies sequential loading of unloaded documents and immediate reads of
loaded documents. Use a dedicated test database; mission duplication tests mock asset deletion
so test IDs cannot affect real static assets.
