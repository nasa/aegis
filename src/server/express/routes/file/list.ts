import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { listFiles } from "server/file/file"; // Assuming this function is compatible with Express
import { hasPerms } from "utils/permissions";

// Define the GISfile type if it's not already defined elsewhere
interface GISfile {
  // Define properties here
}

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
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const listing: GISfile[] = await listFiles(decodeURIComponent(queryObj.path as string));
    res.status(200).json({ data: listing });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.toString() });
  }
});

export default router;
