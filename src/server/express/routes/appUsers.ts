import type { Request, Response } from "express";

import express from "express";

import {
  App_User_db,
  Mission_Permission_db,
  User_Group_Member_db,
} from "server/database/models/_allModels";
import { promoteKnownUserById, promoteToAppUser } from "server/database/access/userDirectory";
import { isSuperUser, logUsername } from "utils/permissions";
import { PUBLIC_UUPIC } from "utils/permissionLevels";
import { globalValues } from "../global";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

export const toAppUserStore = (user: App_User_db): AppUser => ({
  id: user.id,
  uupic: user.uupic,
  auid: user.auid,
  displayName: user.displayName,
  isSystem: user.isSystem,
  lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
});

// Get a list of managed users, optionally with the counts the admin grid shows
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;
  const includeGrants = req.query.includeGrants === "true";

  if (!isSuperUser(req.currentUser)) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "appUsers",
      appUsername: logUsername(req.currentUser),
      uuids: userId ? [userId.toString()] : [],
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const em = globalValues.orm.em;
    const users = await em.find(App_User_db, userId ? { id: userId } : {});

    if (!includeGrants) {
      res
        .status(200)
        .json({ status: "success", message: "Users retrieved", data: users.map(toAppUserStore) });
      return;
    }

    const summaries: AppUserSummary[] = [];
    for (const user of users) {
      summaries.push({
        ...toAppUserStore(user),
        groupCount: await em.count(User_Group_Member_db, { userId: user.id }),
        missionCount: await em.count(Mission_Permission_db, { userId: user.id }),
      });
    }

    res.status(200).json({ status: "success", message: "Users retrieved", data: summaries });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "appUsers",
      appUsername: logUsername(req.currentUser),
      uuids: userId ? [userId.toString()] : [],
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// Promote a known identity into the managed table
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { knownUserId, uupic, auid, displayName } = req.body as {
    knownUserId?: number;
    uupic?: string;
    auid?: string;
    displayName?: string;
  };

  if (!isSuperUser(req.currentUser)) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "appUsers",
      appUsername: logUsername(req.currentUser),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const em = globalValues.orm.em;

    let promoted: App_User_db | null = null;
    if (knownUserId) {
      promoted = await promoteKnownUserById(em, knownUserId);
    } else if (uupic) {
      promoted = await promoteToAppUser(em, {
        uupic,
        auid: auid ?? uupic,
        displayName: displayName ?? uupic,
      });
    }

    if (!promoted) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "appUsers",
        appUsername: logUsername(req.currentUser),
        message: "No matching known user to promote",
      });
      res
        .status(400)
        .json({ status: "failure", message: "No matching known user to promote", data: null });
      return;
    }

    res
      .status(200)
      .json({ status: "success", message: "User promoted", data: toAppUserStore(promoted) });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "appUsers",
      appUsername: logUsername(req.currentUser),
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// Delete managed users; grants and memberships cascade
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { userIds } = req.body as { userIds: number[] };

  if (!isSuperUser(req.currentUser)) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "DELETE",
      responseStatus: 401,
      routeName: "appUsers",
      appUsername: logUsername(req.currentUser),
      uuids: userIds?.map((id) => id.toString()),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const em = globalValues.orm.em;
    const users = await em.find(App_User_db, { id: { $in: userIds ?? [] } });

    // The reserved Public row holds the baseline grants union-ed into every user's access and has
    // no Launchpad identity to fall back to.
    if (users.some((u) => u.uupic === PUBLIC_UUPIC || u.isSystem)) {
      serverLogger.apiRoute({
        logLevel: "warning",
        httpMethod: "DELETE",
        responseStatus: 400,
        routeName: "appUsers",
        appUsername: logUsername(req.currentUser),
        uuids: userIds?.map((id) => id.toString()),
        message: "Cannot delete a reserved user",
      });
      res.status(400).json({ status: "failure", message: "Cannot delete a reserved user" });
      return;
    }

    for (const user of users) em.remove(user);
    await em.flush();

    res.status(200).json({ status: "success", message: "Users deleted", data: users.length });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "DELETE",
      responseStatus: 500,
      routeName: "appUsers",
      appUsername: logUsername(req.currentUser),
      uuids: userIds?.map((id) => id.toString()),
      message: `Error processing the DELETE request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the DELETE request ${e}` });
  }
});

export default router;
