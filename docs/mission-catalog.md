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

## Updates and recovery

Database triggers mark a document pending in the same transaction that writes its Automerge
snapshot/incremental chunk. Sync-state writes do not invalidate the catalog. Once per second,
the API projects pending resident documents. It flushes the source document first and commits
the mission summary, EVA rows, and acknowledgement of the exact pending generation together.
A concurrent newer storage write invalidates that acknowledgement and is retried. Unchanged
summary/EVA rows are not rewritten. Deleting a document listing cascades through both indexes.

Creation and admin archive/unarchive wait for projection before responding. Other synchronized
edits become visible after the storage save and the next projector pass. The homepage polls
the summary endpoint every five seconds; its PET clock continues ticking locally.

On startup, the API repairs missing, dirty or outdated summaries **before listening**. It loads
and releases one document at a time. Clean restarts query metadata only and load zero mission
documents. Increment `MISSION_CATALOG_VERSION` when the projection format or semantics change
to request a rebuild on the next start.

This follows the current single API repository deployment. Run standalone document migrations,
restores and seeders with the API stopped, then restart it. Sharing storage does not keep two
independent live Automerge repositories synchronized; multi-process writers would need a
separate ownership/synchronization design.

## Deployment and memory

Run the normal database migration pipeline. `Migration20261021000000` creates the read models,
pending queue, triggers and URL/EVA lookup indexes. **The first deployment still reads every
existing mission once** to build the catalog; allow time for that backfill. Progress and timings
are logged under `mission-catalog`. Completed entries survive an interrupted backfill.

Cold `Repo.find()` calls are serialized, while already loading/resident handles bypass the
queue. Pending Automerge migrations also process, validate, flush and release one mission at a
time, rather than retaining the entire historical collection.

Idle documents are eligible for release after fifteen minutes. Eviction is deliberately
conservative: it waits until there are no Automerge peers, Aegis visitors, Maestro/DUST handle
consumers or in-flight HTTP requests, and flushes/projects before releasing. It does not impose
a hard memory cap while clients remain connected. Opening a large individual mission can still
be expensive. Cache release uses the installed Repo's experimental `removeFromCache` API;
retest persistence and reloading when upgrading Automerge.

## Verification

The catalog integration tests use real Automerge documents and PostgreSQL storage. Apply the
schema migration to the test database before running them. They cover zero-load cold discovery,
selective EVA lookup (including duplicate UUIDs), remote merges, REX clock summaries, archive
permissions, restart repair, concurrent saves, deletion and idle release. The lazy repository
test verifies bounded cold loads and immediate warm reads. Use a dedicated test database;
mission duplication tests mock asset deletion so test IDs cannot affect real static assets.
