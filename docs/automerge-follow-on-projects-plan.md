# Automerge cutover follow-on projects

## Status

Deferred planning extracted from `automerge-database-restore-cutover-plan.md`.

The restore plan intentionally implements only authoritative database-restore integrity. This document preserves the related ideas as independent projects so they do not expand the restore implementation's critical path.

## Shared principle

The restore project establishes a reusable database-epoch and document-switch mechanism. Follow-on projects may build on that mechanism, but they require separate requirements, threat models, acceptance criteria, and rollout decisions.

Do not make completion of these projects a prerequisite for protecting a restored database with a replacement document ID.

## Project 2: Schema-changing deployment fencing

### Problem

The existing app-version redirect does not guarantee that old clients stop synchronizing before or after a breaking Automerge schema migration. Old code can restore removed fields, omit new invariants, or create a mixed-schema document after migration completes.

### Candidate design

Classify each Automerge schema migration as:

- `compatible`: old and new clients can safely read and write concurrently;
- `requires-client-reload`: document ID remains stable, but synchronization from incompatible clients is rejected until they reload; or
- `requires-epoch-rotation`: old-client writes could invalidate migrated state, so deployment creates a replacement document revision.

Default new migrations to `requires-epoch-rotation` unless compatibility is demonstrated by tests. Field deletion, field rename, representation changes, and new invariants generally require rotation.

Deployment automation would inspect pending migrations, determine the strongest requirement, run server-side migrations, rotate documents when required, and expose the target application version, migration watermark, and database epoch before clients can synchronize.

### Required investigation

- Determine whether the Automerge WebSocket handshake can enforce client version, migration watermark, and database epoch before accepting synchronization.
- Evaluate delaying browser Automerge adapter creation until control-plane verification.
- Define compatibility tests and ownership for migration classification.
- Decide whether `requires-client-reload` is safe; if synchronization cannot be fenced, use database epoch rotation instead.
- Ensure client audits remain repair logic rather than substitutes for server migrations.

### Acceptance direction

- An incompatible old client cannot write to a migrated active document.
- Compatible deployments retain the document ID and ordinary offline behavior.
- Breaking deployments rotate once and reload clients onto the replacement.
- Schema-migration state remains independent from document revision history.

## Project 3: Planned maintenance and write-drain protocol

### Problem

Document rotation protects the replacement from stale history but does not warn connected users before planned teardown. Users can make edits that appear successful yet are intentionally excluded from an authoritative restore or breaking deployment.

### Candidate protocol

Use a persisted transition record and lifecycle messages such as:

- `writeBarrierStarting`;
- `maintenanceReady`;
- `databaseEpochChanged`; and
- `serviceReady`.

`writeBarrierStarting` may include:

- transition ID and kind;
- current and pending database epoch;
- current and target application versions and Git commits;
- current and target migration watermarks;
- whether document IDs will rotate; and
- a user-facing explanation.

Connected clients would close the mutation gate, clear editing state, persist transition intent in browser storage, show a blocking overlay, and acknowledge the barrier. CI would allow a bounded synchronization period before teardown.

### Constraints

- An emergency restore must be allowed to proceed after a clearly logged acknowledgement timeout.
- The protocol improves user messaging and reduces discarded work; document rotation remains the final integrity boundary.
- A client disconnected before the announcement cannot be assumed to have stopped editing.
- Ordinary unplanned outages must continue to permit offline editing.
- Maintenance intent must survive process restart and prevent briefly advertising writable service.

### Acceptance direction

- Connected clients become read-only before planned teardown.
- Restore intent remains sticky through disconnect and reconnect.
- Acknowledgement and timeout behavior is observable.
- Ordinary network loss does not enter maintenance mode.

## Project 4: Retired-document authorization and immutable history

### Problem

Changing `doc_listing_db` removes an old document from normal routing but may not stop an old client from synchronizing changes to that retired document. This does not contaminate the replacement ID, but it prevents strong claims that retired history is immutable.

### Candidate approaches

- Authorize Automerge document requests dynamically against active listings.
- Issue short-lived database-epoch-scoped synchronization tokens.
- Maintain a retired-document denylist at the network boundary.
- Isolate retired document chunks in storage not mounted by the networked active repo.
- Provide a separate read-only administrative repository for historical access.

### Required investigation

- Confirm the installed Automerge Repo network adapter's share and authorization behavior with an integration test.
- Determine whether `sharePolicy` applies to inbound stale peers in the required way.
- Define behavior for a connected client when its document becomes retired.
- Decide whether late writes to a retired document are rejected, ignored, or captured separately for recovery.

### Acceptance direction

