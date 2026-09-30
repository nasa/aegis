import type { EntityManager } from "@mikro-orm/postgresql";
import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import {
  Layer_db,
  Preset_db,
  STM_Level1_db,
  STM_Level2_db,
  STM_Level3_db,
  Sublayer_db,
  STM_Rule_db,
  Folder_db,
} from "server/database/models/_allModels";
import { globalValues } from "../global";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import { getAutomergeMissions } from "./missionAutomerge";

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

  if (!req.session?.appUser?.isSuperAdmin) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "missionDump",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  if (!queryObj.missionId) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "missionDump",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Mission ID is required",
    });
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
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "missionDump",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: `Error exporting mission: ${e}`,
      error: asError(e),
    });
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
  const em = globalValues.orm.em;

  // Fetch mission
  const mission = (await getAutomergeMissions([missionId]))[0];

  // Fetch all related entities
  const baseEntities = {
    layers: await em.find(Layer_db, { missionId }),
    sublayers: await em.find(Sublayer_db, { missionId }),
    presets: await em.find(Preset_db, { missionId }),
    folders: await em.find(Folder_db, { missionId }),
  };

  // Fetch STM entities with proper population
  const stmEntities = await fetchStmEntities(em, missionId);

  // Return combined results
  const data = {
    ...baseEntities,
    ...stmEntities,
  };

  // Structure the data for export
  return {
    exportDate: new Date().toISOString(),
    missionData: {
      mission: mission,
      layers: data.layers,
      sublayers: data.sublayers,
      presets: data.presets,
      stmLevel1s: data.stmLevel1s,
      stmLevel2s: data.stmLevel2s,
      stmLevel3s: data.stmLevel3s,
      stmRules: data.stmRules,
      folders: data.folders,
    },
  };
};

/**
 * Fetch STM entities with proper population
 */
const fetchStmEntities = async (em: EntityManager, missionId: number) => {
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
