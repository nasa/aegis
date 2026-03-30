import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { deleteFile } from "server/file/file"; // Assuming this function is compatible with Express
import { hasPerms } from "utils/permissions";
import { ConsoleLogger as serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, path } = query;
  return {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    path: path ? (path as string) : undefined,
  };
};

router.delete("/", async (req: Request, res: Response) => {
  const queryObj = parseQuery(req.query);
  const editPermission = hasPerms({
    missionId: queryObj.missionId,
    permission: "edit",
    appUser: req.session.appUser,
  });
  if (!editPermission || (!req.session.appUser.isAdmin && !req.session.appUser.isSuperAdmin)) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "DELETE",
      responseStatus: 401,
      routeName: "file/delete",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const success = await deleteFile(decodeURIComponent(queryObj.path as string));
    if (!success) {
      throw new Error("Unable to delete file. Check server log");
    }
    res.status(200).json("Success");
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "DELETE",
      responseStatus: 500,
      routeName: "file/delete",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: e.toString(),
      error: asError(e),
    });
    res.status(500).json({ error: e.toString() });
  }
});

export default router;
