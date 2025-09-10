import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { deleteFile } from "server/file/file"; // Assuming this function is compatible with Express
import { hasPerms } from "utils/permissions";

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
    console.error(e);
    res.status(500).json({ error: e.toString() });
  }
});

export default router;
