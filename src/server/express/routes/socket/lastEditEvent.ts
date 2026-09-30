import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { hasPerms } from "utils/permissions";

import { globalValues } from "../../global";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
  };
  return queryObj;
};

// get the last edit event for a given mission
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  try {
    const viewPermission = hasPerms({
      missionId: queryObj.missionId,
      permission: "view",
      appUser: req.session.appUser,
    });
    if (!viewPermission) {
      serverLogger.apiRoute({
        logLevel: "warning",
        httpMethod: "GET",
        responseStatus: 401,
        routeName: "socket/lastEditEvent",
        appUsername: req.session?.appUser?.username,
        missionId: queryObj.missionId,
        message: "Unauthorized",
      });
      res.status(401).json({ status: "failure", message: "Unauthorized" });
      return;
    }
    if (!queryObj.missionId || isNaN(queryObj.missionId)) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "GET",
        responseStatus: 400,
        routeName: "socket/lastEditEvent",
        appUsername: req.session?.appUser?.username,
        missionId: queryObj.missionId,
        message: "Invalid mission ID",
      });
      res.status(400).json({ status: "error", message: "Invalid mission ID" });
      return;
    }
    const lastEditEvent =
      globalValues.serverSocketStatus?.lastEditEvents[queryObj.missionId] || null;

    res.status(200).json({
      status: "success",
      message: "last edit event retrieved",
      data: lastEditEvent,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "socket/lastEditEvent",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: e.toString(),
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: e.toString() });
    return;
  }
});

export default router;
