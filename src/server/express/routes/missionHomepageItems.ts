import express, { Request, Response } from "express";
import sortBy from "lodash/sortBy";
import { Mission_db, Rex_db } from "server/database/models/_allModels";
import { convertRexesTypeDbToStore } from "store/storeUtils/rex";
import { getEM } from "utils/mikro";

const router = express.Router();

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const emssToken = req.headers["emss-token"] as string;
  const viewPermission =
    req.session?.user?.isSuperAdmin ||
    req.session?.user?.permissionList?.find((p) => p.permissions.view)?.permissions.view ||
    (emssToken && emssToken === process.env.EMSS_TOKEN);
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
    missions = await em.find(Mission_db, { isArchived: false });
    rexes = await em.find(Rex_db, {});
  } else {
    missions = await em.find(Mission_db, { id: missionIdList, isArchived: false });
    rexes = await em.find(Rex_db, { mission: missionIdList });
  }

  const missionHomepageItems: MissionHomepageItem[] = [];

  for (const mission of missions) {
    const rexDb = rexes.find((rex) => rex.mission.id === mission.id && rex.isRunning);
    const rex: Rex = rexDb ? convertRexesTypeDbToStore([rexDb])[0] : null;

    const missionHomepageItem: MissionHomepageItem = {
      id: mission.id,
      name: mission.name,
      runningRex: rex,
    };
    missionHomepageItems.push(missionHomepageItem);
  }
  return sortBy(missionHomepageItems, [(item) => item.name.toLowerCase()]);
}
