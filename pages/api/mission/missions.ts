import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import { Mission } from "server/database/models/mission.model";

export const handleAllMissionJson: NextApiHandler<WrappedResponse<AEGISMission[]>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    if (req.session?.user) {
      const missions = await getAllMissions();
      return res.status(200).json({
        status: "success",
        message: "missions retrieved",
        data: missions,
      });
    } else {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Failed to find missions." });
  }
};

export default withIronSessionApiRoute(Mikro.withORM(handleAllMissionJson), ironOptions);

export async function getAllMissions(): Promise<AEGISMission[]> {
  const model = Mikro.getEM();
  return await model.find(Mission, {});
}
