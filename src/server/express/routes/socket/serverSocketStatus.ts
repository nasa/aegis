import type { Request, Response } from "express";

import express from "express";

import { globalValues } from "server/express/global";
import { ConsoleLogger as serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

/**
 * `/api/v1/socket/serverSocketStatus`
 *
 * Get server socket status
 */

const router = express.Router();

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    // only super admin can see socket info
    if (!req.session?.appUser?.isSuperAdmin) {
      serverLogger.apiRoute({
        logLevel: "warning",
        httpMethod: "GET",
        responseStatus: 401,
        routeName: "socket/serverSocketStatus",
        appUsername: req.session?.appUser?.username,
        message: "Unauthorized",
      });
      res.status(401).json({ status: "failure", message: "Unauthorized" });
      return;
    }
    res.status(200).json(globalValues.serverSocketStatus || null);
    return;
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "socket/serverSocketStatus",
      appUsername: req.session?.appUser?.username,
      message: e.toString(),
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: e.toString() });
    return;
  }
});

export default router;
