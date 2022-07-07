import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";

import { ironOptions } from "server/session/config";
import { User } from "server/db/Users/models/user";
import { IronSessionData } from "iron-session";

export default withIronSessionApiRoute(handler, ironOptions);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WrappedResponse<IronSessionData>>
) {
  try {
    let loggedIn = false;
    if (req.session.user) {
      loggedIn = true;
    }

    res
      .status(200)
      .json({ status: "success", message: "Login checked", data: { user: req.session.user } });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Unexpected error :" + error });
  }
}
