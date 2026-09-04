# Automerge database restore cutover plan

## Status

Implementation design for authoritative database restores.

This document covers only the restore-integrity project: preventing an old browser from merging post-backup Automerge history into a restored mission. Related deployment fencing, planned-maintenance coordination, historical browsing, and history compaction are deferred to `automerge-follow-on-projects-plan.md`.

## Problem

AEGIS stores each mission as an Automerge document in `automerge_native_db`. A mission's stable application identity is `doc_listing_db.mission_id`; `doc_listing_db.automerge_url` identifies the Automerge document currently implementing that mission.

The GitLab restore job stops the entire Docker Compose application, replaces the PostgreSQL data directory with a supplied dump, and starts the application again. No API replica or server-side Automerge `Repo` survives the operation, but an open browser can retain the old document and reconnect automatically.

Restoring an earlier copy of an Automerge document under the same document ID is not an authoritative rollback. A browser retaining later changes can synchronize those changes into the restored history because Automerge merges available changes rather than selecting the database copy by timestamp.

A normal deployment or PostgreSQL major-version upgrade preserves the current logical database state and must not rotate document IDs.

## Goals

- Make an intentional point-in-time database restore authoritative.
- Prevent stale browser history from merging into restored missions.
- Preserve stable mission IDs and relational records keyed by mission ID.
- Switch all mission listings atomically before the API accepts traffic.
- Move an open browser to the replacement document after it detects the restore.
- Keep the process explicit, restartable, testable, and observable.
- Preserve ordinary offline editing when the server returns with the same database epoch and document URL.

## Non-goals

- Reconciling post-backup browser changes into the restored snapshot.
- Coordinating schema-changing deployments or classifying migration compatibility.
- Draining and acknowledging connected clients before planned downtime.
- Providing read-only navigation across document revisions.
- Recording periodic history checkpoints or projecting historical schemas.
- Compacting Automerge history or defining hot, warm, and cold retention.
- Making retired documents forensically immutable. The first implementation protects the replacement document by assigning it a new ID; authorization for retired documents is separate follow-on work.

## Decision summary

1. Introduce an explicit, host-persistent **database epoch ID** managed by deployment automation.
2. Rotate that epoch only for an intentional authoritative restore or environment import.
3. Before the API or Automerge WebSocket server starts, create new Automerge documents from the restored missions' materialized values.
4. Validate and persist every replacement document, then atomically switch all `doc_listing_db` rows to the new URLs.
5. Expose the active database epoch to clients through a no-cache runtime-status response and Socket.IO.
6. When a browser observes a database epoch mismatch, block mutations and perform a controlled full-page reload. The reload resolves the stable mission ID to the replacement document URL.
7. Retain replaced document data. Retention, historical navigation, and retired-document access control are deferred.

The new document ID is the integrity boundary. Client detection and reload prevent users from continuing to edit an obsolete document, but correctness must not depend on every browser receiving a notification.

## When rotation runs

Rotation is selected explicitly; it is not inferred from server uptime, Git commit, migration state, database timestamps, or a fresh PostgreSQL data directory.

| Operation                                                             | Rotate database epoch and document IDs? | Reason                                                                        |
| --------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| Restore an older backup on the same environment                       | Yes                                     | The selected backup must become authoritative.                                |
| Import production into integration or development                     | Yes                                     | Browsers may retain the target environment's previous history.                |
| Disaster recovery onto a replacement host                             | Yes                                     | Existing browsers may retain history from the lost server.                    |
| Code deployment                                                       | No                                      | This project does not use epoch rotation as deployment fencing.               |
| Container restart                                                     | No                                      | No logical data replacement occurred.                                         |
| PostgreSQL major-version upgrade performed by `scripts/upgrade-db.sh` | No                                      | It preserves current logical state while replacing physical database storage. |

## Database epoch signal

### External authoritative marker

Store the desired database epoch in a host-persistent control file outside the PostgreSQL data directory, for example:

```text
/d1/aegis/control/database-epoch
```

