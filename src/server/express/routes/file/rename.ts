import express, { Request, Response } from "express";
import { renameFile } from "server/file/file"; // Assuming this function is compatible with Express
// Assuming you have a session middleware compatible with Express

import { hasPerms } from "utils/permissions";
import { Query } from "express-serve-static-core";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, path, oldname, newname } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    path: path ? (path as string) : undefined,
    oldname: oldname ? (oldname as string) : undefined,
    newname: newname ? (newname as string) : undefined,
  };
  return queryObj;
};

router.get("/", async (req: Request, res: Response) => {
  const queryObj = parseQuery(req.query);
  const editPermission = await hasPerms({
    missionId: queryObj.missionId,
    permission: "edit",
    user: req.session.user,
  });
  if (!editPermission || (!req.session.user.isAdmin && !req.session.user.isSuperAdmin)) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const success = await renameFile(
      decodeURIComponent(queryObj.path as string),
      decodeURIComponent(queryObj.oldname as string),
      decodeURIComponent(queryObj.newname as string)
    );
    if (!success) {
      throw new Error("Unable to rename file. Check server log");
    }
    res.status(200).json("Success");
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.toString() });
  }
});

export default router;
