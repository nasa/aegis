import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";
import { hasPerms } from "utils/permissions";
import {
  makeExportActions,
  makeExportEvas,
  makeExportStations,
  makeExportTraverses,
} from "utils/export";
import { getAll } from "../all";
import {
  getCalculatedFieldsByEva,
  getCalculatedFieldsByStation,
  getCalculatedFieldsByTraverse,
} from "store/processing/calculatedFields";
import path from "path";
import fs from "fs";
import { getGridFromFile } from "../grid";
import { SCHEMA_DIR } from "utils/consts-server";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { uuid, socketId, missionId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    evaUuid: uuid ? (uuid as string) : undefined,
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

    let evas: Eva[] = wholeStore.evas;
    if (queryObj.evaUuid) {
      evas = evas.filter((eva) => eva.uuid === queryObj.evaUuid);
    }

    const gridCoordinates: MissionGridPoint[][] = wholeStore.mission.activeGridUuid
      ? await getGridFromFile(queryObj.missionId, wholeStore.mission.activeGridUuid)
      : null;

    const exportActions: ExportAction[] = makeExportActions({
      actions: wholeStore.actions,
      mission: wholeStore.mission,
      stations: wholeStore.stations,
      pois: wholeStore.pois,
      traverses: wholeStore.traverses,
      level1s: wholeStore.level1s,
      level2s: wholeStore.level2s,
      level3s: wholeStore.level3s,
      missionGrid: gridCoordinates,
    });

    const exportStations: ExportStation[] = makeExportStations({
      stations: wholeStore.stations,
      stationCalculatedFields: wholeStore.stations.map((station) =>
        getCalculatedFieldsByStation({
          stationUuid: station.uuid,
          stations: wholeStore.stations,
          mission: wholeStore.mission,
          actions: wholeStore.actions,
        })
      ),
      actions: exportActions,
      mission: wholeStore.mission,
      pois: wholeStore.pois,
      missionGrid: gridCoordinates,
    });

    const exportTraverses: ExportTraverse[] = makeExportTraverses({
      traverses: wholeStore.traverses,
      calculatedFields: wholeStore.traverses.map((traverse) =>
        getCalculatedFieldsByTraverse({
          traverseUuid: traverse.uuid,
          traverses: wholeStore.traverses,
          mission: wholeStore.mission,
          evas: evas,
          actions: wholeStore.actions,
        })
      ),
      actions: exportActions,
    });

    const exportEvas: ExportEva[] = makeExportEvas({
      evas: evas,
      evaCalculatedFields: evas.map((eva) =>
        getCalculatedFieldsByEva({
          evaUuid: eva.uuid,
          evas: evas,
          stations: wholeStore.stations,
          mission: wholeStore.mission,
          actions: wholeStore.actions,
          traverses: wholeStore.traverses,
        })
      ),
      stations: exportStations,
      traverses: exportTraverses,
      mission: wholeStore.mission,
    });

    res.status(200).json({
      status: "success",
      message: "readable evas retrieved",
      data: exportEvas,
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error getting readable evas ${e}` });
    return;
  }
});

router.get("/schema", async (req: Request, res: Response): Promise<void> => {
  try {
    const schemaFile = fs.readFileSync(path.join(SCHEMA_DIR, "exportEva.json"), "utf8");
    const schema = JSON.parse(schemaFile);
    res.status(200).json({
      status: "success",
      message: "eva schema retrieved",
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
