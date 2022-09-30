import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import { Mission } from "server/database/models/mission.model";

export const handleMissionJson: NextApiHandler = async (
  req: NextApiRequest,
  res: NextApiResponse<WrappedResponse<Mission>>
): Promise<unknown> => {
  const {
    query: { id: missionId },
  } = req;
  const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);
  if (typeof intMissionId !== "number") {
    return res.status(500).json({ status: "error", message: "Mission ID must be integer." });
  }
  try {
    if (req.session?.user) {
      const mission = await getMissionById(intMissionId);
      await Mikro.closeORM();
      if (!mission) {
        return res.status(404).json({ status: "failure", message: "Mission not found" });
      }

      return res.status(200).json({
        status: "success",
        message: "missions retrieved",
        data: mission,
      });
    } else {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Failed to find mission." });
  }
};

export default withIronSessionApiRoute(Mikro.withORM(handleMissionJson), ironOptions);

export async function getMissionById(missionId: number): Promise<Mission | false> {
  await Mikro.getORM();
  const model = await Mikro.getEM();
  const missions = await model.find(Mission, { id: missionId });

  if (missions.length === 0) {
    return false;
  }

  if (missions.length > 1) {
    console.error(`Multiple missions found with ID = ${missionId}`);
  }
  return missions[0];
}