- Retired documents reject synchronization writes.
- Active clients cannot request arbitrary stale URLs.
- Historical data remains readable through an explicit administrative path.
- Access attempts are logged without deleting retained history.

## Project 5: Cross-revision historical browsing

### Problem

Document rotation creates separate Automerge change graphs. A future “show mission at time X” feature must select both the correct document revision and appropriate heads within that revision.

### Candidate metadata

Extend document revision records with:

- activation and retirement heads;
- application version and Git commit at each boundary;
- schema or migration watermark; and
- source backup metadata when useful.

Add checkpoints containing:

- revision row ID and mission ID;
- server-observed timestamp;
- complete Automerge heads;
- checkpoint kind such as activation, retirement, periodic, migration, or operator; and
- application, schema, and optional actor metadata.

### Historical lookup model

1. Select the revision whose activation interval contains the requested time.
2. Select the nearest applicable checkpoint.
3. Open that revision's document.
4. Query or fork it at the recorded heads.

Client change timestamps are not an authoritative wall-clock index. Checkpoint timestamps are server-observed navigation aids.

### Historical schema interpretation

Snapshots before a migration may not match the current `Mission` type. Historical views must be read-only and should either:

- interpret the snapshot using its recorded schema watermark;
- project it into the current read model without mutating archived data; or
- show a raw administrative representation when no projector exists.

### Acceptance direction

- Boundary heads reproduce the expected activation and retirement states.
- Lookup across a restore boundary selects the correct document.
- Old schemas never enter current editing components without projection.
- The UI accurately describes checkpoint fidelity rather than implying exact wall-clock reconstruction.

## Project 6: Progressive history compaction and retention

### Problem

Long-lived active Automerge documents may accumulate granular changes and increase storage, synchronization, loading, and historical-query costs. Rotation bounds the active graph but does not reduce total storage while all retired documents remain intact.

### Candidate compaction rotation

1. Select a quiet boundary or use the write-drain protocol.
2. Record final heads for the active revision.
3. Materialize and validate its current state.
4. Create a replacement document with that value as its initial state.
5. Record reason `history-compaction`.
6. Atomically switch the listing.
7. Reload clients through the database epoch handshake.

### Candidate retention tiers

- **Hot:** recent revisions and detailed checkpoints.
- **Warm:** less frequent immutable snapshots after the detailed recovery window.
- **Cold:** validated monthly materialized snapshots plus boundary metadata.

Before deleting detailed history, create and validate an archive containing:

- mission ID and covered revision range;
- effective time and observed time range;
- materialized value;
- source URLs and boundary heads;
- application version, Git commit, and schema watermark;
- checksum and archive format version; and
- retention-policy version.

Metadata must support many source revisions being represented by one archive. Restore-driven revisions should initially be exempt from destructive compaction until operational and forensic requirements are established.

### Required policy decisions

- Exact-history retention period.
- Daily and monthly snapshot cadence.
- Mission or event retention holds.
- Trigger thresholds based on age, size, or change count.
- Backup and restore treatment for archive objects.
- User-facing fidelity labels for exact, nearest-checkpoint, and monthly-snapshot results.

### Acceptance direction

- Compaction preserves current materialized state while starting a smaller active graph.
- Every deleted source revision has a validated, checksummed replacement archive.
- Archive lineage covers all source revisions and boundary heads.
- Historical results state their available fidelity accurately.

## Project 7: Disconnected-edit recovery and export

### Problem

An authoritative restore deliberately excludes changes newer than the selected backup. A disconnected browser may still contain valuable work against the retired document, but automatically merging it would violate restore semantics.

### Candidate capability

- Detect unsynchronized work associated with a stale database epoch.
- Keep the active replacement read-only with respect to that work.
- Offer an explicit export containing the source database epoch, document URL, heads, user, timestamps, and materialized or patch data.
- Provide an administrative review/import workflow that applies selected changes as new, auditable operations rather than merging histories automatically.

### Acceptance direction

- Recovery never mutates the active document revision without explicit review.
- Export identifies its stale source database epoch and cannot be mistaken for current data.
- Applying recovered work creates auditable changes against the current document.

## Suggested sequencing

After the restore-integrity project:

1. **Retired-document authorization** if immutable history is an immediate security or audit requirement.
2. **Schema-deployment fencing** before the next breaking Automerge migration.
3. **Planned maintenance drain** to reduce discarded user work and improve operational messaging.
4. **Disconnected-edit recovery** if product requirements demand preservation of excluded edits.
5. **Historical browsing** when a concrete user workflow and schema-projection requirement exist.
6. **Compaction and retention** only after measured document-growth data and retention policy are available.

Each project should receive its own implementation plan before work begins.
