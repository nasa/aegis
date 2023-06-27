import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";

import { ironOptions } from "server/session/config";
import { IronSessionData } from "iron-session";

export default withIronSessionApiRoute(handler, ironOptions);

function handler(req: NextApiRequest, res: NextApiResponse<WrappedResponse<IronSessionData>>) {
  try {
    if (req.session.user && (req.session.user.id === 1 || req.session.user.adminPermission)) {
      res.status(200).json({
        status: "success",
        message: "Admin Verified",
        data: { admin: true, user: req.session.user },
      });
    } else {
      res
        .status(200)
        .json({ status: "failure", message: "Admin Access Restricted", data: { admin: false } });
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: "Unexpected error :" + error });
  }
}
