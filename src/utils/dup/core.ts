import type { EntityManager } from "@mikro-orm/postgresql";
import type { DocHandle, AutomergeUrl } from "@automerge/automerge-repo/slim";

import {
  Layer_db,
  Preset_db,
  STM_Level1_db,
  STM_Level2_db,
  STM_Level3_db,
  Sublayer_db,
  Grid_db,
  STM_Rule_db,
  Folder_db,
  Doc_Listing_db,
} from "server/database/models/_allModels";
import { getAccurateNow } from "utils/formatting";
import {
  processLayers,
  processSublayers,
  processPresets,
  processStmEntities,
  processStmRules,
  processGrids,
  processFolders,
  updateSublayerToLayerRelationships,
} from "./entityProcessors";
import { initializeUuidMaps, copyMissionAssets } from "./helpers";
import { createAutomergeMission } from "server/express/routes/missionAutomerge";
import { globalValues } from "server/express/global";
import cloneDeep from "lodash/cloneDeep";

// Create a new mission based on the original
const createMissionFromSource = async (
  originalMission: Mission,
  nameSuffix: string
): Promise<DocHandle<Mission>> => {
  // We are unsure the state of the incoming original mission, so clone it in-case
  // there are existing Automerge proxy references
  const sourceMission = cloneDeep(originalMission);
  const newMission: Mission = {
    ...sourceMission,
    id: null, // Let the database assign a new ID
    name: `${sourceMission.name} - ${nameSuffix}`,
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };

  // create an mission automerge document
  const docListing: AutomergeDocListing = await createAutomergeMission(newMission);
  // retrieve the mission object
  const missionDocHandle: DocHandle<Mission> = await globalValues.automergeRepo.find(
    docListing.automergeUrl as AutomergeUrl
  );
  await missionDocHandle.whenReady();
  return missionDocHandle;
};

// Fetch STM entities with proper population
export const fetchStmEntities = async (
  em: EntityManager,
  missionId: number
): Promise<StmEntitiesResult> => {
  // Fetch STM Level 1 with populated Level 2 collection
  const stmLevel1s = await em.find(STM_Level1_db, { missionId }, { populate: ["level2s"] });

  // Query Level 2 with populated Level 3 collection
  const stmLevel2s = [];
  for (const stmLevel1 of stmLevel1s) {
    const level2s = await em.find(STM_Level2_db, { level1: stmLevel1 }, { populate: ["level3s"] });
    stmLevel2s.push(...level2s);
  }

  // Query Level 3
  const stmLevel3s = [];
  for (const stmLevel2 of stmLevel2s) {
    const level3s = await em.find(STM_Level3_db, { level2: stmLevel2 });
    stmLevel3s.push(...level3s);
  }

  // Query STM Rules
  const stmRules = await em.find(STM_Rule_db, { missionId });

  return { stmLevel1s, stmLevel2s, stmLevel3s, stmRules };
};

// Main function to create a mission copy or restore from data
export const createMissionCopy = async (
  em: EntityManager,
  sourceData: MissionSourceData,
  options: MissionCopyOptions,
  outputUuidMaps?: EntityMaps // Optional parameter to export the UUID mappings
): Promise<number> => {
  try {
    // 1. Create new mission
    const newMissionDocHandle: DocHandle<Mission> = await createMissionFromSource(
      sourceData.mission,
      options.nameSuffix
    );
    const newMissionId = newMissionDocHandle.doc().id;

    // 2. Initialize UUID maps
    const uuidMaps = outputUuidMaps || initializeUuidMaps();

    // Continue with other entities
    processLayers(em, sourceData.layers, newMissionId, uuidMaps);
    await processSublayers(em, sourceData.sublayers, newMissionId, uuidMaps);
    processPresets(em, sourceData.presets, newMissionId, uuidMaps);

    // STM entities
    const stmLevel1s = sourceData.stmLevel1s || [];
    const stmLevel2s = sourceData.stmLevel2s || [];
    const stmLevel3s = sourceData.stmLevel3s || [];
    const stmRules = sourceData.stmRules || [];

    await processStmEntities(em, stmLevel1s, stmLevel2s, stmLevel3s, newMissionId, uuidMaps);
    await processStmRules(em, stmRules, newMissionId, uuidMaps);

    // Grids and folders
    const newActiveGridUuid = processGrids(em, sourceData.grids, newMissionId, uuidMaps);
    processFolders(em, sourceData.folders, newMissionId, uuidMaps);

    // 4. Update cross-entity references
    // Update DB-layer sublayer → layer relationships
    await updateSublayerToLayerRelationships(em, sourceData.sublayers, uuidMaps);

    // 5. Set active grid UUID if available
    if (newActiveGridUuid) {
      // eslint-disable-next-line no-restricted-syntax
      newMissionDocHandle.change((mission) => {
        mission.activeGridUuid = newActiveGridUuid;
      });
    }

    // 6. Flush all changes
    await em.flush();

    // 7. Copy mission assets if needed and if an original ID exists
    if (options.copyAssets && sourceData.mission.id) {
      await copyMissionAssets(sourceData.mission.id, newMissionId);
    }

    return newMissionId;
  } catch (error) {
    throw new Error(`Failed to create mission copy: ${error}`);
  }
};

// Function to fetch all entities for a mission
export const fetchMissionSourceData = async (
  em: EntityManager,
  missionId: number
): Promise<MissionSourceData> => {
  const automergeDocListing = await em.findOne(Doc_Listing_db, { missionId });
  if (!automergeDocListing) {
    throw new Error(`Automerge document listing for mission ID ${missionId} not found`);
  }

  const missionDocHandle: DocHandle<Mission> = await globalValues.automergeRepo.find(
    automergeDocListing.automergeUrl as AutomergeUrl
  );
  await missionDocHandle.whenReady();
  const mission = missionDocHandle.doc();

  const { stmLevel1s, stmLevel2s, stmLevel3s, stmRules } = await fetchStmEntities(em, missionId);

  return {
    mission,
    layers: await em.find(Layer_db, { missionId }),
    sublayers: await em.find(Sublayer_db, { missionId }),
    presets: await em.find(Preset_db, { missionId }),
    stmLevel1s,
    stmLevel2s,
    stmLevel3s,
    stmRules,
    grids: await em.find(Grid_db, { missionId }),
    folders: await em.find(Folder_db, { missionId }),
  };
};