The restore CI job runs on the runner assigned to the target environment, changes to that host's `/opt/aegis` deployment directory, and writes a new cryptographically random UUID to the target host's `/d1/aegis/control/database-epoch` file after Compose is down and before Compose is started. The API container sees that host file at `/aegis-control/database-epoch` through its Compose bind mount. Normal deployments, restarts, and PostgreSQL upgrades leave the marker unchanged.

Ordinary CI test jobs do not run on a deployment target and do not use the host-persistent marker. Their generated test environment sets `DATABASE_EPOCH_FILE` to an ephemeral writable path under `/tmp`; this gives each isolated test database an epoch without implying that a deployment host exists.

The marker must be external because a value stored only in PostgreSQL rolls back with the dump and cannot distinguish restored data from the previously running database.

### Database state

Add a singleton operational-state table containing:

- `active_database_epoch`;
- `pending_database_epoch`, when preparation is in progress;
- `state`: `ready`, `preparing`, or `failed`;
- `reason`;
- creation and update timestamps; and
- optional pipeline and job identifiers for diagnostics.

Add a document-revision table containing:

- row ID;
- database epoch UUID;
- mission ID;
- per-mission monotonically increasing revision number;
- Automerge document URL;
- predecessor row ID, when applicable;
- lifecycle state: `preparing`, `active`, `retired`, or `failed`;
- creation, validation, activation, and retirement timestamps; and
- optional activation and retirement heads if they are inexpensive to capture reliably.

Use unique constraints on `(database_epoch, mission_id)`, `(mission_id, revision_number)`, and the Automerge document URL. The revision row is both the resumable preparation record and the minimum lineage record. Do not add checkpoint, archive, projection, or retention-policy tables in this project.

`doc_listing_db` remains the fast active pointer. It may reference the active revision row directly, or activation may enforce consistency in application code and the same SQL transaction.

## Startup orchestration

The restore cutover must finish before `src/server/express/server.ts` listens or constructs the networked Automerge repo.

Recommended order:

1. Apply pending MikroORM migrations, including the operational-state and document-revision tables.
2. Run the existing Automerge document migration against the restored URLs.
3. Validate and flush migrated documents.
4. Compare the externally desired database epoch with the active database epoch.
5. If they differ, perform the restore cutover.
6. Start the API, Socket.IO, and Automerge WebSocket server only after every phase succeeds.

Running pending schema migrations before rotation ensures the replacement starts from a validated current-schema value. Rotation remains independent from the Automerge schema-migration mechanism.

### Restore cutover algorithm

Run the following under a PostgreSQL advisory lock:

1. Read the desired database epoch from the external marker.
2. If it equals `active_database_epoch` and state is `ready`, exit without loading or changing documents.
3. Set `pending_database_epoch` and state `preparing`.
4. Read every active `doc_listing_db` row.
5. For each mission, find or create its deterministic preparation row using `(desired database epoch, mission ID)`.
6. Load the listed restored document and wait until ready.
7. Validate that `mission.id === doc_listing_db.mission_id`.
8. Convert the mission to a deeply detached plain value. Do not retain Automerge proxy objects.
9. Create a brand-new Automerge document from that value. It must receive a new document ID and a new change graph; it must not clone the original history or preserve the old ID.
10. Persist the replacement URL in its preparation row immediately so retries reuse it rather than creating another replacement.
11. Flush all replacement documents to `automerge_native_db`.
12. Reopen every replacement from storage and validate its mission ID and complete schema.
13. In one SQL transaction:
    - compare-and-swap every listing using its expected mission ID and old URL;
    - mark previous revision rows retired;
    - mark replacement rows active;
    - set `active_database_epoch` to the desired database epoch;
    - clear `pending_database_epoch`; and
    - set state `ready`.
14. Only after that transaction commits may the API start.

Activation is all-or-nothing across all listed missions. Any missing document, validation failure, unexpected listing URL, or row-count mismatch is fatal. Leave readiness false and do not start the API.

