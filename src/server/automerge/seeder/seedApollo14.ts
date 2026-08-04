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
  apollo14Sublayers,
  buildApollo14Mission,
  stampMissionId,
} from "server/automerge/seeder/apollo14SeedData";
import { convertLayersTypeStoreToDb } from "store/storeUtils/layer";
import {
  convertStms1TypeStoreToDb,
  convertStms2TypeStoreToDb,
  convertStms3TypeStoreToDb,
} from "store/storeUtils/stm";
import { convertSublayersTypeStoreToDb } from "store/storeUtils/sublayer";

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

  // Stamp the assigned id onto the mission document and every entity so their
  // missionIds match the id the database handed out.
  missionDocHandle.change((m) => stampMissionId(m, missionId));

  // Seed the map layers and their sublayers for this mission (deterministic uuids
  // from the seed data so the default preset can reference them). The seed arrays
  // carry a placeholder missionId (1) and generator-defaulted timestamps; both are
  // overridden here with the assigned mission id and a real seed-time timestamp.
  const now = new Date();
  for (const dbLayer of convertLayersTypeStoreToDb(apollo14Layers)) {
    em.create(Layer_db, {
      ...dbLayer,
      missionId,
      createdAt: now,
      updatedAt: now,
    } as RequiredEntityData<Layer_db_type>);
  }
  for (const dbSublayer of convertSublayersTypeStoreToDb(apollo14Sublayers)) {
    em.create(Sublayer_db, {
      ...dbSublayer,
      missionId,
      createdAt: now,
      updatedAt: now,
    } as RequiredEntityData<Sublayer_db_type>);
  }

  // Seed the mission-default map preset. Its static missionId is a placeholder, so
  // override it with the assigned id.
  em.create(Preset_db, {
    ...apollo14Preset,
    missionId,
    createdAt: now,
    updatedAt: now,
  } as RequiredEntityData<Preset_db_type>);

  // Seed the Science Traceability Matrix (STM) rows for this mission. Level1s are
  // mission-scoped; level2/level3 hang off their parents via ManyToOne uuid refs.
  // Level1's placeholder missionId and all generator-defaulted timestamps are
  // overridden here with the assigned id and a real seed-time timestamp.
  for (const dbLevel1 of convertStms1TypeStoreToDb(apollo14StmLevel1s)) {
    em.create(STM_Level1_db, {
      ...dbLevel1,
      missionId,
      createdAt: now,
      updatedAt: now,
    } as RequiredEntityData<STMLevel1_db_type>);
  }
  for (const dbLevel2 of convertStms2TypeStoreToDb(apollo14StmLevel2s)) {
    em.create(STM_Level2_db, {
      ...dbLevel2,
      createdAt: now,
      updatedAt: now,
    } as RequiredEntityData<STMLevel2_db_type>);
  }
  for (const dbLevel3 of convertStms3TypeStoreToDb(apollo14StmLevel3s)) {
    em.create(STM_Level3_db, {
      ...dbLevel3,
      createdAt: now,
      updatedAt: now,
    } as RequiredEntityData<STMLevel3_db_type>);
  }

  await em.flush();

  const mission = missionDocHandle.doc();

  // The Repo persists documents via a debounced/throttled save timer rather than
  // writing synchronously on create. This script calls process.exit() as soon as it
  // finishes, so without flush() the seeded document could be lost before the timer
  // fires. flush() bypasses the debounce and awaits the storage write for every cached
  // handle. Then back the mission up to the mission-backup table.
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
      `${apollo14Layers.length} layer(s), ${apollo14Sublayers.length} sublayer(s), 1 preset, ` +
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
