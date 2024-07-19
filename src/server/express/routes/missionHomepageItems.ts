import express, { Request, Response } from "express";
import _ from "lodash";
import { Mission_db, Rex_db } from "server/database/models/_allModels";
import { getEM } from "utils/mikro";

const router = express.Router();

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const viewPermission =
    req.session?.user?.isSuperAdmin ||
    req.session?.user?.permissionList?.find((p) => p.permissions.view)?.permissions.view;
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  try {
    let records: MissionHomepageItem[];

    //super admin can see all missions
    if (req.session.user.isSuperAdmin) {
      records = await getHomepageMissionItems();
    } else {
      //return all missions that they have permission for
      const viewableMissions: number[] = req.session.user.permissionList.map((p) => {
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
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

export default router;

export async function getHomepageMissionItems(
  missionIdList: number | number[] = null
): Promise<MissionHomepageItem[]> {
  const em = getEM();
  let missions: Mission_db[];
  let rexes: Rex_db[];
  if (!missionIdList) {
    missions = await em.find(Mission_db, {});
    rexes = await em.find(Rex_db, {});
  } else {
    missions = await em.find(Mission_db, { id: missionIdList });
    rexes = await em.find(Rex_db, { mission: missionIdList });
  }

  const missionHomepageItems: MissionHomepageItem[] = [];

  for (const mission of missions) {
    const rexDb = rexes.find((rex) => rex.mission.id === mission.id && rex.isRunning);

    const rex: Rex = rexDb
      ? {
          missionId: rexDb.mission.id,
          uuid: rexDb.uuid,
          name: rexDb.name,
          description: rexDb.description,
          petStartStopTimestamp: rexDb.petStartStopTimestamp,
          petValueAtStartStop: rexDb.petValueAtStartStop,
          petRunning: rexDb.petRunning,
          evaUuid: rexDb.evaUuid,
          isRunning: rexDb.isRunning,
          posEntries: rexDb.posEntries,
          posTypes: rexDb.posTypes,
          stationEntries: rexDb.stationEntries,
          traverseEntries: rexDb.traverseEntries,
          actionEntries: rexDb.actionEntries,
          createdAt: rexDb.createdAt.toISOString(),
          updatedAt: rexDb.updatedAt.toISOString(),
        }
      : null;
    const missionHomepageItem: MissionHomepageItem = {
      id: mission.id,
      name: mission.name,
      runningRex: rex,
    };
    missionHomepageItems.push(missionHomepageItem);
  }
  return _.sortBy(missionHomepageItems, [(item) => item.name.toLowerCase()]);
}
