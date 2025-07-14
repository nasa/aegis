import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import { hasPerms } from "utils/permissions";
import { globalValues } from "../../global";

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
  const viewPermission = await hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    appUser: req.session.appUser,
  });
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  const lastEditEvent = globalValues.serverSocketStatus?.lastEditEvents[queryObj.missionId] || null;

  res.status(200).json({
    status: "success",
    message: "last edit event retrieved",
    data: lastEditEvent,
  });
});

export default router;
