import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";

export default withIronSessionApiRoute(handler, ironOptions);

import { Config } from "server/db/Config/models/config";

async function handler(req: NextApiRequest, res: NextApiResponse<WrappedResponse<MMGISConfig>>) {
  try {
    if (req.session.user) {
      let config: MMGISConfig;
      if (req.query.mission && !req.query.version) {
        config = await getConfig(req.query.mission as string);
      } else if (req.query.mission && req.query.version) {
        config = await getConfig(
          req.query.mission as string,
          parseInt(req.query.version as string)
        );
      }
      res.status(200).json({
        status: "success",
        message: "config retrieved: " + req.query.mission,
        data: config,
      });
    } else {
      res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to find mission." });
  }
}

async function getConfig(mission: string, version?: number): Promise<MMGISConfig> {
  let missions;
  if (typeof version === "undefined") {
    missions = await Config.findAll({
      limit: 1,
      where: {
        mission: mission,
      },
      order: [["id", "DESC"]],
    });
  } else {
    missions = await Config.findAll({
      limit: 1,
      where: {
        mission: mission,
        version: version,
      },
      order: [["id", "DESC"]],
    });
  }
  return missions;
}