### Restart behavior

- A retry with the same desired database epoch reuses persisted preparation rows and replacement URLs.
- A crash before replacement creation resumes creation.
- A crash after flush but before activation reopens and validates the prepared replacement.
- A crash during activation relies on the SQL transaction to expose either all old listings or all new listings.
- A completed database epoch is a no-op on subsequent startups.

## Client cutover

### Consistent mission resolution

Provide a no-cache response that resolves these values together:

```text
{ missionId, automergeUrl, databaseEpoch }
```

Returning the listing and database epoch together prevents the client from combining an old listing with a newly activated epoch. `populateStore` must verify this response before setting the global mission handle or running audits.

Expose the active database epoch through:

- the no-cache runtime-status or mission-resolution endpoint;
- the Socket.IO `version` event; and
- `StatusFromServer` heartbeats.

The client records the database epoch and document URL accepted when it loads the mission.

### Mismatch behavior

On Socket.IO connect, reconnect, and heartbeat:

1. Compare the server database epoch with the accepted database epoch.
2. If they match, preserve normal behavior.
3. If they differ, enter a terminal `database-epoch-stale` state.
4. Close the mutation gate immediately.
5. Clear active editing and dragging state.
6. Show a blocking explanation that the database was restored and the page is switching to the restored version.
7. Perform a cache-busted full-page reload while preserving the mission URL and query parameters.
8. On reload, resolve the stable mission ID to the current database epoch and replacement URL before opening the Automerge document.

The first implementation should reload automatically, with a **Reload now** action and retry behavior if readiness is temporarily unavailable. The overlay must not be cancellable.

### Mutation gate

Enforce a shared gate centrally at:

- `withMissionChange`;
- `withMissionOp`; and
- every thunk or operation path that invokes `DocHandle.change()` directly.

The gate closes after an explicit database epoch or active-document mismatch. It must not close merely because Socket.IO or the Automerge network disconnects. Unexpected disconnection continues to support normal offline editing; those changes synchronize when the server returns with the same database epoch and active document URL.

Client gating improves user behavior but is not the restore-integrity boundary. A stale or disconnected client may continue changing its old in-memory document before learning about the restore. The replacement ID ensures those changes cannot merge into the active restored document.

### Existing URLs containing document IDs

Routes such as `/admin/mission/:id/:automergeUrl` must resolve the current listing by mission ID before opening a document. If the embedded URL differs, redirect or replace the route with the current URL. Prefer removing document IDs from public routes in later cleanup.

## Client audits

`src/store/processing/audits.ts` runs after `populateStore` resolves a mission document. Once activation changes `doc_listing_db`, a reloaded client naturally targets the replacement.

Do not run audits until the database epoch and document URL have been verified and the replacement handle is ready. Include the database epoch and document URL in audit logs so legitimate post-restore repairs can be distinguished operationally from stale-client activity.

## CI/CD changes

Update `.gitlab/includes/db-import.yml` so the authoritative restore/import path:

1. stops Compose;
2. restores the selected database dump;
3. generates a cryptographically random database epoch UUID;
4. writes the UUID atomically to the host-persistent marker;
5. starts Compose;
6. waits for a health endpoint reporting migration completion, state `ready`, and the expected active database epoch; and
7. fails if the prior database epoch remains active or cutover is incomplete.

The precise order of dump installation and marker writing may follow deployment constraints, but both must happen while the application is down and the marker must be durable before startup.

Normal deploy jobs and `scripts/upgrade-db.sh` preserve the marker. They never generate a value merely because containers or the PostgreSQL directory were recreated.

## Security boundary

Removing an old URL from `doc_listing_db` does not prove that the installed Automerge Repo network layer rejects synchronization to the retired document. The first implementation therefore guarantees:

- stale changes cannot reach the replacement document because it has a different ID; and
- normal application routing no longer returns the old URL.

It does not claim that the retired stored document is immutable. Dynamic active-document authorization, retired-document isolation, and administrative history access are follow-on work. Retired data must not be deleted as a substitute for fixing synchronization authorization.

