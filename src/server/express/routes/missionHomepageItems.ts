import type { Request, Response } from "express";

import express from "express";
import sortBy from "lodash/sortBy";

import { isSuperUser, logUsername, missionIdsAtLevel } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import { getAutomergeMissions } from "./missionAutomerge";

const router = express.Router();

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const includeArchived = req.query.includeArchived === "true";
  const seesEverything = isSuperUser(req.currentUser);
  const viewableMissions = missionIdsAtLevel(req.currentUser, "viewer");

  if (!seesEverything && viewableMissions.length === 0) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "missionHomepageItems",
      appUsername: logUsername(req.currentUser),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  try {
    // A super user holds no grant rows, so null here means every mission.
    const records = await getHomepageMissionItems(
      seesEverything ? null : viewableMissions,
      includeArchived
    );

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
      appUsername: logUsername(req.currentUser),
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

export default router;

async function getHomepageMissionItems(
  missionIdList: number[] = null,
  includeArchived = false
): Promise<MissionHomepageItem[]> {
  // Get missions from automerge documents in parallel
  const allMissions = await getAutomergeMissions(missionIdList);
  const missions = includeArchived
    ? allMissions
    : allMissions.filter((mission) => !mission.archivedAt);

  const missionHomepageItems: MissionHomepageItem[] = [];

  for (const mission of missions) {
    const runningRex = Object.values(mission.rexes ?? {}).find((rex) => rex.isRunning) ?? null;

    const missionHomepageItem: MissionHomepageItem = {
      id: mission.id,
      name: mission.name,
      runningRex: runningRex,
    };
    missionHomepageItems.push(missionHomepageItem);
  }
  return sortBy(missionHomepageItems, [(item) => item.name.toLowerCase()]);
}
