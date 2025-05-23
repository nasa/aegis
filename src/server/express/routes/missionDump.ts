import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";
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
import { getEM } from "utils/mikro";
import { EntityManager } from "@mikro-orm/core";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
  };
  return queryObj;
};

// GET endpoint to export a mission
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);

  if (!req.session?.user?.isSuperAdmin) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  if (!queryObj.missionId) {
    res.status(400).json({ status: "failure", message: "Mission ID is required" });
    return;
  }

  try {
    const missionData = await dumpMissionData(queryObj.missionId);

    // Always return a wrapped response with the dump data
    res.status(200).json({
      status: "success",
      message: "Mission dump data retrieved successfully",
      data: missionData,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error exporting mission: ${e}` });
  }
});

export default router;

/**
 * Exports all data for a mission
 * @param missionId The ID of the mission to export
 * @returns A structured object containing all mission data
 */
const dumpMissionData = async (missionId: number): Promise<MissionDump> => {
  const em = getEM();

  // Fetch mission and all related entities
  const mission = await em.findOne(Mission_db, { id: missionId });
  if (!mission) {
    throw new Error(`Mission with ID ${missionId} not found`);
  }

  // Fetch all related entities
  const data = await fetchAllMissionEntities(em, missionId);

  // Structure the data for export
  return {
    exportDate: new Date().toISOString(),
    missionData: {
      mission: mission,
      stations: data.stations,
      pois: data.pois,
      actions: data.actions,
      evas: data.evas,
      layers: data.layers,
      sublayers: data.sublayers,
      traverses: data.traverses,
      presets: data.presets,
      rexes: data.rexes,
      stmLevel1s: data.stmLevel1s,
      stmLevel2s: data.stmLevel2s,
      stmLevel3s: data.stmLevel3s,
      stmRules: data.stmRules,
      grids: data.grids,
      folders: data.folders,
    },
  };
};

/**
 * Fetches all entities related to a mission
 */
const fetchAllMissionEntities = async (em: EntityManager, missionId: number) => {
  // Fetch base entities
  const baseEntities = await fetchMissionEntities(em, missionId);

  // Fetch STM entities with proper population
  const stmEntities = await fetchStmEntities(em, missionId);

  // Return combined results
  return {
    ...baseEntities,
    ...stmEntities,
  };
};

/**
 * Fetches entities for a given mission
 */
const fetchMissionEntities = async (em: EntityManager, missionId: number) => {
  return {
    stations: await em.find(Station_db, { mission: missionId }),
    pois: await em.find(Poi_db, { mission: missionId }),
    actions: await em.find(Action_db, { mission: missionId }),
    evas: await em.find(Eva_db, { mission: missionId }),
    layers: await em.find(Layer_db, { mission: missionId }),
    sublayers: await em.find(Sublayer_db, { mission: missionId }),
    traverses: await em.find(Traverse_db, { mission: missionId }),
    presets: await em.find(Preset_db, { mission: missionId }),
    rexes: await em.find(Rex_db, { mission: missionId }),
    grids: await em.find(Grid_db, { mission: missionId }),
    folders: await em.find(Folder_db, { mission: missionId }),
  };
};

/**
 * Fetch STM entities with proper population
 */
const fetchStmEntities = async (em: EntityManager, missionId: number) => {
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
