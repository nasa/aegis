import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import { Repo } from "@automerge/automerge-repo/slim";
import type {
  AutomergeUrl,
  DocHandle,
  StorageAdapterInterface,
} from "@automerge/automerge-repo/slim";
import { PostgresStorageAdapter } from "server/automerge/automerge-repo-storage-postgres";
import pg from "pg";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";

import { getAutomergeDocListing } from "server/express/routes/docListing";
import { upsertBackupDbMissions } from "server/express/routes/mission";
import { missionValidator } from "utils/validateSchemaServer";
import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
import { initializeBase64Wasm } from "@automerge/automerge/slim";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";
import type { RequiredEntityData } from "@mikro-orm/core";
import {
  Doc_Listing_db,
  Layer_db,
  Preset_db,
  STM_Level1_db,
  STM_Level2_db,
  STM_Level3_db,
  Sublayer_db,
} from "server/database/models/_allModels";
import {
  apollo14Layers,
  apollo14Preset,
  apollo14StmLevel1s,
  apollo14StmLevel2s,
  apollo14StmLevel3s,
  buildApollo14Mission,
} from "server/database/seeds/apollo14SeedData";

const SEED_MISSION_NAME = "Apollo 14";
const LOG_ID = "automerge-seed";

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
 *  - adds the doc-listing row (which assigns the mission id)
 *  - stamps the id onto the mission and every entity
 *  - seeds the mission's map layers/sublayers
 *  - backs the mission up to the mission-backup table
 *
 * Intended to be run once against a fresh database (see `npm run seed:demo`). If an
 * "Apollo 14" mission already exists it exits without doing anything.
 */
const seed = async (): Promise<void> => {
  globalValues.orm = await MikroORM.init(config);
  serverLogger.info({ logId: LOG_ID, logValue: "Starting Apollo 14 seed script..." });

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
      logId: LOG_ID,
      logValue: `A "${SEED_MISSION_NAME}" mission already exists. Nothing to seed. Exiting.`,
    });
    return;
  }

  // Create the mission Automerge document from the static seed data. The seed data
  // hardcodes the mission id / entity missionIds to 1 (see apollo14SeedData.ts).
  const seedMission: Mission = buildApollo14Mission();
  const missionId = seedMission.id;
  if (missionId == null) throw new Error("Seed mission is missing a hardcoded id.");
  const missionDocHandle = automergeRepo.create<Mission>(seedMission);
  await missionDocHandle.whenReady();

  // Add a doc-listing row and flush to get the assigned mission id back.
  const em = globalValues.orm.em.fork();
  const docListing: Partial<AutomergeDocListing> = { automergeUrl: missionDocHandle.url };
  const dbReference = em.create(
    Doc_Listing_db,
    docListing as RequiredEntityData<DocListing_db_type>
  );
  await em.persist(dbReference).flush();

  // The seed data assumes a fresh database where this is the first mission (id 1).
  // Fail loudly rather than silently produce a mission whose id disagrees with its
  // doc-listing / entity missionIds.
  if (dbReference.missionId !== missionId) {
    throw new Error(
      `Expected the seeded mission to be assigned id ${missionId}, but the doc-listing ` +
        `assigned ${dbReference.missionId}. Run against a fresh database (npm run seed:demo).`
    );
  }

  // Seed the map layers and their sublayers for this mission (deterministic uuids
  // from the seed data so the default preset can reference them).
  const now = new Date();
  let sublayerCount = 0;
  for (const seedLayer of apollo14Layers) {
    em.create(Layer_db, {
      uuid: seedLayer.uuid,
      missionId,
      name: seedLayer.name,
      createdAt: now,
      updatedAt: now,
    } as RequiredEntityData<Layer_db_type>);
    for (const seedSublayer of seedLayer.sublayers) {
      em.create(Sublayer_db, {
        uuid: seedSublayer.uuid,
        missionId,
        layer: seedLayer.uuid,
        name: seedSublayer.name,
        description: seedSublayer.description,
        type: seedSublayer.type,
        path: seedSublayer.path,
        tilePattern: seedSublayer.tilePattern,
        boundingBox: seedSublayer.boundingBox,
        tileFormat: seedSublayer.tileFormat,
        minNativeZoom: seedSublayer.minNativeZoom,
        maxNativeZoom: seedSublayer.maxNativeZoom,
        maxZoom: seedSublayer.maxZoom,
        createdAt: now,
        updatedAt: now,
      } as RequiredEntityData<Sublayer_db_type>);
      sublayerCount++;
    }
  }

  // Seed the mission-default map preset.
  em.create(Preset_db, {
    ...apollo14Preset,
    createdAt: now,
    updatedAt: now,
  } as RequiredEntityData<Preset_db_type>);

  // Seed the Science Traceability Matrix (STM) rows for this mission. Level1s are
  // mission-scoped; level2/level3 hang off their parents via ManyToOne uuid refs.
  for (const level1 of apollo14StmLevel1s) {
    em.create(STM_Level1_db, {
      uuid: level1.uuid,
      missionId,
      name: level1.name,
      numbering: level1.numbering,
      createdAt: now,
      updatedAt: now,
    } as RequiredEntityData<STMLevel1_db_type>);
  }
  for (const level2 of apollo14StmLevel2s) {
    em.create(STM_Level2_db, {
      uuid: level2.uuid,
      level1: level2.level1Uuid,
      name: level2.name,
      numbering: level2.numbering,
      createdAt: now,
      updatedAt: now,
    } as RequiredEntityData<STMLevel2_db_type>);
  }
  for (const level3 of apollo14StmLevel3s) {
    em.create(STM_Level3_db, {
      uuid: level3.uuid,
      level2: level3.level2Uuid,
      name: level3.name,
      numbering: level3.numbering,
      createdAt: now,
      updatedAt: now,
    } as RequiredEntityData<STMLevel3_db_type>);
  }

  await em.flush();

  // Validate the seeded document against the mission schema before persisting.
  const mission = missionDocHandle.doc();
  const isValid = missionValidator(structuredClone(mission));
  if (!isValid) {
    throw new Error(`Seeded mission is invalid: ${JSON.stringify(missionValidator.errors)}`);
  }

  // Flush the Automerge document to storage (bypasses the debounced save timer),
  // then back the mission up to the mission-backup table.
  await automergeRepo.flush();
  await upsertBackupDbMissions([mission]);

  serverLogger.info({
    logId: LOG_ID,
    logValue:
      `Seeded "${SEED_MISSION_NAME}" (missionId ${missionId}) with ` +
      `${Object.keys(mission.pois).length} POI(s), ` +
      `${Object.keys(mission.stations).length} station(s), ` +
      `${Object.keys(mission.traverses).length} traverse(s), ` +
      `${Object.keys(mission.actions).length} action(s), ` +
      `${Object.keys(mission.evas).length} EVA(s), ` +
      `${Object.keys(mission.rexes).length} REX(es), ` +
      `${apollo14Layers.length} layer(s), ${sublayerCount} sublayer(s), 1 preset, ` +
      `${apollo14StmLevel1s.length} STM level1(s), ${apollo14StmLevel2s.length} STM level2(s), ` +
      `${apollo14StmLevel3s.length} STM level3(s).`,
  });
};

seed()
  .then(() => {
    serverLogger.info({ logId: LOG_ID, logValue: "Seed complete. Exiting." });
    process.exitCode = 0;
    process.exit();
  })
  .catch((err: unknown) => {
    serverLogger.error(
      { logId: LOG_ID, logValue: "Unhandled error in seed script" },
      err instanceof Error ? err : new Error(String(err))
    );
    process.exitCode = 1;
    process.exit();
  });
