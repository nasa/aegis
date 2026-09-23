import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { deleteFile } from "server/file/file"; // Assuming this function is compatible with Express
import { apiHasSuperUserOrToken, logUsername } from "utils/permissionsServer";
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

router.delete("/", async (req: Request, res: Response) => {
  const queryObj = parseQuery(req.query);
  if (!apiHasSuperUserOrToken(req.currentUser)) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "DELETE",
      responseStatus: 401,
      routeName: "file/delete",
      appUsername: logUsername(req.currentUser),
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
      appUsername: logUsername(req.currentUser),
      missionId: queryObj.missionId,
      message: e.toString(),
      error: asError(e),
    });
    res.status(500).json({ error: e.toString() });
  }
});

export default router;
