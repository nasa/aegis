import type { Request, Response } from "express";

import express from "express";

import {
  Mission_Permission_db,
  User_Group_db,
  User_Group_Member_db,
} from "server/database/models/_allModels";
import { apiHasSuperUserOrToken, logUsername } from "utils/permissionsServer";
import { globalValues } from "../../global";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

/** Length cap so the free-text justification cannot be used as unbounded storage. */
const NOTES_MAX_LENGTH = 2000;

const toStore = (group: User_Group_db): UserGroup => ({
  id: group.id,
  name: group.name,
  description: group.description,
  notes: group.notes,
  createdAt: group.createdAt,
  updatedAt: group.updatedAt,
});

// List groups with the counts the admin grid shows
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const groupId = req.query.groupId ? parseInt(req.query.groupId as string, 10) : undefined;

  if (!apiHasSuperUserOrToken(req.currentUser)) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "userGroup",
      appUsername: logUsername(req.currentUser),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const em = globalValues.orm.em;
    const groups = await em.find(User_Group_db, groupId ? { id: groupId } : {}, {
      orderBy: { name: "asc" },
    });

    const summaries: UserGroupSummary[] = [];
    for (const group of groups) {
      summaries.push({
        ...toStore(group),
        memberCount: await em.count(User_Group_Member_db, { groupId: group.id }),
        missionCount: await em.count(Mission_Permission_db, { groupId: group.id }),
      });
    }

    res.status(200).json({ status: "success", message: "Groups retrieved", data: summaries });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "userGroup",
      appUsername: logUsername(req.currentUser),
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// Create or update a group
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { groupId, name, description, notes } = req.body as UserGroupUpsertRequest;

  if (!apiHasSuperUserOrToken(req.currentUser)) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "userGroup",
      appUsername: logUsername(req.currentUser),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    if (notes != null && notes.length > NOTES_MAX_LENGTH) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "userGroup",
        appUsername: logUsername(req.currentUser),
        message: `Notes cannot exceed ${NOTES_MAX_LENGTH} characters`,
      });
      res.status(400).json({
        status: "failure",
        message: `Notes cannot exceed ${NOTES_MAX_LENGTH} characters`,
      });
      return;
    }

    const em = globalValues.orm.em;
    const now = Date.now();

    // Update a group
    if (groupId) {
      const group = await em.findOne(User_Group_db, { id: groupId });
      if (!group) {
        serverLogger.apiRoute({
          logLevel: "notice",
          httpMethod: "POST",
          responseStatus: 404,
          routeName: "userGroup",
          appUsername: logUsername(req.currentUser),
          uuids: [String(groupId)],
          message: "Group not found",
        });
        res.status(404).json({ status: "failure", message: "Group not found" });
        return;
      }

      if (name !== undefined) group.name = name;
      if (description !== undefined) group.description = description;
      if (notes !== undefined) group.notes = notes;
      group.updatedAt = now;
      await em.flush();

      res.status(200).json({ status: "success", message: "Group updated", data: toStore(group) });
      return;
    }

    // Add a new group
    if (!name) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "userGroup",
        appUsername: logUsername(req.currentUser),
        message: "A group name is required",
      });
      res.status(400).json({ status: "failure", message: "A group name is required" });
      return;
    }

    const created = em.create(User_Group_db, {
      name,
      description: description ?? null,
      notes: notes ?? null,
      createdAt: now,
      updatedAt: now,
    });
    await em.flush();

    res.status(200).json({ status: "success", message: "Group created", data: toStore(created) });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "userGroup",
      appUsername: logUsername(req.currentUser),
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// Delete a group. Its permissions and memberships cascade; member rows themselves are untouched.
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { groupId } = req.body as UserGroupDeleteRequest;

  if (!apiHasSuperUserOrToken(req.currentUser)) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "DELETE",
      responseStatus: 401,
      routeName: "userGroup",
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
        httpMethod: "DELETE",
        responseStatus: 404,
        routeName: "userGroup",
        appUsername: logUsername(req.currentUser),
        uuids: [String(groupId)],
        message: "Group not found",
      });
      res.status(404).json({ status: "failure", message: "Group not found" });
      return;
    }

    em.remove(group);
    await em.flush();

    res.status(200).json({ status: "success", message: "Group deleted", data: true });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "DELETE",
      responseStatus: 500,
      routeName: "userGroup",
      appUsername: logUsername(req.currentUser),
      message: `Error processing the DELETE request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the DELETE request ${e}` });
  }
});

export default router;
