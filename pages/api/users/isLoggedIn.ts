import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";

import { ironOptions } from "server/session/config";
import { IronSessionData } from "iron-session";
import { getEM, withORM } from "../../../utils/mikro";
import { User } from "../../../server/database/models/user.model";

export default withIronSessionApiRoute(withORM(handler), ironOptions);
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WrappedResponse<IronSessionData>>
) {
  try {
    if (req.session.user) {
      const model = getEM();
      const { id } = req.session.user;
      const user = await model.findOne(User, { id });

      //Get the latest user data to refresh the session information.
      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        permissionList: user.permissionList,
        adminPermission: user.adminPermission,
      };

      res.status(200).json({
        status: "success",
        message: "Login checked",
        data: { user: req.session.user },
      });
    } else {
      res.status(200).json({ status: "failure", message: "Not Logged in", data: { user: null } });
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: "Unexpected error :" + error });
  }
}
