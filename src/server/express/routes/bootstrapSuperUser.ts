import type { Request, Response } from "express";

import express from "express";

import {
  App_User_db,
  User_Group_db,
  User_Group_Member_db,
} from "server/database/models/_allModels";
import { promoteToAppUser } from "server/database/access/userDirectory";
import { emssTokenIsValid } from "utils/permissions";
import { SUPER_USER_GROUP_NAME } from "utils/permissionLevels";
import { globalValues } from "../global";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

/**
 * Seeds membership of the reserved superUser group.
 *
 * With no password login and an empty group, a fresh deployment has nobody who can administer
 * anything. This endpoint is authenticated on the EMSS token alone and stays callable
 * indefinitely so the group can be repopulated if it is ever emptied. It deliberately offers no
 * removal; that is done through the admin UI.
 *
 * This is the one path that may create a managed user for someone who has never logged in.
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const emssToken = req.headers["emss-token"] as string;
  const { users } = req.body as {
    users: { uupic: string; auid: string; displayName: string }[];
  };

  if (!emssTokenIsValid(emssToken)) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "bootstrap/superUser",
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    if (!users?.length) {
      res.status(400).json({ status: "failure", message: "No users provided in request body" });
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "bootstrap/superUser",
        message: "No users provided in request body",
      });
      return;
    }

    const em = globalValues.orm.em;
    const group = await em.findOne(User_Group_db, { name: SUPER_USER_GROUP_NAME });
    if (!group) {
      serverLogger.apiRoute({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "bootstrap/superUser",
        message: "The superUser group is missing",
        error: new Error("The superUser group is missing"),
      });
      res.status(500).json({ status: "error", message: "The superUser group is missing" });
      return;
    }

    for (const entry of users) {
      if (!entry?.uupic) continue;
      const appUser = await promoteToAppUser(em, {
        uupic: entry.uupic,
        auid: entry.auid ?? entry.uupic,
        displayName: entry.displayName ?? entry.uupic,
      });

      const already = await em.findOne(User_Group_Member_db, {
        groupId: group.id,
        userId: appUser.id,
      });
      if (!already) {
        const now = new Date();
        em.create(User_Group_Member_db, {
          groupId: group.id,
          userId: appUser.id,
          createdAt: now,
          updatedAt: now,
        });
        await em.flush();
      }
    }

    const members = await em.find(User_Group_Member_db, { groupId: group.id });
    const memberUsers = await em.find(App_User_db, { id: { $in: members.map((m) => m.userId) } });

    res.status(200).json({
      status: "success",
      message: "superUser membership seeded",
      data: memberUsers.map((u) => ({
        id: u.id,
        uupic: u.uupic,
        auid: u.auid,
        displayName: u.displayName,
      })),
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "bootstrap/superUser",
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

export default router;
