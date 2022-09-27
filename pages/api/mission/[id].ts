import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import { Mission } from "server/database/models/mission.model";

export default withIronSessionApiRoute(Mikro.withORM(handler), ironOptions);

async function handler(
    req: NextApiRequest,
    res: NextApiResponse<WrappedResponse<AEGISMission>>
): Promise<WrappedResponse<AEGISMission>> {
  return returnMissionJson(req, res);
}

export async function returnMissionJson(req, res) {
    const {
        query: { id: missionId },
    } = req
    try {
        if (req.session?.user) {
            const mission = await getMissionById(missionId);
            if (mission.length === 1) {
                return res.status(200).json({
                    status: "success",
                    message: "missions retrieved",
                    data: mission,
                });
            } else {
                throw new Error('Mission not found');
            }
        } else {
            return res.status(401).json({ status: "failure", message: "Unauthorized" });
        }
    } catch (error) {
        return res.status(500).json({ status: "error", message: "Failed to find mission." });
    }
}

export async function getMissionById(missionId: number): Promise<AEGISMission[]> {
    const model = Mikro.getEM();
    return await model.find(Mission, {id: missionId});
}