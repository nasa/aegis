import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";

import { Config } from "server/db/Config/models/config";

export default withIronSessionApiRoute(handler, ironOptions);

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    if (req.session.user) {
      const allConfigs = await getConfigs();

      res.status(200).json(allConfigs);
    } else {
      res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  } catch (error) {
    res.status(500).json({ status: "failure", message: "Failed to find missions." });
  }
}

async function getConfigs() {
  const configs = await Config.aggregate("mission", "DISTINCT", { plain: false });
  let allConfigs = [];
  for (let i = 0; i < configs.length; i++) allConfigs.push(configs[i].DISTINCT);
  allConfigs.sort();
  return allConfigs;
}
