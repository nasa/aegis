import { asError } from "@emss/utils";
import type { Request, Response } from "express";

import express from "express";

import { Eva_db, Mission_db, Rex_db } from "server/database/models/_allModels";
import { apiRouteLogger } from "utils/logging/serverLogger";
import { globalValues } from "../../global";
import { emssTokenIsValid } from "utils/permissions";

export type MissionsWithEvas = {
  [missionId: number]: {
    missionName: string;
    missionActionSystemVersion: number;
    evas: {
      refUuid: string;
      evaName: string;
    }[];
  };
};

const router = express.Router();

// Used by Maestro to get all action system version 2 missions and their EVAs
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const emssToken = req.headers["emss-token"] as string;

  // Check if user has EMSS permissions
  const viewPermissions = emssTokenIsValid(emssToken);

  if (!viewPermissions) {
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "emss/getMissions",
      message: "Unauthorized access attempt",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const em = globalValues.orm.em;

    const rexEvasSubquery = em.createQueryBuilder(Rex_db).select("evaUuid");
    const evaQuery = em
      .createQueryBuilder(Eva_db, "eva")
      .select([
        "eva.uuid",
        "eva.refUuid",
        "eva.name as evaName",
        "mission.id as missionId",
        "mission.name as missionName",
        "mission.action_system_version as missionActionSystemVersion",
      ])
      .leftJoin("eva.mission", "mission")
      .where("mission.is_archived = ?", [false])
      .andWhere(`eva.uuid NOT IN (${rexEvasSubquery.getKnexQuery()})`);
    const dbResult = await evaQuery.execute();

    // Transform the result to be grouped by mission
    const missions: MissionsWithEvas = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbResult.forEach((row: any) => {
      if (!missions[row.missionId]) {
        missions[row.missionId] = {
          missionName: row.missionName,
          missionActionSystemVersion: row.missionActionSystemVersion,
          evas: [
            {
              refUuid: row.refUuid,
              evaName: row.evaName,
            },
          ],
        };
      } else {
        // add the eva to this mission
        missions[row.missionId].evas.push({
          refUuid: row.refUuid,
          evaName: row.evaName,
        });
      }
    });

    // Grab any v2 missions that do not have evas
    const allMissionsQuery = em
      .createQueryBuilder(Mission_db)
      .select(["id", "name", "actionSystemVersion"])
      .where({ isArchived: false });
    const allMissions = await allMissionsQuery.execute();
    if (allMissions.length > 0) {
      allMissions.forEach((mission: { id: number; name: string; actionSystemVersion: number }) => {
        // add mission to the missions object if it wasn't already there
        if (!missions[mission.id]) {
          missions[mission.id] = {
            missionName: mission.name,
            missionActionSystemVersion: mission.actionSystemVersion,
            evas: [],
          };
        }
      });
    }

    res.status(200).json({
      status: "success",
      message: `Missions and their EVAs retrieved`,
      data: missions,
    });
  } catch (e) {
    apiRouteLogger({
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

export default router;
