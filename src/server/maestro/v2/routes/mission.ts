import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { makeExportMission } from "utils/export";
import { hasPerms, emssTokenIsValid } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

import { getGrid } from "../../../express/routes/grid";
import { getAutomergeMissions } from "../../../express/routes/missionAutomerge";

/**
 * Used by Maegistro v1 and v2
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
  const emssToken = req.headers["emss-token"] as string;

  let viewPermission;
  if (queryObj.missionId) {
    viewPermission = hasPerms({
      missionId: queryObj.missionId,
      permission: "view",
      appUser: req.session.appUser,
      emssToken,
    });
  } else {
    //no mission was specified. check if they are allowed to view at least one mission
    viewPermission =
      req.session?.appUser?.isSuperAdmin ||
      req.session?.appUser?.permissionList?.find((p) => p.permissions.view)?.permissions.view ||
      emssTokenIsValid(emssToken);
  }
  if (!viewPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "readable/mission",
      appUsername: req.session?.appUser?.username,
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
      //super admin and emss token can see all missions
      if (req.session?.appUser?.isSuperAdmin || emssTokenIsValid(emssToken)) {
        records = await getAutomergeMissions();
      } else {
        //return all missions that they have permission for
        const viewableMissions: number[] = req.session.appUser.permissionList.map((p) => {
          if (p.permissions.view) return p.missionId;
        });
        records = await getAutomergeMissions(viewableMissions);
      }
    }

    const exportMissions: ExportMission[] = await Promise.all(
      records.map(async (mission) => {
        const gridCoordinates: MissionGridPoint[][] =
          mission.grid && !mission.usingLGRSCoordinates
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
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

export default router;
