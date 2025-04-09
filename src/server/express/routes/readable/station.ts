import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";
import { hasPerms } from "utils/permissions";
import { makeExportActions, makeExportStations } from "utils/export";
import { getAll } from "../all";
import { getCalculatedFieldsByStation } from "store/processing/calculatedFields";
import path from "path";
import fs from "fs";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { uuid, socketId, missionId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    stationUuid: uuid ? (uuid as string) : undefined,
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

    let stations = wholeStore.stations;
    if (queryObj.stationUuid) {
      stations = stations.filter((station) => station.uuid === queryObj.stationUuid);
    }

    const exportActions: ExportAction[] = makeExportActions({
      actions: wholeStore.actions,
      mission: wholeStore.mission,
      stations: stations,
      pois: wholeStore.pois,
      level1s: wholeStore.level1s,
      level2s: wholeStore.level2s,
      level3s: wholeStore.level3s,
    });

    const exportStations: ExportStation[] = makeExportStations({
      stations: stations,
      stationCalculatedFields: stations.map((station) =>
        getCalculatedFieldsByStation({
          stationUuid: station.uuid,
          stations: stations,
          mission: wholeStore.mission,
          actions: wholeStore.actions,
        })
      ),
      actions: exportActions,
      mission: wholeStore.mission,
      pois: wholeStore.pois,
    });

    res.status(200).json({
      status: "success",
      message: "readable stations retrieved",
      data: exportStations,
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error getting readable stations ${e}` });
    return;
  }
});

router.get("/schema", async (req: Request, res: Response): Promise<void> => {
  try {
    const schemaFilePath = path.join(process.cwd(), ".local", "schemas", "exportStation.json");
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
          message: "station schema retrieved",
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
