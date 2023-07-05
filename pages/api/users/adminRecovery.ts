import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";

import { ironOptions } from "server/session/config";
import { IronSessionData } from "iron-session";
import _ from "lodash";
import { upsertUser } from "./index";

export default withIronSessionApiRoute(handler, ironOptions);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WrappedResponse<IronSessionData>>
) {
  try {
    if (req.method == "GET") {
      const recoveryKey = req.query.recoveryKey as string;
      if (recoveryKey === process.env.ADMIN_RECOVERY_KEY) {
        //Add default values back into admin user
        await upsertUser({
          id: 1,
          username: "admin",
          password: "admin",
          email: "admin@localhost",
          permissionList: [],
          adminPermission: true,
        });
        res.status(200).json({ status: "success", message: "Admin user updated" });
      } else {
        res.status(500).json({ status: "error", message: "Recovery Key does not match" });
      }
    } else {
      throw new Error("Method not allowed");
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: "Unexpected error :" + error });
  }
}
