import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import { Layer } from "../../../server/database/models/layer.model";
import { Mission } from "../../../server/database/models/mission.model";

export const handleLayerJson: NextApiHandler = async (
  req: NextApiRequest,
  res: NextApiResponse<WrappedArrayResponse<Layer>>
): Promise<unknown> => {
  const {
    query: { id: missionId },
  } = req;
  const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);
  try {
    if (req.session?.user) {
      const layers = await getAllLayersByMission(intMissionId);
      await Mikro.closeORM();
      if (!layers) {
        return res.status(404).json({ status: "failure", message: "Layers not found" });
      }

      return res.status(200).json({
        status: "success",
        message: "layers retrieved",
        data: layers,
      });
    } else {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Failed to find layers." });
  }
};

export default withIronSessionApiRoute(Mikro.withORM(handleLayerJson), ironOptions);

export async function getAllLayersByMission(mission_id: number): Promise<Layer[] | false> {
  await Mikro.getORM();
  const model = await Mikro.getEM();
  const mission = await model.find(Mission, mission_id);
  const layers: false | Layer[] = await model.find(Layer, { mission });
  if (layers.length === 0) {
    return null;
  }
  return layers;
}
