/**
 * Authoritative database restore cutover script.
 *
 * This script is run as a one-shot CI job after an authoritative PostgreSQL
 * restore (e.g. from a production backup or a staging refresh) to ensure
 * that the Automerge document storage is consistent with the restored DB
 * and that the server can start cleanly.
 *
 * The high-level flow is:
 *
 *  1. Acquire a PostgreSQL advisory lock so concurrent runs are serialised.
 *  2. Read the desired epoch from the marker file (DATABASE_EPOCH_FILE).
 *  3. Lock all `doc_listing_db` rows for update.
 *  4. Branch on the existing `automerge_operational_state_db` row:
 *     - **No row + fresh epoch file**: first-time registration — insert the
 *       operational state and one revision record per mission and return.
 *     - **Epoch already active**: nothing to do, return early.
 *     - **Different active epoch**: perform a full cutover (steps 5–9).
 *  5. Mark the operational state as `preparing` with the pending epoch.
 *  6. For each mission, clone the existing Automerge document into a new
 *     document (same data, new URL), validate the clone, and record it in
 *     `automerge_document_revision_db` with state `preparing`.
 *  7. Open a second, independent Repo to read back every prepared document
 *     and re-validate before committing.
 *  8. In a single transaction, atomically swap the `doc_listing_db` URLs,
 *     retire old revisions, promote new revisions to `active`, and flip
 *     the operational state to `ready` with the new epoch.
 *  9. On any error, update the operational state to `failed` so the API
 *     server refuses to start.
 *
 * The advisory lock (AUTOMERGE_CUTOVER_LOCK_ID) is released in the
 * `finally` block regardless of outcome.
 */

import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });

import { initializeBase64Wasm } from "@automerge/automerge/slim";
import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
import { isValidAutomergeUrl, Repo } from "@automerge/automerge-repo/slim";
import type {
  AutomergeUrl,
  DocHandle,
  StorageAdapterInterface,
} from "@automerge/automerge-repo/slim";
import pg from "pg";
import { PostgresStorageAdapter } from "server/automerge/automerge-repo-storage-postgres";
import {
  AUTOMERGE_CUTOVER_LOCK_ID,
  getDatabaseEpochState,
  readDesiredDatabaseEpochInfo,
} from "server/automerge/databaseEpoch";
import { missionValidator } from "utils/validateSchemaServer";
import { serverLogger } from "utils/logging/serverLogger";

type Listing = { mission_id: number; automerge_url: string };
type Preparation = { id: string; mission_id: number; automerge_url: string };

initializeBase64Wasm(automergeWasmBase64);

const pool = new pg.Pool({
  user: "postgres",
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: 5432,
});

const validateMission = (mission: Mission, missionId: number, url: string): void => {
  if (mission.id !== missionId) {
    throw new Error(
      `Mission ID mismatch for ${url}: expected ${missionId}, received ${mission.id}`
    );
  }
  if (!missionValidator(structuredClone(mission))) {
    throw new Error(
      `Invalid replacement mission ${missionId}: ${JSON.stringify(missionValidator.errors)}`
    );
  }
};

/**
 * Registers the initial database epoch and baseline revisions.
 *
 * Called only when no `automerge_operational_state_db` row exists yet
 * (i.e. this is the first `restoreCutover` run for a freshly provisioned
 * database).  No documents are cloned — the existing URLs from
 * `doc_listing_db` are recorded directly as revision 1.
 */
