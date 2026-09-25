import type { Request, Response } from "express";

import express from "express";

import {
  App_User_db,
  User_Group_db,
  User_Group_Member_db,
} from "server/database/models/_allModels";
import { apiHasSuperUserOrToken, logUsername } from "utils/permissionsServer";
import { PUBLIC_UUPIC } from "utils/permissionsClient";
import { globalValues } from "../../global";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

/**
 * Group membership.
 *   ?groupId= the members of one group
 *   ?userId=  the groups one user belongs to
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const groupId = req.query.groupId ? parseInt(req.query.groupId as string, 10) : undefined;
  const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;

  if (!apiHasSuperUserOrToken(req.currentUser)) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "userGroup/member",
      appUsername: logUsername(req.currentUser),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  if (groupId === undefined && userId === undefined) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "userGroup/member",
      appUsername: logUsername(req.currentUser),
      message: "Either groupId or userId must be supplied",
    });
    res
      .status(400)
      .json({ status: "failure", message: "Either groupId or userId must be supplied" });
    return;
  }

  try {
    const em = globalValues.orm.em;

    // The groups one user belongs to, so the user detail page needs one request rather than one
    // membership lookup per group.
    if (userId !== undefined) {
      const memberships = await em.find(User_Group_Member_db, { userId });
      const groups = memberships.length
        ? await em.find(
            User_Group_db,
            { id: { $in: memberships.map((m) => m.groupId) } },
            { orderBy: { name: "asc" } }
          )
        : [];

      const data: UserGroup[] = groups.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      }));

      res.status(200).json({ status: "success", message: "Memberships retrieved", data });
      return;
    }

    const members = await em.find(User_Group_Member_db, { groupId });
    const users = members.length
      ? await em.find(
          App_User_db,
          { id: { $in: members.map((m) => m.userId) } },
          { orderBy: { displayName: "asc" } }
        )
      : [];

    const data: AppUser[] = users.map((u) => ({
      id: u.id,
      uupic: u.uupic,
      auid: u.auid,
      displayName: u.displayName,
      isSystem: u.isSystem,
      lastLoginAt: u.lastLoginAt ?? null,
    }));

    res.status(200).json({ status: "success", message: "Members retrieved", data });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "userGroup/member",
      appUsername: logUsername(req.currentUser),
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// Add or remove a member
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { groupId, userId, action } = req.body as UserGroupMemberRequest;

  if (!apiHasSuperUserOrToken(req.currentUser)) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "userGroup/member",
      appUsername: logUsername(req.currentUser),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const em = globalValues.orm.em;
    const group = await em.findOne(User_Group_db, { id: groupId });
    if (!group) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 404,
        routeName: "userGroup/member",
        appUsername: logUsername(req.currentUser),
        uuids: [String(groupId)],
        message: "Group not found",
      });
      res.status(404).json({ status: "failure", message: "Group not found" });
      return;
    }

    if (action === "remove") {
      await em.nativeDelete(User_Group_Member_db, { groupId, userId });
      res.status(200).json({ status: "success", message: "Member removed", data: true });
      return;
    }

    const target = await em.findOne(App_User_db, { id: userId });
    if (!target) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 404,
        routeName: "userGroup/member",
        appUsername: logUsername(req.currentUser),
        uuids: [String(userId)],
        message: "User not found",
      });
      res.status(404).json({ status: "failure", message: "User not found" });
      return;
    }

    // Public contributes grants only. Membership would make the baseline union recursive.
    if (target.uupic === PUBLIC_UUPIC) {
      serverLogger.apiRoute({
        logLevel: "warning",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "userGroup/member",
        appUsername: logUsername(req.currentUser),
        message: "The Public user cannot join a group",
      });
      res.status(400).json({ status: "failure", message: "The Public user cannot join a group" });
      return;
    }

    const already = await em.findOne(User_Group_Member_db, { groupId, userId: target.id });
    if (!already) {
      const now = Date.now();
      em.create(User_Group_Member_db, {
        groupId,
        userId: target.id,
        createdAt: now,
        updatedAt: now,
      });
      await em.flush();
    }

    res.status(200).json({ status: "success", message: "Member added", data: true });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "userGroup/member",
      appUsername: logUsername(req.currentUser),
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

export default router;
