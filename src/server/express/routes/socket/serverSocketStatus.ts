import type { Request, Response } from "express";

import express from "express";

import { asError } from "@emss/utils";

import { globalValues } from "server/express/global";

import serverLogger from "utils/logging/serverLogger";

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
      res.status(401).json({ status: "failure", message: "Unauthorized" });
      return;
    }
    res.status(200).json(globalValues.serverSocketStatus || null);
    return;
  } catch (e) {
    serverLogger.error(asError(e), { logId: "Error in socketStatus route" });
    res.status(500).json({ status: "error", message: e.toString() });
    return;
  }
});

export default router;
