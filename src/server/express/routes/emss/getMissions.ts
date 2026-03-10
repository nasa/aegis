import { asError } from "@emss/utils";
import type { Request, Response } from "express";

import express from "express";

import { Eva_db, Rex_db } from "server/database/models/_allModels";
import { apiRouteLogger } from "utils/logging/serverLogger";
import { globalValues } from "../../global";
import { emssTokenIsValid } from "utils/permissions";
import { getAutomergeMissions } from "../missionAutomerge";

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

// Used by Maestro to get all missions and their EVAs
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

    // Get all automerge mission documents first
    const allMissions = await getAutomergeMissions();
    const activeMissions = allMissions.filter((mission) => !mission.isArchived);

    // Create a mission lookup map by ID for quicker access
    // Only include the active missions
    const missionMap = new Map<number, { name: string; actionSystemVersion: number }>();
    activeMissions.forEach((mission) => {
      missionMap.set(mission.id, {
        name: mission.name,
        actionSystemVersion: mission.actionSystemVersion,
      });
    });

    // Get EVAs that don't have REXes
    const rexEvasSubquery = em.createQueryBuilder(Rex_db).select("evaUuid");
    const evaQuery = em
      .createQueryBuilder(Eva_db, "eva")
      .select(["eva.uuid", "eva.refUuid", "eva.name as evaName", "eva.missionId"])
      .where(`eva.uuid NOT IN (${rexEvasSubquery.getKnexQuery()})`);
    const dbResult = await evaQuery.execute();

    // Transform the result to be grouped by mission
    const missions: MissionsWithEvas = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbResult.forEach((row: any) => {
      const partialMissionData = missionMap.get(row.missionId);
      if (partialMissionData) {
        if (!missions[row.missionId]) {
          // mission hasn't been added yet, add it.
          missions[row.missionId] = {
            missionName: partialMissionData.name,
            missionActionSystemVersion: partialMissionData.actionSystemVersion,
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
      }
    });

    // Lastly, backfill in any active missions that don't have EVAs with a blank array
    activeMissions.forEach((mission: { id: number; name: string; actionSystemVersion: number }) => {
      if (!missions[mission.id]) {
        missions[mission.id] = {
          missionName: mission.name,
          missionActionSystemVersion: mission.actionSystemVersion,
          evas: [],
        };
      }
    });

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
