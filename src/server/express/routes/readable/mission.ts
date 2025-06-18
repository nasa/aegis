import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";
import { hasPerms } from "utils/permissions";
import { getMission } from "../mission";
import path from "path";
import fs from "fs";
import { makeExportMission } from "utils/export";
import { getGridFromFile } from "../grid";
import { SCHEMA_DIR } from "utils/consts-server";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
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

    const exportMissions: ExportMission[] = await Promise.all(
      records.map(async (mission) => {
        const gridCoordinates: MissionGridPoint[][] = mission.activeGridUuid
          ? await getGridFromFile(queryObj.missionId, mission.activeGridUuid)
          : null;
        return makeExportMission({
          mission: mission,
          missionGrid: gridCoordinates,
        });
      })
    );

    res.status(200).json({
      status: "success",
      message: "mission retrieved",
      data: exportMissions,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

router.get("/schema", async (req: Request, res: Response): Promise<void> => {
  try {
    const schemaFile = fs.readFileSync(path.join(SCHEMA_DIR, "exportMission.json"), "utf8");
    const schema = JSON.parse(schemaFile);
    res.status(200).json({
      status: "success",
      message: "mission schema retrieved",
      data: schema,
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
