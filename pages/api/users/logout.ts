import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";

import { ironOptions } from "server/session/config";

export default withIronSessionApiRoute(handler, ironOptions);

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    req.session.destroy();

    res.status(200).json(true);
  } catch (error) {
    res.status(500).json({ status: "error", message: "Unexpected error :" + error });
  }
}
