import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { makeExportEvas } from "utils/export";
import { hasPerms } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

import { getAll } from "../all";
import { getGrids } from "../grid";

const router = express.Router();

/**
 * Shared data logic for the readable/eva route and maestro socket handler.
 * Otherwise returns full ExportEva[] records.
 */
export async function getReadableEvaData(params: ReadableEvaParams): Promise<ExportEva[]> {
  const { missionId, evaRefUuid, rexUuid } = params;

  const wholeStore: OneMissionToRuleThemAll = await getAll(missionId);
  const allData: MissionCoreData = {
    mission: wholeStore.mission,
    pois: wholeStore.pois,
    stations: wholeStore.stations,
    actions: wholeStore.actions,
    traverses: wholeStore.traverses,
    evas: wholeStore.evas,
    rexes: wholeStore.rexes,
    level1s: wholeStore.level1s,
    level2s: wholeStore.level2s,
    level3s: wholeStore.level3s,
  };

  let evas: Eva[] = [];

  if (rexUuid) {
    // specific eva from a rex
    const rexEva = allData.rexes.find((r) => r.uuid === rexUuid);
    if (rexEva) {
      const eva = allData.evas.find((e) => e.uuid === rexEva.evaUuid);
      if (eva) evas = [eva];
    }
  } else if (evaRefUuid) {
    // get the as-planned copy of this eva. The as-planned eva is one that has the same refUuid, but is not a rex eva
    // if they had provided a rexUuid, it would have been caught in the previous if statement
    const allRexEvas = allData.rexes.map((r) => r.evaUuid);
    const asPlannedEva = allData.evas.find(
      (e) => e.refUuid === evaRefUuid && !allRexEvas.includes(e.uuid)
    );
    if (asPlannedEva) evas = [asPlannedEva];
  } else {
    // all as-planned evas for this mission
    const allRexEvas = allData.rexes.map((r) => r.evaUuid);
    evas = allData.evas.filter((e) => !allRexEvas.includes(e.uuid));
  }

  let gridCoordinates = null;
  if (allData.mission.activeGridUuid) {
    try {
      gridCoordinates = (await getGrids(missionId, true, allData.mission.activeGridUuid))[0]
        ?.coordinates;
    } catch (e) {
      // something went wrong with fetching grids. Report an error but continue without grid data
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

  return makeExportEvas({ evas, allData, missionGrid: gridCoordinates });
}

const parseQuery = (query: Query) => {
  const { missionId, refUuid, rexUuid } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    evaRefUuid: refUuid ? (refUuid as string) : undefined,
    rexUuid: rexUuid ? (rexUuid as string) : undefined, // if !rexUuid then use the as-planned EVA copy
  };
  return queryObj;
};

/**
 * If users provide a rexUuid than it will take precedence over evaRefUuid.
 */
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
      evaRefUuid: queryObj.evaRefUuid,
      rexUuid: queryObj.rexUuid,
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
