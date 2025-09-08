import type { EntityManager } from "@mikro-orm/postgresql";

import {
  Mission_db,
  Station_db,
  Poi_db,
  Action_db,
  Eva_db,
  Layer_db,
  Preset_db,
  Rex_db,
  STM_Level1_db,
  STM_Level2_db,
  STM_Level3_db,
  Sublayer_db,
  Traverse_db,
  Grid_db,
  STM_Rule_db,
  Folder_db,
} from "server/database/models/_allModels";
import { getAccurateNow } from "utils/formatting";

import {
  processStations,
  processPois,
  processTraverses,
  processActions,
  processLayers,
  processSublayers,
  processEvas,
  processPresets,
  processRexes,
  processStmEntities,
  processStmRules,
  processGrids,
  processFolders,
  connectPoisToStations,
  updateActionRelationships,
  updateSublayerToLayerRelationships,
  updateStationActionOrder,
  updatePoiActionOrder,
  updateTraverseActionOrder,
} from "./entityProcessors";
import { initializeUuidMaps, copyMissionAssets } from "./helpers";

// Create a new mission based on the original
export const createNewMission = (
  em: EntityManager,
  originalMission: Mission_db,
  nameSuffix: string
): Mission_db => {
  return em.create(Mission_db, {
    ...originalMission,
    id: undefined, // Let the database assign a new ID
    name: `${originalMission.name} - ${nameSuffix}`,
    createdAt: getAccurateNow().toISOString(),
    updatedAt: getAccurateNow().toISOString(),
  });
};

// Fetch STM entities with proper population
export const fetchStmEntities = async (
  em: EntityManager,
  missionId: number
): Promise<StmEntitiesResult> => {
  // Fetch STM Level 1 with populated Level 2 collection
  const stmLevel1s = await em.find(
    STM_Level1_db,
    { mission: missionId },
    { populate: ["level2s"] }
  );

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
  const stmRules = await em.find(STM_Rule_db, { mission: missionId });

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
    const newMission = createNewMission(em, sourceData.mission, options.nameSuffix);

    // 2. Initialize UUID maps
    const uuidMaps = outputUuidMaps || initializeUuidMaps();

    // 3. Process entities in the correct order
    processStations(em, sourceData.stations, newMission, uuidMaps);
    processPois(em, sourceData.pois, newMission, uuidMaps);
    processTraverses(em, sourceData.traverses, newMission, uuidMaps);

    // Actions after base entities are created
    processActions(em, sourceData.actions, newMission, uuidMaps);

    // Continue with other entities
    processLayers(em, sourceData.layers, newMission, uuidMaps);

    // Process sublayers
    await processSublayers(em, sourceData.sublayers, newMission, uuidMaps);

    // Process remaining entities
    processEvas(em, sourceData.evas, newMission, uuidMaps);
    processPresets(em, sourceData.presets, newMission, uuidMaps);
    processRexes(em, sourceData.rexes, newMission, uuidMaps);

    // STM entities
    const stmLevel1s = sourceData.stmLevel1s || [];
    const stmLevel2s = sourceData.stmLevel2s || [];
    const stmLevel3s = sourceData.stmLevel3s || [];
    const stmRules = sourceData.stmRules || [];

    await processStmEntities(em, stmLevel1s, stmLevel2s, stmLevel3s, newMission, uuidMaps);
    await processStmRules(em, stmRules, newMission, uuidMaps);

    // Grids and folders
    const newActiveGridUuid = processGrids(em, sourceData.grids, newMission, uuidMaps);
    processFolders(em, sourceData.folders, newMission, uuidMaps);

    // 4. Update relationships between entities
    await connectPoisToStations(em, sourceData.pois, uuidMaps);
    await updateActionRelationships(em, sourceData.actions, uuidMaps);
    await updateSublayerToLayerRelationships(em, sourceData.sublayers, uuidMaps);

    // Update action order UUIDs
    await updateStationActionOrder(em, sourceData.stations, uuidMaps);
    await updatePoiActionOrder(em, sourceData.pois, uuidMaps);
    await updateTraverseActionOrder(em, sourceData.traverses, uuidMaps);

    // 5. Set active grid UUID if available
    if (newActiveGridUuid) {
      newMission.activeGridUuid = newActiveGridUuid;
    }

    // 6. Persist and flush all changes
    em.persist(newMission);
    await em.flush();

    if (!newMission.id) {
      throw new Error("Failed to get ID for the newly created mission after flush");
    }

    // 7. Copy mission assets if needed and if an original ID exists
    if (options.copyAssets && sourceData.mission.id) {
      await copyMissionAssets(sourceData.mission.id, newMission.id);
    }

    return newMission.id;
  } catch (error) {
    throw new Error(`Failed to create mission copy: ${error}`);
  }
};

// Function to fetch all entities for a mission
export const fetchMissionEntities = async (
  em: EntityManager,
  missionId: number
): Promise<MissionSourceData> => {
  const mission = await em.findOne(Mission_db, { id: missionId });
  if (!mission) {
    throw new Error(`Mission with ID ${missionId} not found`);
  }

  // Fetch STM entities
  const { stmLevel1s, stmLevel2s, stmLevel3s, stmRules } = await fetchStmEntities(em, missionId);

  // Fetch POIs with populated station collection to avoid initialization errors
  const pois = await em.find(Poi_db, { mission: missionId }, { populate: ["station"] });

  // Fetch stations with populated poi collection
  const stations = await em.find(Station_db, { mission: missionId }, { populate: ["poi"] });

  return {
    mission,
    stations,
    pois,
    actions: await em.find(Action_db, { mission: missionId }),
    evas: await em.find(Eva_db, { mission: missionId }),
    layers: await em.find(Layer_db, { mission: missionId }),
    sublayers: await em.find(Sublayer_db, { mission: missionId }),
    traverses: await em.find(Traverse_db, { mission: missionId }),
    presets: await em.find(Preset_db, { mission: missionId }),
    rexes: await em.find(Rex_db, { mission: missionId }),
    stmLevel1s,
    stmLevel2s,
    stmLevel3s,
    stmRules,
    grids: await em.find(Grid_db, { mission: missionId }),
    folders: await em.find(Folder_db, { mission: missionId }),
  };
};
