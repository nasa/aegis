import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { makeExportMission } from "utils/export";
import {
  apiHasPerms,
  apiHasSuperUserOrToken,
  logUsername,
  missionIdsAtLevel,
} from "utils/permissionsServer";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

import { getGrid } from "../../../express/routes/grid";
import { getAutomergeMissions } from "../../../express/routes/missionAutomerge";

/**
 * Used by Maegistro v2
 */

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
  };
  return queryObj;
};

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const seesEverything = apiHasSuperUserOrToken(req.currentUser);
  const viewableMissions = missionIdsAtLevel(req.currentUser, "viewer");

  const viewPermission = queryObj.missionId
    ? apiHasPerms({
        missionId: queryObj.missionId,
        requiredPermLevel: "viewer",
        user: req.currentUser,
      })
    : // no mission was specified, so check they can view at least one
      seesEverything || viewableMissions.length > 0;
  if (!viewPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "readable/mission",
      appUsername: logUsername(req.currentUser),
      missionId: queryObj.missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    let records: Mission[];
    if (queryObj.missionId) {
      records = await getAutomergeMissions([queryObj.missionId]);
    } else {
      // A super user and an EMSS-token caller hold no grant rows, so undefined means every mission.
      records = await getAutomergeMissions(seesEverything ? undefined : viewableMissions);
    }

    const exportMissions: ExportMission[] = await Promise.all(
      records.map(async (mission) => {
        const gridCoordinates: MissionGridPoint[][] =
          mission.serverFileGrid && !mission.usingLGRSCoordinates
            ? (await getGrid(mission.id, true))?.coordinates
            : null;
        return makeExportMission({
          mission: mission,
          missionGrid: gridCoordinates,
        });
      })
    );

    res.status(200).json({
      status: "success",
      message: "mission retrieved",
      data: exportMissions,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "readable/mission",
      appUsername: logUsername(req.currentUser),
      missionId: queryObj.missionId,
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

export default router;
