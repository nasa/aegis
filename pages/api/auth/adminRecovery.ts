import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { User_db } from "server/database/models/_allModels";
import { getEM, withORM } from "utils/mikro";
import { ironOptions } from "server/session/config";
import { IronSessionData } from "iron-session";
import _ from "lodash";
import { upsertUsers } from "../users";

export default withIronSessionApiRoute(withORM(handler), ironOptions);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WrappedResponse<IronSessionData>>
) {
  try {
    if (req.method == "GET") {
      const recoveryKey = req.query.recoveryKey as string;
      if (recoveryKey === process.env.ADMIN_RECOVERY_KEY) {
        const adminUserDB = await getEM().findOne(User_db, { isSuperAdmin: true });
        const adminUser: User = {
          ...adminUserDB,
          password: "admin",
          createdAt:
            adminUserDB.createdAt instanceof Date &&
            String(adminUserDB.createdAt) !== "Invalid Date"
              ? String(new Date("1969-07-20"))
              : String(new Date(adminUserDB.createdAt)),
          updatedAt: String(new Date()),
        };
        //Add default values back into admin user
        await upsertUsers([adminUser]);
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
