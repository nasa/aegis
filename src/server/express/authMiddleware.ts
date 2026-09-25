import type { EntityManager, ObjectQuery } from "@mikro-orm/postgresql";
import type { NextFunction, Request, Response } from "express";

import { getLaunchpadUser } from "packages/getUser";
import {
  App_User_db,
  Mission_Permission_db,
  User_Group_Member_db,
} from "server/database/models/_allModels";
import { isLaunchpadSuperUser, PERMISSION_RANK, PUBLIC_UUPIC } from "utils/permissionsClient";
import { emssTokenIsValid } from "utils/permissionsServer";
import { globalValues } from "./global";

/**
 * Record an authenticated request. One row per Launchpad identity, created on first login and
 * refreshed on every request afterwards.
 *
 * The row is never removed by a permission change, so its id is stable and safe to reference as
 * `ownerId` on entities the user creates. Holding a row confers nothing on its own; permissions
 * come from mission grants, group membership, or the Launchpad token's super-user role.
 *
 * Writes on every authenticated request. Throttling is deliberately not implemented; keeping the
 * write isolated here means one can be added later without touching call sites.
 */
export const recordLogin = async (
  em: EntityManager,
  identity: {
    uupic: string;
    auid: string;
    displayName: string;
  }
): Promise<App_User_db> => {
  // Concurrent requests from the same new identity will race here. Uupic is unique. Let the
  // database settle it rather than failing the request that loses. Only the identity fields merge.
  return em.upsert(
    App_User_db,
    {
      uupic: identity.uupic,
      auid: identity.auid,
      displayName: identity.displayName,
      isSystem: false,
      lastLoginAt: Date.now(),
    },
    {
      onConflictFields: ["uupic"],
      onConflictMergeFields: ["auid", "displayName", "lastLoginAt"],
    }
  );
};

/**
 * Every mission the user can reach, with the resolved permission level. Direct grants, grants
 * inherited through a group, and the public baseline are fetched in one query; the highest rank
 * per mission wins.
 *
 * Export just for testing
 */
export const resolvePermissions = async (
  em: EntityManager,
  userId: number | null
): Promise<Record<string, PermissionLevel>> => {
  const publicUserId = em
    .createQueryBuilder(App_User_db, "pu")
    .select("pu.id")
    .where({ uupic: PUBLIC_UUPIC });

  // The public baseline applies to everyone, so it is the one branch that is always present.
  const orConditions: ObjectQuery<Mission_Permission_db>[] = [{ userId: { $in: publicUserId } }];

  // Only look up a user's own grants when there is a user. Every group grant row has a null
  // user_id by the table's check constraint, so a null here would compile to `user_id is null`
  // and match all of them, handing the caller the union of every group grant in the system.
  if (userId != null) {
    const groupIdsForUser = em
      .createQueryBuilder(User_Group_Member_db, "ugm")
      .select("ugm.groupId")
      .where({ userId });

    orConditions.push({ userId }, { groupId: { $in: groupIdsForUser } });
  }

  const rows = await em.find(Mission_Permission_db, { $or: orConditions });

  const grants: Record<string, PermissionLevel> = {};
  for (const row of rows) {
    const missionKey = String(row.missionId);
    const current = grants[missionKey];
    if (!current || PERMISSION_RANK[row.permLevel] > PERMISSION_RANK[current]) {
      grants[missionKey] = row.permLevel;
    }
  }
  return grants;
};

/**
 * Resolves the caller's identity and access on every api/v1/ request
 * Attaches the identity and access information to `req.currentUser`.
 *
 * Must be mounted after the MikroORM RequestContext middleware, since it needs an entity manager,
 * and before any route that reads `req.currentUser`.
 */
export const authMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  // Todo eventually remove the emss-token and only accept x-api-key
  const emssToken = (req.headers["emss-token"] as string) || (req.headers["x-api-key"] as string);
  const isEmssToken = emssTokenIsValid(emssToken);
  const launchpadUser = getLaunchpadUser(req);

  // A machine-to-machine caller has no Launchpad identity. Pass it through
  if (launchpadUser instanceof Error) {
    const requestUser: CurrentUser = {
      launchpadUser: null,
      appUser: null,
      permissions: {},
      isEmssToken,
    };
    req.currentUser = requestUser;
    next();
    return;
  }

  // The super-user role comes from the Launchpad token, so it resolves without a database read.
  // It is not stored on the request user; every consumer re-derives it from the token.
  const isSuperUser = isLaunchpadSuperUser(launchpadUser);

  try {
    // Forked so a failure in here cannot leave the request's own entity manager in a bad state.
    const em = globalValues.orm.em.fork();

    const appUser = await recordLogin(em, {
      uupic: launchpadUser.uupic,
      auid: launchpadUser.auid,
      displayName: launchpadUser.display_name,
    });

    // A super user has implicit edit everywhere, so the grant lookup is skipped entirely.
    const permissionsForMissions = isSuperUser ? {} : await resolvePermissions(em, appUser.id);

    const requestUser: CurrentUser = {
      launchpadUser,
      appUser: {
        id: appUser.id,
        uupic: appUser.uupic,
        auid: appUser.auid,
        displayName: appUser.displayName,
        isSystem: appUser.isSystem,
        lastLoginAt: appUser.lastLoginAt,
      },
      permissions: permissionsForMissions,
      isEmssToken,
    };
    req.currentUser = requestUser;
  } catch {
    // Some kind of error occurred, just pass through whatever we have.
    const requestUser: CurrentUser = {
      launchpadUser,
      appUser: null,
      permissions: {},
      isEmssToken,
    };
    req.currentUser = requestUser;
  }

  next();
};
