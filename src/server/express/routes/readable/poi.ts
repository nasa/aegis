import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";
import { hasPerms } from "utils/permissions";
import { makeExportActions, makeExportPois } from "utils/export";
import { getAll } from "../all";
import { getCalculatedFieldsByPoi } from "store/processing/calculatedFields";
import path from "path";
import fs from "fs";
import { SCHEMA_DIR } from "utils/consts-server";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { uuid, socketId, missionId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    poiUuid: uuid ? (uuid as string) : undefined,
    socketId: socketId ? (socketId as string) : undefined,
  };
  return queryObj;
};

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const emssToken = req.headers["emss-token"] as string;

  const viewPermission = await hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    user: req.session.user,
    emssToken,
  });
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  //check for required mission id is valid
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  try {
    const wholeStore: OneMissionToRuleThemAll = await getAll(queryObj.missionId);

    let pois: POI[] = wholeStore.pois;
    if (queryObj.poiUuid) {
      pois = pois.filter((poi) => poi.uuid === queryObj.poiUuid);
    }

    const exportActions: ExportAction[] = makeExportActions({
      actions: wholeStore.actions,
      mission: wholeStore.mission,
      stations: wholeStore.stations,
      pois: pois,
      level1s: wholeStore.level1s,
      level2s: wholeStore.level2s,
      level3s: wholeStore.level3s,
    });

    const exportPois: ExportPOI[] = makeExportPois({
      pois: pois,
      poiCalculatedFields: pois.map((poi) =>
        getCalculatedFieldsByPoi({
          poiUuid: poi.uuid,
          actions: wholeStore.actions,
        })
      ),
      actions: exportActions,
      mission: wholeStore.mission,
    });

    res.status(200).json({
      status: "success",
      message: "readable POIs retrieved",
      data: exportPois,
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error getting readable POIs ${e}` });
    return;
  }
});

router.get("/schema", async (req: Request, res: Response): Promise<void> => {
  try {
    const schemaFile = fs.readFileSync(path.join(SCHEMA_DIR, "exportPoi.json"), "utf8");
    const schema = JSON.parse(schemaFile);
    res.status(200).json({
      status: "success",
      message: "poi schema retrieved",
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
