import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";

import { ironOptions } from "server/session/config";
import { IronSessionData } from "iron-session";
import bcrypt from "bcryptjs";
import { upsertUser } from "../../../http-client/user";

export default withIronSessionApiRoute(handler, ironOptions);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WrappedResponse<IronSessionData>>
) {
  try {
    if (req.method == "POST") {
      const recoveryKey = req.body.recoveryKey;
      if (recoveryKey === process.env.ADMIN_RECOVERY_KEY) {
        //Add default values back into admin user
        upsertUser({
          id: 1,
          username: "admin",
          password: await bcrypt.hash("admin", 10),
          email: "admin@localhost",
          permissionList: [],
          adminPermission: true,
        });
      }
    } else {
      throw new Error("Method not allowed");
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: "Unexpected error :" + error });
  }
}
