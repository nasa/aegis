import type { Request, Response } from "express";

import express from "express";

import { emssTokenIsValid } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import { getMissionSummaries } from "server/automerge/missionCatalog";

const router = express.Router();

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const emssToken = req.headers["emss-token"] as string;
  const viewPermission =
    req.session?.appUser?.isSuperAdmin ||
    req.session?.appUser?.permissionList?.find((p) => p.permissions.view)?.permissions.view ||
    emssTokenIsValid(emssToken);
  if (!viewPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
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
    if (req.session?.appUser?.isSuperAdmin || emssTokenIsValid(emssToken)) {
      records = await getHomepageMissionItems();
    } else {
      //return all missions that they have permission for
      const viewableMissions = req.session.appUser.permissionList
        .filter((p) => p.permissions.view)
        .map((p) => p.missionId);
      records = await getHomepageMissionItems(viewableMissions);
    }

    res.status(200).json({
      status: "success",
      message: "missionHomepageItems GET successful",
      data: records,
    });
  } catch (e) {
    serverLogger.apiRoute({
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

async function getHomepageMissionItems(missionIdList?: number[]): Promise<MissionHomepageItem[]> {
  const started = Date.now();
  const missions = await getMissionSummaries(missionIdList);
  serverLogger.debug({
    logId: "mission-catalog",
    logValue: "Homepage mission list served from SQL catalog",
    missions: missions.length,
    runningRexes: missions.filter((mission) => mission.runningRex).length,
    durationMs: Date.now() - started,
  });
  return missions.map(({ id, name, runningRex }) => ({ id, name, runningRex }));
}
