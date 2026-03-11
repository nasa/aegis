import type { Request, Response } from "express";

import express from "express";
import sortBy from "lodash/sortBy";

import { Rex_db } from "server/database/models/_allModels";
import { convertRexesTypeDbToStore } from "store/storeUtils/rex";
import { emssTokenIsValid } from "utils/permissions";
import { apiRouteLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import { globalValues } from "../global";
import { getAutomergeMissions } from "./missionAutomerge";

const router = express.Router();

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const emssToken = req.headers["emss-token"] as string;
  const viewPermission =
    req.session?.appUser?.isSuperAdmin ||
    req.session?.appUser?.permissionList?.find((p) => p.permissions.view)?.permissions.view ||
    emssTokenIsValid(emssToken);
  if (!viewPermission) {
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "missionHomepageItems",
      appUsername: req.session?.appUser?.username,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  try {
    let records: MissionHomepageItem[];

    //super admin can see all missions
    if (req.session.appUser.isSuperAdmin) {
      records = await getHomepageMissionItems();
    } else {
      //return all missions that they have permission for
      const viewableMissions: number[] = req.session.appUser.permissionList.map((p) => {
        if (p.permissions.view) return p.missionId;
      });
      records = await getHomepageMissionItems(viewableMissions);
    }

    res.status(200).json({
      status: "success",
      message: "missionHomepageItems GET successful",
      data: records,
    });
  } catch (e) {
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "missionHomepageItems",
      appUsername: req.session?.appUser?.username,
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

export default router;

async function getHomepageMissionItems(
  missionIdList: number[] = null
): Promise<MissionHomepageItem[]> {
  const em = globalValues.orm.em;

  // Get missions from automerge documents in parallel
  const allMissions = await getAutomergeMissions(missionIdList);
  // Only include active/non-archived missions
  const missions = allMissions.filter((mission) => !mission.isArchived);

  // Get rexes from database
  let rexes: Rex_db[];
  if (!missionIdList) {
    rexes = await em.find(Rex_db, {}); // all rexes
  } else {
    rexes = await em.find(Rex_db, { missionId: { $in: missionIdList } }); // rexes for specified missions
  }

  const missionHomepageItems: MissionHomepageItem[] = [];

  for (const mission of missions) {
    const runningRexForMission = rexes.find((rex) => rex.missionId === mission.id && rex.isRunning);
    const rex: Rex = runningRexForMission
      ? convertRexesTypeDbToStore([runningRexForMission])[0]
      : null;

    const missionHomepageItem: MissionHomepageItem = {
      id: mission.id,
      name: mission.name,
      runningRex: rex,
    };
    missionHomepageItems.push(missionHomepageItem);
  }
  return sortBy(missionHomepageItems, [(item) => item.name.toLowerCase()]);
}
