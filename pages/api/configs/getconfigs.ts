import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";

import { getMMGISSequelizeConnection } from "server/db/connection";

export default withIronSessionApiRoute(handler, ironOptions);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WrappedResponse<MMGISConfigListItem[]>>
) {
  try {
    if (req.session.user) {
      const configList = await getConfigs();

      res.status(200).json({
        status: "success",
        message: "configs retrieved",
        data: configList,
      });
    } else {
      res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to find missions." });
  }
}

async function getConfigs(): Promise<MMGISConfigListItem[]> {
  const sequelize = getMMGISSequelizeConnection();

  const missions = await sequelize.query(
    `select DISTINCT ON (mission) id, mission, version, "createdAt" from configs ORDER BY mission DESC`,
    {
      type: sequelize.QueryTypes.SELECT,
    }
  );

  return missions;
}
