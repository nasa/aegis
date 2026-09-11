import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { makeExportEvas } from "utils/export";
import { hasPerms } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

import { getGrid } from "../../../express/routes/grid";
import { getAutomergeMissions } from "../../../express/routes/missionAutomerge";

/**
 * Used by Maegistro v2
 */

interface ReadableEvaParams {
  missionId: number;
  evaUuid?: string;
}

const router = express.Router();

export async function getReadableEvaData(params: ReadableEvaParams): Promise<ExportEva[]> {
  const { missionId, evaUuid } = params;

  const mission = (await getAutomergeMissions([missionId]))[0];
  let evas: Eva[] = [];

  if (evaUuid) {
    const eva = mission.evas[evaUuid];
    if (eva) evas = [eva];
  } else {
    // All as-planned evas for this mission
    const allRexEvas = Object.values(mission.rexes).map((r) => r.evaUuid);
    const asPlannedEvas = Object.values(mission.evas).filter((e) => !allRexEvas.includes(e.uuid));
    evas = asPlannedEvas;
  }

  let gridCoordinates = null;
  if (mission.serverFileGrid) {
    try {
      gridCoordinates = (await getGrid(missionId, true))?.coordinates;
    } catch (e) {
      // Something went wrong with fetching grids. Report an error but continue without grid data
      serverLogger.apiRoute({
        logLevel: "error",
        httpMethod: "GET",
        responseStatus: null,
        routeName: "readable/eva",
        missionId,
        message: `Error getGridFromFile: ${e}`,
        error: asError(e),
      });
    }
  }

  return makeExportEvas({
    evas: evas,
    mission,
    missionGrid: gridCoordinates,
  });
}

const parseQuery = (query: Query) => {
  const { missionId, uuid } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    evaUuid: uuid ? (uuid as string) : undefined, // if !uuid then return all as-planned EVAs
  };
  return queryObj;
};

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const emssToken = req.headers["emss-token"] as string;

  const viewPermission = hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!viewPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "readable/eva",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  //check for required mission id is valid
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "readable/eva",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  try {
    const data = await getReadableEvaData({
      missionId: queryObj.missionId,
      evaUuid: queryObj.evaUuid,
    });
    res.status(200).json({ status: "success", message: "readable evas retrieved", data });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "readable/eva",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: `Error getting readable evas ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error getting readable evas ${e}` });
  }
});

export default router;
