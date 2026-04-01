import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import { isValidAutomergeUrl, Repo } from "@automerge/automerge-repo/slim";
import type { DocHandle, StorageAdapterInterface } from "@automerge/automerge-repo/slim";
import { PostgresStorageAdapter } from "server/automerge/automerge-repo-storage-postgres";
import pg from "pg";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";

import { getAutomergeDocListing } from "server/express/routes/docListing";
import { missionValidator } from "utils/validateSchemaServer";
import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
import { initializeBase64Wasm } from "@automerge/automerge/slim";
import { getBackupDbMissions, upsertBackupDbMissions } from "server/express/routes/mission";
import { Doc_Listing_db } from "server/database/models/_allModels";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";

// This is only required on the server since we are using esbuild. On the client, vite handles the wasm loading
initializeBase64Wasm(automergeWasmBase64);

// Connect to automerge database that stores all the docs
const dbPool: pg.Pool = new pg.Pool({
  user: "postgres",
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: 5432,
});
const storageAdapter: StorageAdapterInterface = new PostgresStorageAdapter(
  "automerge_native_db",
  dbPool
);
const automergeRepo = new Repo({ storage: storageAdapter });

const getORM = async () => {
  globalValues.orm = await MikroORM.init(config);
};

// DB must be ready first
getORM().then(async () => {
  serverLogger.info({
    logId: "automerge-migration",
    logValue: "Starting automerge migration script...",
  });
  const allMissions: Mission[] = await getBackupDbMissions();
  let allDocListings: AutomergeDocListing[] = await getAutomergeDocListing();
  const allDocHandles: DocHandle<Mission>[] = [];

  // Initial conversion from DB records to automerge records
  // This only needs to be run once per environment and //TODO should be removed in a subsequent MR
  // Loop through every mission and see if we already have an automerge doc listing for it
  const docListingsToAdd: AutomergeDocListing[] = [];
  serverLogger.info({
    logId: "automerge-migration",
    logValue: "Checking for missions with no automerge document...",
  });
  for (const mission of allMissions) {
    const hasListing = allDocListings.map((d) => d.missionId).includes(mission.id);
    if (!hasListing) {
      const missionDocHandle = automergeRepo.create<Mission>(mission);
      const newDocListing: AutomergeDocListing = {
        missionId: mission.id,
        automergeUrl: missionDocHandle.url,
      };
      docListingsToAdd.push(newDocListing);
      serverLogger.info({
        logId: "automerge-migration",
        logValue: `New automerge doc created for: ${mission.id} - ${mission.name}`,
      });
    }
  }
  if (docListingsToAdd.length > 0) {
    try {
      // Must manually fork because this call is outside normal http request context (what we do in routes)
      const em = globalValues.orm.em.fork();
      // Add new automerge doc listings to the database
      for (const docListing of docListingsToAdd) {
        const dbRes = await em.upsert(Doc_Listing_db, docListing);
        em.persist(dbRes);
      }
      await em.flush();
      serverLogger.info({
        logId: "automerge-migration",
        logValue: `Added ${docListingsToAdd.length} new automerge doc listing(s) to the database`,
      });
      // re-query full list of doc listings after adding new ones
      allDocListings = await getAutomergeDocListing();
    } catch (e) {
      serverLogger.error(
        { logId: "automerge-migration", logValue: "Error adding new automerge doc listings" },
        e instanceof Error ? e : new Error(String(e))
      );
      process.exitCode = 1; // error
      process.exit();
    }
  } else {
    serverLogger.info({
      logId: "automerge-migration",
      logValue: "No new automerge documents created",
    });
  }
  serverLogger.info({ logId: "automerge-migration", logValue: "Check complete." });

  // Get docHandles for all the doc listings in the database so we can use them below on the migrations and validation
  serverLogger.info({
    logId: "automerge-migration",
    logValue: "Getting doc handles for all automerge documents...",
  });
  for (const docInfo of allDocListings) {
    if (!isValidAutomergeUrl(docInfo.automergeUrl)) return;
    // Get docHandle for each document/mission and add listeners
    const missionDocHandle: DocHandle<Mission> = await automergeRepo.find(docInfo.automergeUrl);
    // Wait till handler is ready in-case it has to get the doc for the first time
    await missionDocHandle.whenReady();
    allDocHandles.push(missionDocHandle);
  }
  serverLogger.info({
    logId: "automerge-migration",
    logValue: `Found ${allDocListings.length} automerge listing(s) and ${allDocHandles.length} doc handles`,
  });

  /**
   * MIGRATION FUNCTIONS - ADD NEW ONES HERE
   *  All functions should be able to be run multiple times without breaking anything.
   *  Essentially, if the migration has already occurred, it should be able to detect that and skip
   * @param docHandle
   */
  // EXAMPLE MIGRATION FUNCTION
  // const automergeMigration20250203 = async (docHandle: DocHandle<Mission>) => {
  //   // Migration Example. Make document changes via the docHandle.change function
  //   docHandle.change((doc: Mission) => {
  //     // change a field
  //     const newBannerMessage = "TEST BANNER FOR MIGRATION SCRIPT 123";
  //     if (doc.missionBanner !== newBannerMessage) doc.missionBanner = newBannerMessage;
  //     // remove the "description" property
  //     if ("description" in doc) delete doc.description;
  //     // add a new field with a default value
  //     if (!("newField" in doc)) doc["newField"] = "default value";
  //   });
  // };

  serverLogger.info({ logId: "automerge-migration", logValue: "Starting migrations..." });
  // Add migration functions to the list and run all the migrations on every doc
  // const migrationFunctions = [automergeMigration20250203];
  const migrationFunctions: ((docHandle: DocHandle<Mission>) => Promise<void>)[] = [];
  // Run all the migrations in the list above
  for (const func of migrationFunctions) {
    serverLogger.info({ logId: "automerge-migration", logValue: `Running migration ${func.name}` });
    for (const docHandle of allDocHandles) {
      await func(docHandle);
    }
  }
  serverLogger.info({ logId: "automerge-migration", logValue: "Migrations complete." });

  // Migrations are done.
  // Validate schema against all automerge docs
  serverLogger.info({ logId: "automerge-migration", logValue: "Running validator" });
  for (const docHandle of allDocHandles) {
    const mission: Mission = docHandle.doc();
    const isValid = missionValidator(mission);
    if (!isValid && missionValidator.errors?.length > 0) {
      serverLogger.error(
        { logId: "automerge-migration", logValue: JSON.stringify(missionValidator.errors) },
        new Error(`${(mission as Mission).id} - ${(mission as Mission).name} is invalid`)
      );
      process.exitCode = 1; // error
      process.exit();
    } else {
      serverLogger.info({
        logId: "automerge-migration",
        logValue: `${(mission as Mission).id} - ${(mission as Mission).name} is valid`,
      });
    }
  }
  serverLogger.info({ logId: "automerge-migration", logValue: "Validation complete." });
  // Wait 1 second for automerge to save to the storage adapter
  //  TODO kind hacky and this should smartly check when save is done.
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Save a copy of each automerge doc back to the backup missions table
  serverLogger.info({
    logId: "automerge-migration",
    logValue: "Saving updated automerge docs to the backup db table",
  });
  for (const docHandle of allDocHandles) {
    const mission: Mission = docHandle.doc();
    try {
      await upsertBackupDbMissions([mission]);
    } catch (e) {
      serverLogger.error(
        {
          logId: "automerge-migration",
          logValue: `Error saving mission ${mission.id} to the backup db table`,
        },
        e instanceof Error ? e : new Error(String(e))
      );
      process.exitCode = 1; // error
      process.exit();
    }
    serverLogger.info({
      logId: "automerge-migration",
      logValue: `${mission.id} - ${mission.name} backed up to the db`,
    });
  }
  serverLogger.info({ logId: "automerge-migration", logValue: "Backups complete." });

  serverLogger.info({ logId: "automerge-migration", logValue: "All processes complete. Exiting." });
  process.exitCode = 0; // success
  process.exit();
});
