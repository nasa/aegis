import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";

import { ironOptions } from "server/session/config";
import { IronSessionData } from "iron-session";
import _ from "lodash";
import bcrypt from "bcryptjs";
import { User as User_db } from "server/database/models/user.model";
import { getEM } from "utils/mikro";
import { EntityData } from "@mikro-orm/core";
import { roundDateToSecond } from "utils/formatting";

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
        await upsertAdmin();
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

/**
 * Inserts or Updates a user into the database
 * @returns a copy of the user object that was upserted
 * @param user
 */
async function upsertAdmin(): Promise<User> {
  const adminCreds: User = {
    id: 1,
    username: "admin",
    password: await bcrypt.hash("admin", 10),
    email: "admin@localhost",
    permissionList: [],
    adminPermission: true,
  };

  const em = getEM();
  const userCopy: User = _.cloneDeep(adminCreds);
  const salt = await bcrypt.genSalt();

  const upsertRecord: EntityData<User_db> = {
    ...userCopy,
    updatedAt: new Date(userCopy.updatedAt),
    createdAt: new Date(userCopy.createdAt),
  };

  if (String(upsertRecord.createdAt) === "Invalid Date") {
    upsertRecord.createdAt = new Date("1969-07-20");
  }

  const updateDate = roundDateToSecond(new Date());
  upsertRecord.updatedAt = updateDate;

  let existingUser = await em.findOne(User_db, { id: userCopy.id });

  if (!existingUser) {
    return null;
  }
  upsertRecord.permissionList = existingUser.permissionList;
  if (userCopy.password !== existingUser.password) {
    upsertRecord.password = await bcrypt.hash("admin", salt);
  }

  existingUser = em.assign(existingUser, upsertRecord);
  await em.persistAndFlush(existingUser);
  return {
    ...userCopy,
    updatedAt: existingUser.updatedAt.toISOString(),
    createdAt: existingUser.createdAt.toISOString(),
  } as User;
}
