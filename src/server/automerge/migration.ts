import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import { isValidAutomergeUrl, Repo } from "@automerge/automerge-repo/slim";
import type { DocHandle, StorageAdapterInterface } from "@automerge/automerge-repo/slim";
import { PostgresStorageAdapter } from "server/automerge/automerge-storage-adapter-postgres";
import { AUTOMERGE_MIGRATIONS, getPendingAutomergeMigrations } from "server/automerge/migrations";
import pg from "pg";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { legacyAutomergeSchemas } from "server/database/models/_legacyModels";
import { allSchemas } from "server/database/models/_allModels";

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
    globalValues.orm = await MikroORM.init({
      ...config,
      entities: [...allSchemas, ...legacyAutomergeSchemas],
      entitiesTs: [...allSchemas, ...legacyAutomergeSchemas],
    });
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

    // Each registered migration operates on one mission. Apply pending versions in order,
    // persist and release that mission before opening the next. Historical datasets must
    // not require enough RAM to hold every document during deployment.
    for (const [index, docListing] of allDocListings.entries()) {
      if (!isValidAutomergeUrl(docListing.automergeUrl)) throw new Error("Invalid Automerge URL");
      const started = Date.now();
      const handle: DocHandle<Mission> = await automergeRepo.find(docListing.automergeUrl);
      for (const migration of pendingMigrations) {
        await migration.migrate(handle, { docListing, orm: globalValues.orm });
      }
      const mission = handle.doc();
      if (!missionValidator(structuredClone(mission))) {
        throw new Error(
          `${mission.id} - ${mission.name} is invalid: ${JSON.stringify(missionValidator.errors)}`
        );
      }
      await automergeRepo.flush([handle.documentId]);
      await automergeRepo.removeFromCache(handle.documentId);
      serverLogger.info({
        logId: "automerge-migration",
        logValue: `Migrated mission ${docListing.missionId} (${index + 1}/${allDocListings.length}) in ${Date.now() - started} ms`,
      });
    }

    await lockClient.query(
      `insert into "automerge_migration_db" ("version", "name")
       select "version", "name"
       from unnest($1::bigint[], $2::text[]) as completed("version", "name")`,
      [pendingMigrations.map(({ version }) => version), pendingMigrations.map(({ name }) => name)]
    );

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
