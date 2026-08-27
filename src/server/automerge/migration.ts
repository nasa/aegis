import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import { isValidAutomergeUrl, Repo } from "@automerge/automerge-repo/slim";
import type { DocHandle, StorageAdapterInterface } from "@automerge/automerge-repo/slim";
import { PostgresStorageAdapter } from "server/automerge/automerge-repo-storage-postgres";
import { AUTOMERGE_MIGRATIONS, getPendingAutomergeMigrations } from "server/automerge/migrations";
import pg from "pg";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";

import { getAutomergeDocListing } from "server/express/routes/docListing";
import { missionValidator } from "utils/validateSchemaServer";
import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
import { initializeBase64Wasm } from "@automerge/automerge/slim";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";

const AUTOMERGE_MIGRATION_LOCK_ID = 1_753_746_473;

// Connect to automerge database that stores all the docs
const dbPool: pg.Pool = new pg.Pool({
  user: "postgres",
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: 5432,
});
let automergeRepo: Repo;

const runMigration = async () => {
  const lockClient = await dbPool.connect();
  let lockAcquired = false;
  try {
    await lockClient.query("select pg_advisory_lock($1)", [AUTOMERGE_MIGRATION_LOCK_ID]);
    lockAcquired = true;

    const completedResult = await lockClient.query<{
      version: string;
      name: string;
    }>(
      'select "version"::text as "version", "name" from "automerge_migration_db" order by "version"'
    );
    const pendingMigrations = getPendingAutomergeMigrations(
      AUTOMERGE_MIGRATIONS,
      completedResult.rows.map(({ version, name }) => ({ version: Number(version), name }))
    );
    if (pendingMigrations.length === 0) {
      serverLogger.info({
        logId: "automerge-migration",
        logValue: "No pending automerge migrations. Exiting without loading documents.",
      });
      return;
    }

    serverLogger.info({
      logId: "automerge-migration",
      logValue: `Pending automerge migrations: ${pendingMigrations
        .map(({ version, name }) => `${version}-${name}`)
        .join(", ")}`,
    });

    // This is only required on the server since esbuild does not initialize the WASM module.
    // Keep it after the pending check so the normal no-op startup path remains inexpensive.
    initializeBase64Wasm(automergeWasmBase64);
    globalValues.orm = await MikroORM.init(config);
    const storageAdapter: StorageAdapterInterface = new PostgresStorageAdapter(
      "automerge_native_db",
      dbPool
    );
    automergeRepo = new Repo({ storage: storageAdapter });

    serverLogger.info({
      logId: "automerge-migration",
      logValue: "Starting automerge migration script...",
    });
    const allDocListings: AutomergeDocListing[] = await getAutomergeDocListing();

    // Validate doc-listing URLs up front so we can fail fast before doing any expensive
    // Automerge loads. Invalid URLs are a hard error.
    for (const docListing of allDocListings) {
      if (!isValidAutomergeUrl(docListing.automergeUrl)) {
        const errorMessage = `Invalid automerge URL in doc listing. MissionId: ${docListing.missionId} AutomergeUrl: ${docListing.automergeUrl}`;
        serverLogger.error(
          { logId: "automerge-migration", logValue: errorMessage },
          new Error(errorMessage)
        );
        throw new Error(errorMessage);
      }
    }

    // Load every Automerge doc handle in parallel up front.
    //
    // (Note: the `(node:NNNN) TimeoutNegativeWarning: -NNN is a negative number.` warning
    // sometimes printed around this point comes from `@automerge/automerge-repo`'s
    // `DocSynchronizer` (and `Repo`) `throttle` helper. The throttle records
    // `lastCall = Date.now()` at *construction* time but only updates it after the timer
    // fires; if the gap between construction and the first invocation exceeds the throttle
    // delay (100 ms for the save throttle, 30 ms for the sync throttle), `wait` becomes
    // negative on the first call. Node clamps the delay to 1 ms and the save/sync still
    // happens — it is harmless and is NOT the cause of any perceived hang. The magnitude
    // of the negative number simply reflects how long it took to get from "Repo registered
    // the handle" to "the first change event fired on it" (≈ doc load time).)
    serverLogger.debug({
      logId: "automerge-migration",
      logValue: `Loading ${allDocListings.length} automerge document(s) in parallel...`,
    });
    const loadStartMs = Date.now();
    let loadedCount = 0;
    const allDocHandles: DocHandle<Mission>[] = await Promise.all(
      allDocListings.map(async (docListing) => {
        // Type guard inline so TS narrows automergeUrl to AnyDocumentId for find().
        // The up-front validation loop above guarantees this never throws in practice.
        if (!isValidAutomergeUrl(docListing.automergeUrl)) {
          throw new Error(
            `Invalid automerge URL slipped past pre-validation. MissionId: ${docListing.missionId}`
          );
        }
        const handle: DocHandle<Mission> = await automergeRepo.find(docListing.automergeUrl);
        await handle.whenReady();
        loadedCount += 1;
        // Log progress every 10 docs so the user can see forward progress on large DBs.
        if (loadedCount % 10 === 0 || loadedCount === allDocListings.length) {
          serverLogger.debug({
            logId: "automerge-migration",
            logValue: `  loaded ${loadedCount}/${allDocListings.length} doc(s)`,
          });
        }
        return handle;
      })
    );
    serverLogger.debug({
      logId: "automerge-migration",
      logValue: `Loaded ${allDocHandles.length} doc handle(s) in ${Date.now() - loadStartMs} ms`,
    });

    serverLogger.debug({ logId: "automerge-migration", logValue: "Starting migrations..." });
    for (const migration of pendingMigrations) {
      serverLogger.debug({
        logId: "automerge-migration",
        logValue: `Running automerge migration ${migration.version}-${migration.name}`,
      });
      for (let index = 0; index < allDocHandles.length; index += 1) {
        await migration.migrate(allDocHandles[index], {
          docListing: allDocListings[index],
          orm: globalValues.orm,
        });
      }
    }
    serverLogger.debug({ logId: "automerge-migration", logValue: "Migrations complete." });

    // Migrations are done.
    // Validate schema against all automerge docs
    serverLogger.debug({ logId: "automerge-migration", logValue: "Running validator" });
    for (const docHandle of allDocHandles) {
      const mission = docHandle.doc();
      // Use structuredClone instead of cloneDeep so we don't need an extra dependency
      // when this file is built
      const isValid = missionValidator(structuredClone(mission));
      if (!isValid && missionValidator.errors?.length > 0) {
        serverLogger.error(
          { logId: "automerge-migration", logValue: JSON.stringify(missionValidator.errors) },
          new Error(`${mission.id} - ${mission.name} is invalid`)
        );
        throw new Error(`${mission.id} - ${mission.name} is invalid`);
      } else {
        serverLogger.debug({
          logId: "automerge-migration",
          logValue: `${mission.id} - ${mission.name} is valid`,
        });
      }
    }
    serverLogger.debug({ logId: "automerge-migration", logValue: "Validation complete." });
    // Flush all Automerge documents to the storage adapter before proceeding.
    // After docHandle.change(), the Repo schedules saves via a debounced/throttled timer
    // (saveDebounceRate) rather than writing synchronously. Calling process.exit() before
    // that timer fires would lose the changes. automergeRepo.flush() bypasses the debounce
    // and directly awaits storageSubsystem.saveDoc() for every cached document handle,
    // guaranteeing all changes are persisted to Postgres before we continue.
    // Note: flush() is marked @experimental in automerge-repo but is the correct mechanism
    // and is also used internally by Repo.shutdown().
    await automergeRepo.flush();

    serverLogger.info({
      logId: "automerge-migration",
      logValue: "All processes complete. Exiting.",
    });
  } finally {
    if (automergeRepo) await automergeRepo.shutdown();
    if (globalValues.orm) await globalValues.orm.close(true);
    if (lockAcquired) {
      await lockClient.query("select pg_advisory_unlock($1)", [AUTOMERGE_MIGRATION_LOCK_ID]);
    }
    lockClient.release();
  }
};

runMigration()
  .then(async () => {
    await dbPool.end();
  })
  .catch(async (err: unknown) => {
    serverLogger.error(
      { logId: "automerge-migration", logValue: "Unhandled error in migration" },
      err instanceof Error ? err : new Error(String(err))
    );
    process.exitCode = 1;
    await dbPool.end();
  });
