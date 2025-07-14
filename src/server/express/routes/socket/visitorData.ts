import { asError } from "@emss/utils";
import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";
import { globalValues } from "server/express/global";
import serverLogger from "utils/serverLogger";

/**
 * `/api/v1/socket/status`
 *
 * Get server socket status
 */

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
  };
  return queryObj;
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const queryObj = parseQuery(req.query);
    // only super admin can see socket info
    if (!req.session?.appUser?.isSuperAdmin) {
      res.status(401).json({ status: "failure", message: "Unauthorized" });
      return;
    }

    // if mission is provided, only get the socket status for that mission
    if (queryObj.missionId && !isNaN(queryObj.missionId)) {
      const visitorData = globalValues.serverSocketStatus?.visitorsData?.filter(
        (v) => v.missionId === queryObj.missionId
      );
      const socketStatus = visitorData || null;
      res.status(200).json(socketStatus);
      return;
    }

    // no mission is provided. get all status on all missions
    res.status(200).json(globalValues.serverSocketStatus?.visitorsData || null);
    return;
  } catch (e) {
    serverLogger.error(asError(e), { logId: "error in socketStatus route" });
    res.status(400).json({ error: e.toString() });
    return;
  }
});

export default router;
