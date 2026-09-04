/**
 * Server-side database epoch utilities.
 *
 * The "database epoch" is a UUID that uniquely identifies the current
 * generation of Automerge documents stored in PostgreSQL.  Every time an
 * authoritative database restore is performed the epoch advances, ensuring
 * that:
 *
 *  - The API server refuses to start against a DB whose epoch differs from
 *    the one recorded in the local epoch marker file.
 *  - Connected clients detect the mismatch via Socket.io heartbeats and
 *    reload automatically before any writes can land on stale documents.
 *
 * The epoch marker file (path controlled by DATABASE_EPOCH_FILE) is written
 * once per fresh deployment or restore operation. Production containers use
 * the host-persistent `/aegis-control/database-epoch` mount; native development
 * and CI use writable environment-specific paths. The `restoreCutover` script reads this file to
 * determine the desired epoch and then performs an atomic swap of all
 * mission Automerge documents in `automerge_operational_state_db`.
 */

import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";
import { v4 as uuidv4, validate as isUuid } from "uuid";

/** Advisory lock ID used by `restoreCutover` to prevent concurrent runs. */
export const AUTOMERGE_CUTOVER_LOCK_ID = 1_753_746_474;

/** Shape of the single `automerge_operational_state_db` row (id = 1). */
export type DatabaseEpochState = {
  activeDatabaseEpoch: string;
  pendingDatabaseEpoch: string | null;
  state: "ready" | "preparing" | "failed";
  reason: string | null;
};

/** Path to the epoch marker file. Overridable via DATABASE_EPOCH_FILE env var. */
export const getDatabaseEpochFile = (): string =>
  process.env.DATABASE_EPOCH_FILE || "/aegis-control/database-epoch";

/**
 * Reads the desired database epoch from the marker file.
 *
 * If the file does not exist (first run on a fresh volume), a new UUID is
 * generated, written atomically via a `.pid.tmp` rename, and returned with
 * `created: true`.  The API server startup and `restoreCutover` both call
 * this so the file is always present before any DB state check.
 *
 * Throws if the file contains a value that is not a valid UUID.
 */
export const readDesiredDatabaseEpochInfo = async (): Promise<{
  epoch: string;
  created: boolean;
}> => {
  const markerPath = getDatabaseEpochFile();
  let value: string;
  let created = false;
  try {
    value = (await readFile(markerPath, "utf8")).trim();
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") throw error;
    value = uuidv4();
    created = true;
    await mkdir(path.dirname(markerPath), { recursive: true });
    const temporaryPath = `${markerPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${value}\n`, { flag: "wx" });
    await rename(temporaryPath, markerPath);
  }
  if (!isUuid(value)) {
    throw new Error(`Invalid database epoch marker at ${markerPath}`);
  }
  return { epoch: value, created };
};

/** Convenience wrapper — returns just the epoch string from the marker file. */
export const readDesiredDatabaseEpoch = async (): Promise<string> =>
  (await readDesiredDatabaseEpochInfo()).epoch;

/**
 * Converts a raw `automerge_operational_state_db` row into a typed
 * `DatabaseEpochState`, or returns `null` if the row is missing or has no
 * active epoch.  Used by `restoreCutover` which queries via a raw pg client
 * rather than MikroORM.
 */
export const parseDatabaseEpochState = (
  row:
    | {
        active_database_epoch: string | null;
        pending_database_epoch: string | null;
        state: DatabaseEpochState["state"];
        reason: string | null;
      }
    | undefined
): DatabaseEpochState | null => {
  if (!row?.active_database_epoch) return null;
  return {
    activeDatabaseEpoch: row.active_database_epoch,
    pendingDatabaseEpoch: row.pending_database_epoch,
    state: row.state,
    reason: row.reason,
  };
};

/**
 * Fetches the current epoch state directly from the database using a raw
 * `pg` pool or client.  Returns `null` when no row exists yet (before the
 * first `restoreCutover` run).
 */
export const getDatabaseEpochState = async (
  queryable: Pick<pg.Pool, "query"> | Pick<pg.PoolClient, "query">
): Promise<DatabaseEpochState | null> => {
  const result = await queryable.query<{
    active_database_epoch: string | null;
    pending_database_epoch: string | null;
    state: DatabaseEpochState["state"];
    reason: string | null;
  }>(
    'select "active_database_epoch", "pending_database_epoch", "state", "reason" from "automerge_operational_state_db" where "id" = 1'
  );
  return parseDatabaseEpochState(result.rows[0]);
};