## Test plan

### Unit tests

- Equal desired and active database epochs are a no-op.
- A changed database epoch selects restore cutover.
- Normal deployments and PostgreSQL upgrades do not change the marker or rotate URLs.
- Preparation records make replacement creation deterministic across retries.
- Materialization produces a detached plain value.
- Replacement documents receive different IDs while preserving mission IDs and values.
- Reopened replacement documents pass schema validation.
- Listing activation uses expected-old-URL compare-and-swap semantics.
- Any activation row-count mismatch fails the cutover.
- Automerge schema-migration behavior is unchanged by rotation.
- Mutation helpers reject writes after a database epoch or document mismatch.
- Mutation helpers continue accepting writes during an ordinary unexpected disconnection.
- Mission resolution does not install a handle or run audits until database epoch and URL are verified.

### Integration tests

1. Start with database epoch A and mission document X.
2. Open a browser and retain X.
3. Back up the database.
4. Change X so the browser contains history later than the backup.
5. Restore the backup and request database epoch B.
6. Verify startup creates document Y and switches the listing while preserving mission ID and materialized restored value.
7. Let the old browser reconnect and attempt to synchronize X.
8. Verify X cannot alter Y.
9. Verify the browser blocks new mutations after detecting database epoch B and reloads onto Y.
10. Verify audits run only after Y and database epoch B are verified.

Also test:

- crash before replacement creation;
- crash after flush but before activation;
- failure during the activation transaction;
- invalid or missing restored documents;
- stale admin URLs;
- multiple missions activating atomically;
- multiple startup processes competing under the advisory lock;
- startup never advertising readiness while state is `preparing` or `failed`;
- an ordinary outage returning with the same database epoch and URL preserving offline edits; and
- a client disconnected throughout the restore being unable to merge old changes into the replacement.

### CI assertions

- Running startup twice without changing the database epoch is byte-for-byte stable.
- Changing the database epoch once creates exactly one replacement per mission.
- Retrying that database epoch creates no additional documents.
- Every active listing URL differs from its pre-cutover value.
- Mission IDs and validated materialized mission values are preserved.
- Rotation does not alter the existing Automerge schema-migration mechanism.

## Operational observability

Log and expose:

- desired, active, and pending database epoch;
- cutover state and reason;
- mission ID, expected old URL, and prepared new URL;
- preparation reuse on retries;
- document flush and validation outcomes;
- listing compare-and-swap counts;
- activation outcome;
- browser database epoch mismatches; and
- audit activity with database epoch and document URL.

Readiness must fail while the epoch state is `preparing` or `failed`, or when the active database epoch differs from the external marker.

## Open implementation questions

- Confirm `/d1/aegis/control` is included in host backup and disaster-recovery procedures while remaining outside database-directory deletion.
- Does `Repo.create()` followed by initialization from a detached value provide the intended single new initial change with the installed Automerge Repo version?
- What is the most reliable way to reopen and validate a newly flushed document using an independent repository instance?
- Should `doc_listing_db` reference the active document-revision row directly?
- Can mission resolution and the runtime database epoch be returned from one existing endpoint without disrupting current clients?
- Where are all direct client `DocHandle.change()` entry points that must honor the mutation gate?

## Acceptance criteria

- Restoring a dump cannot be undone by reconnecting browser history.
- Restore and import CI explicitly select a new database epoch.
- Ordinary deployments, restarts, and PostgreSQL upgrades retain the existing database epoch and document IDs.
- API startup is blocked until migration, replacement creation, validation, and atomic listing activation complete.
- A retry does not create duplicate replacement documents.
- Mission IDs remain stable while active document URLs change.
- A stale browser cannot mutate the replacement document.
- A detected mismatch blocks further client mutations and automatically reloads through the stable mission ID.
- Ordinary unexpected disconnection still permits offline editing when the database epoch and document URL remain unchanged.
- Audits run only against a verified active database epoch and document.
