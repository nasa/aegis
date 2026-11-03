import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import { Repo } from "@automerge/automerge-repo/slim";
import type {
  AutomergeUrl,
  DocHandle,
  StorageAdapterInterface,
} from "@automerge/automerge-repo/slim";
import { PostgresStorageAdapter } from "server/automerge/automerge-storage-adapter-postgres";
import pg from "pg";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";

import { getAutomergeDocListing } from "server/express/routes/docListing";
import { missionValidator } from "utils/validateSchemaServer";
import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
import { initializeBase64Wasm } from "@automerge/automerge/slim";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";
import type { RequiredEntityData } from "@mikro-orm/core";
import { Doc_Listing_db } from "server/database/models/_allModels";
import {
  apollo14Layers,
  apollo14StmLevel1s,
  apollo14StmLevel2s,
  apollo14StmLevel3s,
  apollo14Sublayers,
  buildApollo14Mission,
  stampMissionId,
} from "server/automerge/seeder/apollo14SeedData";

const SEED_MISSION_NAME = "Apollo 14";

// This is only required on the server since we are using esbuild. On the client, vite handles the wasm loading
initializeBase64Wasm(automergeWasmBase64);

// Connect to the automerge database that stores all the docs
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

/**
 * Standalone seed script that creates the "Apollo 14" demo mission from nothing:
 *  - creates the mission Automerge document
 *  - adds the doc-listing row (which assigns the next available mission id)
 *  - stamps that id onto the mission and every entity
 *  - seeds the mission's map layers/sublayers
 *  - backs the mission up to the mission-backup table
 *
 * The mission id is taken from the doc-listing auto-increment.
 * If an "Apollo 14" mission already exists it exits without doing anything.
 */
const seed = async (): Promise<void> => {
  globalValues.orm = await MikroORM.init(config);
  serverLogger.info({
    logId: "automerge-seed:seedApollo14:startingApollo14SeedScript",
    logValue: "Starting Apollo 14 seed script...",
  });

  // Idempotency guard: skip if an Apollo 14 mission already exists.
  const existingListings = await getAutomergeDocListing();
  const existingMissions = await Promise.all(
    existingListings.map(async (listing) => {
      try {
        const handle: DocHandle<Mission> = await automergeRepo.find(
          listing.automergeUrl as AutomergeUrl
        );
        await handle.whenReady();
        return handle.doc();
      } catch {
        return null;
      }
    })
  );
  if (existingMissions.some((m) => m?.name === SEED_MISSION_NAME)) {
    serverLogger.info({
      logId: "automerge-seed:seedApollo14:skippedSeedBecauseApollo14MissionAlreadyExists",
      logValue: `A "${SEED_MISSION_NAME}" mission already exists. Nothing to seed. Exiting.`,
    });
    return;
  }

  // Build the seed data. The mission id / entity missionIds are placeholders here; the
  // real id is stamped on below once the doc-listing assigns it (see apollo14SeedData.ts).
  const seedMission: Mission = buildApollo14Mission();

  // Validate against the mission schema before anything is persisted, so an invalid
  // mission never reaches storage.
  if (!missionValidator(structuredClone(seedMission))) {
    throw new Error(`Seeded mission is invalid: ${JSON.stringify(missionValidator.errors)}`);
  }

  // Create the mission Automerge document.
  const missionDocHandle = automergeRepo.create<Mission>(seedMission);
  await missionDocHandle.whenReady();

  // Add a doc-listing row and flush to get the assigned (next available) mission id.
  const em = globalValues.orm.em.fork();
  const docListing: Partial<AutomergeDocListing> = { automergeUrl: missionDocHandle.url };
  const dbReference = em.create(
    Doc_Listing_db,
    docListing as RequiredEntityData<DocListing_db_type>
  );
  await em.persist(dbReference).flush();
  const missionId = dbReference.missionId;

  // Stamp the assigned id onto the mission document and every entity (including the
  // map layers, preset, and STM) so their missionIds match the id the database handed out.
  missionDocHandle.change((m) => stampMissionId(m, missionId));

  const mission = missionDocHandle.doc();

  // The Repo persists documents via a debounced/throttled save timer rather than
  // writing synchronously on create. This script calls process.exit() as soon as it
  // finishes, so without flush() the seeded document could be lost before the timer
  // fires. flush() bypasses the debounce and awaits the storage write for every cached
  // handle.
  await automergeRepo.flush();

  serverLogger.info({
    logId: "automerge-seed:seedApollo14:seededApollo14MissionWithEntityCounts",
    logValue:
      `Seeded "${SEED_MISSION_NAME}" (missionId ${missionId}) with ` +
      `${Object.keys(mission.pois).length} POI(s), ` +
      `${Object.keys(mission.stations).length} station(s), ` +
      `${Object.keys(mission.traverses).length} traverse(s), ` +
      `${Object.keys(mission.actions).length} action(s), ` +
      `${Object.keys(mission.evas).length} EVA(s), ` +
      `${Object.keys(mission.rexes).length} REX(es), ` +
      `${apollo14Layers.length} layer(s), ${apollo14Sublayers.length} sublayer(s), 1 preset, ` +
      `${apollo14StmLevel1s.length} STM level1(s), ${apollo14StmLevel2s.length} STM level2(s), ` +
      `${apollo14StmLevel3s.length} STM level3(s).`,
  });
};

seed()
  .then(() => {
    serverLogger.info({
      logId: "automerge-seed:seedApollo14:seedCompleteExiting",
      logValue: "Seed complete. Exiting.",
    });
    process.exitCode = 0;
    process.exit();
  })
  .catch((err: unknown) => {
    serverLogger.error(
      {
        logId: "automerge-seed:seedApollo14:unhandledErrorInSeedScript",
        logValue: "Unhandled error in seed script",
      },
      err instanceof Error ? err : new Error(String(err))
    );
    process.exitCode = 1;
    process.exit();
  });
