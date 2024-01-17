import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";

import { ironOptions } from "utils/ironSession";

export default withIronSessionApiRoute(handler, ironOptions);

async function handler(req: NextApiRequest, res: NextApiResponse<WrappedResponse<boolean>>) {
  try {
    req.session.destroy();

    res.status(200).json({ status: "success", message: "Logged out", data: true });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Unexpected error :" + error, data: false });
  }
}
