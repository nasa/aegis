import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

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
      logId: "api-route:missionDump:GET:unauthorizedRequestNotSuperAdmin",
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
      logId: "api-route:missionDump:GET:rejectedMissingMissionId",
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
      logId: "api-route:missionDump:GET:failedToExportMission",
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
 * Exports all data for a mission. Every mission entity lives in the mission document.
 * @param missionId The ID of the mission to export
 * @returns The mission document with an export date
 */
const dumpMissionData = async (missionId: number): Promise<MissionDump> => {
  const mission = (await getAutomergeMissions([missionId]))[0];
  return {
    exportDate: new Date().toISOString(),
    missionData: { mission },
  };
};