const initializeEpoch = async (
  client: pg.PoolClient,
  desiredDatabaseEpoch: string,
  listings: Listing[]
): Promise<void> => {
  await client.query("begin");
  try {
    await client.query(
      `insert into "automerge_operational_state_db"
      ("id", "active_database_epoch", "state", "reason", "pipeline_id", "job_id")
      values (1, $1, 'ready', 'initial epoch registration', $2, $3)`,
      [desiredDatabaseEpoch, process.env.CI_PIPELINE_ID || null, process.env.CI_JOB_ID || null]
    );
    for (const listing of listings) {
      await client.query(
        `insert into "automerge_document_revision_db"
         ("database_epoch", "mission_id", "revision_number", "automerge_url", "state", "validated_at", "activated_at")
         values ($1, $2, 1, $3, 'active', now(), now())`,
        [desiredDatabaseEpoch, listing.mission_id, listing.automerge_url]
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
};

const runRestoreCutover = async (): Promise<void> => {
  const client = await pool.connect();
  let repo: Repo | null = null;
  try {
    // Serialise concurrent runs (e.g. if multiple CI jobs trigger at once).
    await client.query("select pg_advisory_lock($1)", [AUTOMERGE_CUTOVER_LOCK_ID]);
    const epochMarker = await readDesiredDatabaseEpochInfo();
    const desiredDatabaseEpoch = epochMarker.epoch;
    // Lock all listing rows for the duration of the transaction so that the
    // API server cannot start and read a URL that is mid-swap.
    const listingsResult = await client.query<Listing>(
      'select "mission_id", "automerge_url" from "doc_listing_db" order by "mission_id" for update'
    );
    const listings = listingsResult.rows;
    const existingState = await getDatabaseEpochState(client);

    if (!existingState && epochMarker.created) {
      // First run on this DB — just register the baseline and exit.
      await initializeEpoch(client, desiredDatabaseEpoch, listings);
      serverLogger.info({
        logId: "automerge-cutover",
        logValue: `Registered initial database epoch ${desiredDatabaseEpoch}`,
      });
      return;
    }
    if (
      existingState.activeDatabaseEpoch === desiredDatabaseEpoch &&
      existingState.state === "ready"
    ) {
      serverLogger.info({
        logId: "automerge-cutover",
        logValue: `Database epoch ${desiredDatabaseEpoch} is already active; no documents loaded`,
      });
      return;
    }

    await client.query(
      `update "automerge_operational_state_db"
      set "pending_database_epoch" = $1, "state" = 'preparing', "reason" = 'authoritative restore cutover',
           "pipeline_id" = $2, "job_id" = $3, "updated_at" = now()
       where "id" = 1`,
      [desiredDatabaseEpoch, process.env.CI_PIPELINE_ID || null, process.env.CI_JOB_ID || null]
    );

    const storage: StorageAdapterInterface = new PostgresStorageAdapter(
      "automerge_native_db",
      pool
    );
    repo = new Repo({ storage });
    const preparations: Preparation[] = [];

    for (const listing of listings) {
      if (!isValidAutomergeUrl(listing.automerge_url)) {
        throw new Error(`Invalid Automerge URL for mission ${listing.mission_id}`);
      }
      const existingPreparation = await client.query<Preparation>(
        `select "id"::text, "mission_id", "automerge_url"
         from "automerge_document_revision_db"
         where "database_epoch" = $1 and "mission_id" = $2`,
        [desiredDatabaseEpoch, listing.mission_id]
      );
      if (existingPreparation.rows[0]) {
        preparations.push(existingPreparation.rows[0]);
        continue;
      }

      // Clone the source document into a brand-new Automerge document so
      // it gets a fresh URL that is unambiguously tied to this epoch.
      const sourceHandle = await repo.find<Mission>(listing.automerge_url);
      await sourceHandle.whenReady();
      const detachedMission = structuredClone(sourceHandle.doc());
      validateMission(detachedMission, listing.mission_id, listing.automerge_url);
      const replacementHandle = repo.create<Mission>(detachedMission);
      await replacementHandle.whenReady();
      // Flush immediately so the document is durable before we record its URL.
      await repo.flush([replacementHandle.documentId]);
      const prepared = await client.query<Preparation>(
        `insert into "automerge_document_revision_db"
          ("database_epoch", "mission_id", "revision_number", "automerge_url", "predecessor_id", "state")
          select $1, $2, coalesce(max("revision_number"), 0) + 1, $3,
                max("id") filter (where "state" = 'active'), 'preparing'
          from "automerge_document_revision_db" where "mission_id" = $2
         returning "id"::text, "mission_id", "automerge_url"`,
        [desiredDatabaseEpoch, listing.mission_id, replacementHandle.url]
      );
      preparations.push(prepared.rows[0]);
      serverLogger.info({
        logId: "automerge-cutover",
        logValue: `Prepared mission ${listing.mission_id}: ${listing.automerge_url} -> ${replacementHandle.url}`,
      });
    }

    // Flush and close the preparation repo before opening the validation repo,
    // ensuring all writes are fully durable in PostgreSQL.
    await repo.flush();
    await repo.shutdown();
    repo = null;

    // Open a second independent Repo to read back every prepared document and
    // validate it before committing the atomic swap.  This catches any
    // storage-layer corruption introduced during preparation.
    const validationRepo = new Repo({
      storage: new PostgresStorageAdapter("automerge_native_db", pool),
    });
    try {
      for (const preparation of preparations) {
        if (!isValidAutomergeUrl(preparation.automerge_url)) {
          throw new Error(`Invalid prepared Automerge URL for mission ${preparation.mission_id}`);
        }
        const handle: DocHandle<Mission> = await validationRepo.find(
          preparation.automerge_url as AutomergeUrl
        );
        await handle.whenReady();
        validateMission(handle.doc(), preparation.mission_id, preparation.automerge_url);
        await client.query(
          'update "automerge_document_revision_db" set "validated_at" = now() where "id" = $1',
          [preparation.id]
        );
      }
    } finally {
      await validationRepo.shutdown();
    }

    await client.query("begin");
    try {
      let switched = 0;
      for (const listing of listings) {
        const preparation = preparations.find(
          ({ mission_id }) => mission_id === listing.mission_id
        );
        // Compare-and-swap: only update the row if the URL still matches what
        // we read at the start, guarding against concurrent mutations.
        const result = await client.query(
          `update "doc_listing_db" set "automerge_url" = $1, "version" = "version" + 1
           where "mission_id" = $2 and "automerge_url" = $3`,
          [preparation.automerge_url, listing.mission_id, listing.automerge_url]
        );
        switched += result.rowCount || 0;
      }
      if (switched !== listings.length) {
        throw new Error(`Cutover compare-and-swap updated ${switched}/${listings.length} listings`);
      }
      await client.query(
        `update "automerge_document_revision_db" set "state" = 'retired', "retired_at" = now()
         where "state" = 'active' and "database_epoch" <> $1`,
        [desiredDatabaseEpoch]
      );
      await client.query(
        `update "automerge_document_revision_db" set "state" = 'active', "activated_at" = now()
         where "database_epoch" = $1 and "state" = 'preparing'`,
        [desiredDatabaseEpoch]
      );
      await client.query(
        `update "automerge_operational_state_db"
         set "active_database_epoch" = $1, "pending_database_epoch" = null, "state" = 'ready',
             "reason" = 'authoritative restore cutover complete', "updated_at" = now()
         where "id" = 1`,
        [desiredDatabaseEpoch]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    serverLogger.info({
      logId: "automerge-cutover",
      logValue: `Activated database epoch ${desiredDatabaseEpoch} for ${listings.length} mission(s)`,
    });
  } catch (error) {
    await client
      .query(
        `update "automerge_operational_state_db" set "state" = 'failed', "reason" = $1, "updated_at" = now()
         where "id" = 1`,
        [error instanceof Error ? error.message : String(error)]
      )
      .catch((): undefined => undefined);
    throw error;
  } finally {
    if (repo) await repo.shutdown();
    await client.query("select pg_advisory_unlock($1)", [AUTOMERGE_CUTOVER_LOCK_ID]);
    client.release();
  }
};

runRestoreCutover()
  .then(() => pool.end())
  .catch(async (error: unknown) => {
    serverLogger.error(
      { logId: "automerge-cutover", logValue: "Authoritative restore cutover failed" },
      error instanceof Error ? error : new Error(String(error))
    );
    process.exitCode = 1;
    await pool.end();
  });
