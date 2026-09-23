import type { Request, Response } from "express";

import express from "express";

import {
  App_User_db,
  Mission_Permission_db,
  User_Group_db,
  User_Group_Member_db,
} from "server/database/models/_allModels";
import { apiHasSuperUserOrToken, logUsername } from "utils/permissionsServer";
import { PERMISSION_RANK, PUBLIC_UUPIC } from "utils/permissionsClient";
import { globalValues } from "../../global";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

/** Length cap so the free-text justification cannot be used as unbounded storage. */
const NOTES_MAX_LENGTH = 2000;

/**
 * Get permissions with respect to missions, users and groups. Exactly one selector is expected:
 *   ?missionId= every user and group holding a grant on this mission, group members expanded
 *   ?userId=    every mission this user can reach, with all contributing grants
 *   ?groupId=   every mission this group grants
 *   ?public=true every mission the reserved Public user can reach
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const missionId = req.query.missionId ? parseInt(req.query.missionId as string, 10) : undefined;
  const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;
  const groupId = req.query.groupId ? parseInt(req.query.groupId as string, 10) : undefined;
  const publicOnly = req.query.public === "true";

  if (!apiHasSuperUserOrToken(req.currentUser)) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "missionPermission",
      appUsername: logUsername(req.currentUser),
      missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  if (missionId === undefined && userId === undefined && groupId === undefined && !publicOnly) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "missionPermission",
      appUsername: logUsername(req.currentUser),
      message: "One of missionId, userId, groupId or public must be supplied",
    });
    res.status(400).json({
      status: "failure",
      message: "One of missionId, userId, groupId or public must be supplied",
    });
    return;
  }

  try {
    const em = globalValues.orm.em;

    // Everyone holding a grant on one mission. Group subjects carry their members, so an admin
    // can answer "who can see this mission?" without opening each group.
    if (missionId !== undefined) {
      const grants = await em.find(Mission_Permission_db, { missionId });
      const users = await em.find(App_User_db, {
        id: { $in: grants.filter((g) => g.userId).map((g) => g.userId) },
      });
      const grantedGroupIds = grants.filter((g) => g.groupId).map((g) => g.groupId);
      const groups = await em.find(User_Group_db, { id: { $in: grantedGroupIds } });

      const memberships = grantedGroupIds.length
        ? await em.find(User_Group_Member_db, { groupId: { $in: grantedGroupIds } })
        : [];
      const memberUsers = memberships.length
        ? await em.find(App_User_db, { id: { $in: memberships.map((m) => m.userId) } })
        : [];

      const subjects: MissionAccessSubject[] = grants.map((grant) => {
        if (grant.userId) {
          const user = users.find((u) => u.id === grant.userId);
          return {
            subjectType: "user",
            subjectId: grant.userId,
            subjectName: user?.displayName ?? String(grant.userId),
            subjectAuid: user?.auid,
            permLevel: grant.permLevel,
            notes: grant.notes,
            grantedBy: grant.grantedBy,
          };
        }
        const group = groups.find((g) => g.id === grant.groupId);
        const members = memberships
          .filter((m) => m.groupId === grant.groupId)
          .map((m) => memberUsers.find((u) => u.id === m.userId))
          .filter((u) => !!u)
          .map((u) => ({ id: u.id, displayName: u.displayName, auid: u.auid }));
        return {
          subjectType: "group",
          subjectId: grant.groupId,
          subjectName: group?.name ?? String(grant.groupId),
          permLevel: grant.permLevel,
          notes: grant.notes,
          grantedBy: grant.grantedBy,
          members,
        };
      });

      const publicUser = await em.findOne(App_User_db, { uupic: PUBLIC_UUPIC });
      const data: MissionAccessSummary = {
        subjects,
        isPublic: !!publicUser && grants.some((g) => g.userId === publicUser.id),
        publicUserId: publicUser?.id ?? null,
      };

      res.status(200).json({ status: "success", message: "Mission access retrieved", data });
      return;
    }

    // Every mission one user can reach. All contributions are returned, not just the winner,
    // so the admin UI can show a direct grant that a group currently out-ranks.
    if (userId !== undefined) {
      const byMission = new Map<number, MissionAccessContribution[]>();

      const add = (missionIdKey: number, contribution: MissionAccessContribution): void => {
        const existing = byMission.get(missionIdKey);
        if (existing) existing.push(contribution);
        else byMission.set(missionIdKey, [contribution]);
      };

      const direct = await em.find(Mission_Permission_db, { userId });
      for (const grant of direct) {
        add(grant.missionId, {
          source: "direct",
          permLevel: grant.permLevel,
          notes: grant.notes,
          isEffective: false,
        });
      }

      const memberships = await em.find(User_Group_Member_db, { userId });
      if (memberships.length) {
        const groupIds = memberships.map((m) => m.groupId);
        const groups = await em.find(User_Group_db, { id: { $in: groupIds } });
        const groupGrants = await em.find(Mission_Permission_db, { groupId: { $in: groupIds } });
        for (const grant of groupGrants) {
          add(grant.missionId, {
            source: "group",
            permLevel: grant.permLevel,
            groupId: grant.groupId,
            groupName: groups.find((g) => g.id === grant.groupId)?.name,
            notes: grant.notes,
            isEffective: false,
          });
        }
      }

      // The public baseline is union-ed into everyone's access.
      const publicUser = await em.findOne(App_User_db, { uupic: PUBLIC_UUPIC });
      if (publicUser && publicUser.id !== userId) {
        const publicGrants = await em.find(Mission_Permission_db, { userId: publicUser.id });
        for (const grant of publicGrants) {
          add(grant.missionId, {
            source: "public",
            permLevel: grant.permLevel,
            notes: grant.notes,
            isEffective: false,
          });
        }
      }

      const data: ResolvedMissionAccess[] = [...byMission.entries()].map(
        ([resolvedMissionId, contributions]) => {
          const topRank = Math.max(...contributions.map((c) => PERMISSION_RANK[c.permLevel]));
          for (const contribution of contributions) {
            contribution.isEffective = PERMISSION_RANK[contribution.permLevel] === topRank;
          }
          const effective = contributions.find((c) => c.isEffective);
          return {
            missionId: resolvedMissionId,
            effectivePermLevel: effective.permLevel,
            contributions,
          };
        }
      );

      res.status(200).json({ status: "success", message: "User access retrieved", data });
      return;
    }

    // Every mission one group grants, in a single request rather than one per mission.
    if (groupId !== undefined) {
      const grants = await em.find(Mission_Permission_db, { groupId });
      const data: MissionPermission[] = grants.map((grant) => ({
        id: grant.id,
        missionId: grant.missionId,
        userId: grant.userId,
        groupId: grant.groupId,
        permLevel: grant.permLevel,
        notes: grant.notes,
        grantedBy: grant.grantedBy,
        createdAt: grant.createdAt,
        updatedAt: grant.updatedAt,
      }));

      res.status(200).json({ status: "success", message: "Group access retrieved", data });
      return;
    }

    // Every public mission, for the admin view that answers "what is visible to everyone?".
    const publicUser = await em.findOne(App_User_db, { uupic: PUBLIC_UUPIC });
    const publicGrants = publicUser
      ? await em.find(Mission_Permission_db, { userId: publicUser.id })
      : [];
    const data: PublicMission[] = publicGrants.map((grant) => ({
      missionId: grant.missionId,
      notes: grant.notes,
    }));

    res.status(200).json({ status: "success", message: "Public missions retrieved", data });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "missionPermission",
      appUsername: logUsername(req.currentUser),
      missionId,
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// Add or change a permission level for a user or a group on a mission
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, userId, groupId, permLevel, notes } =
    req.body as MissionPermissionGrantRequest;

  if (!apiHasSuperUserOrToken(req.currentUser)) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "missionPermission",
      appUsername: logUsername(req.currentUser),
      missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    if (!(typeof permLevel === "string" && permLevel in PERMISSION_RANK)) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "missionPermission",
        appUsername: logUsername(req.currentUser),
        missionId,
        message: "Unknown permission level",
      });
      res.status(400).json({ status: "failure", message: "Unknown permission level" });
      return;
    }

    if ((userId == null) === (groupId == null)) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "missionPermission",
        appUsername: logUsername(req.currentUser),
        missionId,
        message: "Exactly one of userId or groupId is required",
      });
      res
        .status(400)
        .json({ status: "failure", message: "Exactly one of userId or groupId is required" });
      return;
    }

    if (notes != null && notes.length > NOTES_MAX_LENGTH) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "missionPermission",
        appUsername: logUsername(req.currentUser),
        missionId,
        message: `Notes cannot exceed ${NOTES_MAX_LENGTH} characters`,
      });
      res.status(400).json({
        status: "failure",
        message: `Notes cannot exceed ${NOTES_MAX_LENGTH} characters`,
      });
      return;
    }

    const em = globalValues.orm.em;

    if (userId != null) {
      const target = await em.findOne(App_User_db, { id: userId });
      if (!target) {
        serverLogger.apiRoute({
          logLevel: "notice",
          httpMethod: "POST",
          responseStatus: 404,
          routeName: "missionPermission",
          appUsername: logUsername(req.currentUser),
          missionId,
          message: "User not found",
        });
        res.status(404).json({ status: "failure", message: "User not found" });
        return;
      }
      // Capping Public at viewer is what keeps the union safe: it can add missions to everyone's
      // access but can never hand out edit rights.
      if (target.uupic === PUBLIC_UUPIC && permLevel !== "viewer") {
        serverLogger.apiRoute({
          logLevel: "warning",
          httpMethod: "POST",
          responseStatus: 400,
          routeName: "missionPermission",
          appUsername: logUsername(req.currentUser),
          missionId,
          message: "Public grants are limited to viewer",
        });
        res.status(400).json({ status: "failure", message: "Public grants are limited to viewer" });
        return;
      }
    }

    const now = Date.now();
    const existing = await em.findOne(Mission_Permission_db, {
      missionId,
      userId: userId ?? null,
      groupId: groupId ?? null,
    });

    if (existing) {
      existing.permLevel = permLevel;
      if (notes !== undefined) existing.notes = notes;
      existing.updatedAt = now;
      await em.flush();
      res.status(200).json({ status: "success", message: "Grant updated", data: existing.id });
      return;
    }

    const created = em.create(Mission_Permission_db, {
      missionId,
      userId: userId ?? null,
      groupId: groupId ?? null,
      permLevel,
      notes: notes ?? null,
      grantedBy: req.currentUser?.appUser?.id ?? null,
      createdAt: now,
      updatedAt: now,
    });
    await em.flush();

    res.status(200).json({ status: "success", message: "Grant created", data: created.id });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "missionPermission",
      appUsername: logUsername(req.currentUser),
      missionId,
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// Revoke permissions.
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, userId, groupId } = req.body as MissionPermissionRevokeRequest;

  if (!apiHasSuperUserOrToken(req.currentUser)) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "DELETE",
      responseStatus: 401,
      routeName: "missionPermission",
      appUsername: logUsername(req.currentUser),
      missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const em = globalValues.orm.em;
    await em.nativeDelete(Mission_Permission_db, {
      missionId,
      userId: userId ?? null,
      groupId: groupId ?? null,
    });

    res.status(200).json({ status: "success", message: "Grant revoked", data: true });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "DELETE",
      responseStatus: 500,
      routeName: "missionPermission",
      appUsername: logUsername(req.currentUser),
      missionId,
      message: `Error processing the DELETE request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the DELETE request ${e}` });
  }
});

export default router;
