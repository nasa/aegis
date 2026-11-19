import { asError } from "@emss/utils";
import type { Request, Response } from "express";

import express from "express";

import { serverLogger } from "utils/logging/serverLogger";
import { dustTokenIsValid, emssTokenIsValid } from "utils/permissions";
import { getMissionSummaries } from "server/automerge/missionCatalog";
import type { DustMissionListItem } from "../types/socketioDust";

const router = express.Router();

// Used by DUST to list every active mission
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const dustToken = req.headers["dust-token"] as string;
  const emssToken = req.headers["emss-token"] as string;

  if (!dustTokenIsValid(dustToken) && !emssTokenIsValid(emssToken)) {
    serverLogger.apiRoute({
      logId: "api-route:dust/v1/getMissions:GET:unauthorizedRequestInvalidDustOrEmssToken",
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "dust/v1/getMissions",
      message: "Unauthorized access attempt",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const missions = await getDustMissionsData();
    res.status(200).json({
      status: "success",
      message: "Missions retrieved",
      data: missions,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logId: "api-route:dust/v1/getMissions:GET:failedToListMissionsFromCatalog",
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "dust/v1/getMissions",
      message: "Error getting missions",
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error getting missions ${e}` });
  }
});

export async function getDustMissionsData(): Promise<DustMissionListItem[]> {
  const summaries = await getMissionSummaries();
  return summaries.map((summary) => ({ missionId: summary.id, missionName: summary.name }));
}

export default router;
