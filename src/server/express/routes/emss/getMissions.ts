import { asError } from "@emss/utils";
import type { Request, Response } from "express";

import express from "express";

import { serverLogger } from "utils/logging/serverLogger";
import { emssTokenIsValid } from "utils/permissions";
import { getAutomergeMissions } from "../missionAutomerge";

const router = express.Router();

// Used by Maestro to get all missions and their as-planned EVAs
// Deprecated
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const emssToken = req.headers["emss-token"] as string;

  // Check if user has EMSS permissions
  const viewPermissions = emssTokenIsValid(emssToken);

  if (!viewPermissions) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "emss/getMissions",
      message: "Unauthorized access attempt",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const missions = await getMissionsData();
    res.status(200).json({
      status: "success",
      message: `Missions and their EVAs retrieved`,
      data: missions,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "emss/getMissions",
      message: "Error getting missions and their evas",
      error: asError(e),
    });
    res
      .status(500)
      .json({ status: "error", message: `Error getting missions and their evas ${e}` });
  }
});

export async function getMissionsData(): Promise<MissionsWithEvas> {
  // Get all automerge mission documents first
  const allMissions = await getAutomergeMissions();
  const activeMissions = allMissions.filter((mission) => !mission.isArchived);

  const missions: MissionsWithEvas = {};

  for (const mission of activeMissions) {
    const rexEvaUuids = Object.values(mission.rexes || {}).map((r) => r.evaUuid);
    const asPlannedEvas = Object.values(mission.evas || {}).filter(
      (e) => !rexEvaUuids.includes(e.uuid)
    );

    missions[mission.id] = {
      missionName: mission.name,
      missionActionSystemVersion: mission.actionSystemVersion,
      evas: asPlannedEvas.map((e) => ({
        refUuid: e.refUuid,
        evaName: e.name,
      })),
    };
  }

  return missions;
}

export default router;
