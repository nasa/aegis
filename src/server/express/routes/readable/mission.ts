import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";
import { hasPerms } from "utils/permissions";
import { getMission } from "../mission";
import path from "path";
import fs from "fs";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { socketId, missionId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    socketId: socketId ? (socketId as string) : undefined,
  };
  return queryObj;
};

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const emssToken = req.headers["emss-token"] as string;

  let viewPermission;
  if (queryObj.missionId) {
    viewPermission = await hasPerms({
      missionId: queryObj.missionId,
      permission: "view",
      user: req.session.user,
      emssToken,
    });
  } else {
    //no mission was specified. check if they are allowed to view at least one mission
    viewPermission =
      req.session?.user?.isSuperAdmin ||
      req.session?.user?.permissionList?.find((p) => p.permissions.view)?.permissions.view ||
      (emssToken && emssToken === process.env.EMSS_TOKEN);
  }
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    let records: Mission[];
    if (queryObj.missionId) {
      records = await getMission(queryObj.missionId);
    } else {
      //super admin and emss token can see all missions
      if (req.session?.user?.isSuperAdmin || (emssToken && emssToken === process.env.EMSS_TOKEN)) {
        records = await getMission();
      } else {
        //return all missions that they have permission for
        const viewableMissions: number[] = req.session.user.permissionList.map((p) => {
          if (p.permissions.view) return p.missionId;
        });
        records = await getMission(viewableMissions);
      }
    }
    res.status(200).json({
      status: "success",
      message: "mission retrieved",
      data: records,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

router.get("/schema", async (req: Request, res: Response): Promise<void> => {
  try {
    const schemaFilePath = path.join(process.cwd(), ".local", "schemas", "exportMission.json");
    fs.readFile(schemaFilePath, "utf8", (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).json({
          status: "error",
          message: `Error reading schema file: ${err.message}`,
          data: null,
        });
      } else {
        const schema = JSON.parse(data);
        res.status(200).json({
          status: "success",
          message: "mission schema retrieved",
          data: schema,
        });
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      status: "error",
      message: `Error retrieving schema: ${e}`,
      data: null,
    });
  }
  return;
});

export default router;
