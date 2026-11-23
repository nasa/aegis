import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";

import { getAutomergeDocListing } from "server/express/routes/docListing";
import { missionValidator } from "utils/validateSchemaServer";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";
import type { RequiredEntityData } from "@mikro-orm/core";
import { Doc_Listing_db } from "server/database/models/_allModels";
import { createMissionSummary } from "server/missionCatalog/missionCatalog";
import { createToolHistoryRepo } from "server/historyStore/tools/createToolHistoryRepo";
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

const { repo: historyRepo, pool: dbPool } = createToolHistoryRepo();

/**
 * Standalone seed script that creates the "Apollo 14" demo mission from nothing:
 *  - creates the mission history document ("history:<uuid>")
 *  - adds the doc-listing row (which assigns the next available mission id)
 *  - stamps that id onto the mission and every entity
 *  - seeds the mission's map layers/sublayers
 *  - writes the mission catalog summary
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
        const handle = await historyRepo.find<Mission>(listing.automergeUrl);
        const name = handle.doc().name;
        await historyRepo.removeFromCache(handle.documentId);
        return { name };
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

  // Create the mission history document and wait for row 0 to be persisted.
  const missionDocHandle = historyRepo.create<Mission>(seedMission);
  await missionDocHandle.flush();
  if (!historyRepo.store.isLoaded(missionDocHandle.documentId)) {
    throw new Error(`Failed to persist history document ${missionDocHandle.documentId}`);
  }

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

  await historyRepo.flush();
  const mission = historyRepo.store.getConfirmedState(missionDocHandle.documentId) as Mission;
  if (mission?.id !== missionId) {
    throw new Error(`Mission id stamp was not persisted to ${missionDocHandle.documentId}`);
  }
  await createMissionSummary(historyRepo, missionDocHandle, undefined, true);

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
  })
  .finally(async () => {
    await globalValues.orm?.close();
    await dbPool.end();
    process.exit();
  });
