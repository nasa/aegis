import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import { Mission } from "server/database/models/mission.model";

export default withIronSessionApiRoute(Mikro.withORM(handler), ironOptions);

async function handler(
    req: NextApiRequest,
    res: NextApiResponse<WrappedResponse<MMGISConfigListItem[]>>
) {
    const {
        query: { id: missionId },
    } = req
    try {
        if (req.session.user) {
            const model = Mikro.getEM();
            let id = parseInt(missionId as string);
            const mission = await model.find(Mission, {id});

            res.status(200).json({
                status: "success",
                message: "missions retrieved",
                data: mission,
            });
        } else {
            res.status(401).json({ status: "failure", message: "Unauthorized" });
        }
    } catch (error) {
        res.status(500).json({ status: "error", message: "Failed to find mission." });
    }
}