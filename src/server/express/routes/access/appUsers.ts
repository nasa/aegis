import type { Request, Response } from "express";
import type { ObjectQuery } from "@mikro-orm/postgresql";

import express from "express";
import { sql } from "@mikro-orm/postgresql";

import {
  App_User_db,
  Mission_Permission_db,
  User_Group_Member_db,
} from "server/database/models/_allModels";
import { apiHasSuperUserOrToken, logUsername } from "utils/permissionsServer";
import { globalValues } from "../../global";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

/**
 * List users.
 *   ?userId=               one user
 *   ?search=               match on auid or display name
 *   ?withPermissionsOnly=  only users holding a grant, a membership, or reserved status
 *
 * Every identity that has ever signed in has a row here, so the default list includes people who
 * hold no permissions at all. `hasPermissions` distinguishes them.
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;
  const search = ((req.query.search as string) ?? "").trim();
  const withPermissionsOnly = req.query.withPermissionsOnly === "true";

  if (!apiHasSuperUserOrToken(req.currentUser)) {
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

    const conditions: ObjectQuery<App_User_db>[] = [];
    if (userId !== undefined) conditions.push({ id: userId });
    if (search) {
      conditions.push({
        $or: [{ auid: { $ilike: `%${search}%` } }, { displayName: { $ilike: `%${search}%` } }],
      });
    }

    // Counted with correlated subqueries rather than per row: the list is every identity that has
    // ever signed in, so a count query per user does not scale. The counts themselves are not
    // returned; only whether either is non-zero, which is what `hasPermissions` means.
    const rows = await em
      .createQueryBuilder(App_User_db, "au")
      .select([
        "au.*",
        em
          .createQueryBuilder(User_Group_Member_db, "ugm")
          .count()
          .where({ userId: sql.ref("au.id") })
          .as("group_count"),
        em
          .createQueryBuilder(Mission_Permission_db, "mp")
          .count()
          .where({ userId: sql.ref("au.id") })
          .as("mission_count"),
      ])
      .where(conditions.length ? { $and: conditions } : {})
      .orderBy({ displayName: "asc" })
      .execute<(App_User_db & { group_count: string; mission_count: string })[]>("all");

    const summaries: AppUserSummary[] = rows.map((row) => ({
      id: row.id,
      uupic: row.uupic,
      auid: row.auid,
      displayName: row.displayName,
      isSystem: row.isSystem,
      lastLoginAt: row.lastLoginAt != null ? Number(row.lastLoginAt) : null,
      hasPermissions: row.isSystem || Number(row.group_count) > 0 || Number(row.mission_count) > 0,
    }));

    const data = withPermissionsOnly ? summaries.filter((u) => u.hasPermissions) : summaries;

    res.status(200).json({ status: "success", message: "Users retrieved", data });
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

export default router;
