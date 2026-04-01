import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { listFiles } from "server/file/file"; // Assuming this function is compatible with Express
import { hasPerms } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, path } = query;
  return {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    path: path ? (path as string) : undefined,
  };
};

router.get("/", async (req: Request, res: Response) => {
  const queryObj = parseQuery(req.query);
  const viewPermission = hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    appUser: req.session.appUser,
  });
  if (!viewPermission || (!req.session.appUser.isAdmin && !req.session.appUser.isSuperAdmin)) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "file/list",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const listing: GISfile[] = await listFiles(decodeURIComponent(queryObj.path as string));
    res.status(200).json({ data: listing });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "file/list",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: e.toString(),
      error: asError(e),
    });
    res.status(500).json({ error: e.toString() });
  }
});

export default router;
