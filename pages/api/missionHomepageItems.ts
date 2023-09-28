import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { getEM } from "utils/mikro";

import _ from "lodash";
import { Mission as Mission_db } from "server/database/models/mission.model";
import { Rex as Rex_db } from "server/database/models/rex.model";

const handleMissionHomePageItems: NextApiHandler<WrappedResponse<MissionHomepageItem[]>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    //check logged in
    if (!req.session?.user) {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }

    if (req.method === "GET") {
      const viewPermission =
        req.session?.user?.isSuperAdmin ||
        req.session?.user?.permissionList?.find((p) => p.permissions.view)?.permissions.view;

      if (!viewPermission)
        return res.status(401).json({ status: "failure", message: "Unauthorized" });

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

        return res.status(200).json({
          status: "success",
          message: "missionHomepageItems GET successful",
          data: records,
        });
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ status: "error", message: "Error processing the GET request" });
      }
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: "error", message: "Error processing the request" });
  }
};

export default withIronSessionApiRoute(handleMissionHomePageItems, ironOptions);

async function getHomepageMissionItems(
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
    const rexDb = rexes.find((rex) => rex.mission.id === mission.id && rex.rexRunning);

    const rex: Rex = rexDb
      ? {
          missionId: rexDb?.mission.id,
          uuid: rexDb?.uuid,
          name: rexDb?.name,
          description: rexDb?.description,
          petStartStopTimestamp: rexDb?.petStartStopTimestamp,
          petValueAtStartStop: rexDb?.petValueAtStartStop,
          petRunning: rexDb?.petRunning,
          selectedRexEvaUuid: rexDb?.selectedRexEvaUuid,
          rexRunning: rexDb?.rexRunning,
          crewPos: rexDb?.crewPos,
          createdAt: rexDb?.createdAt.toISOString(),
          updatedAt: rexDb?.updatedAt.toISOString(),
        }
      : null;
    const missionHomepageItem: MissionHomepageItem = {
      id: mission.id,
      name: mission.name,
      runningRex: rex,
    };
    missionHomepageItems.push(missionHomepageItem);
  }
  return _.sortBy(missionHomepageItems, "name");
}
