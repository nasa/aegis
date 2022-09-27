import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import { Mission } from "server/database/models/mission.model";

export default withIronSessionApiRoute(Mikro.withORM(handler), ironOptions);

async function handler(
    req: NextApiRequest,
    res: NextApiResponse<WrappedResponse<AEGISMission[]>>
): Promise<WrappedResponse<AEGISMission[]>> {
    return returnAllMissionsJson(req, res)
}

export async function returnAllMissionsJson(req, res): Promise<WrappedResponse<AEGISMission[]>> {
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
}

export async function getAllMissions(): Promise<AEGISMission[]> {
    const model = Mikro.getEM();
    return await model.find(Mission, {});
}