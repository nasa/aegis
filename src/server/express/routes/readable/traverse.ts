import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";
import { hasPerms } from "utils/permissions";
import { makeExportTraverses } from "utils/export";
import { getAll } from "../all";
import path from "path";
import fs from "fs";
import { SCHEMA_DIR } from "utils/consts-server";
import { getGridFromFile } from "../grid";

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
    const allData: AllDataForExport = {
      mission: wholeStore.mission,
      pois: wholeStore.pois,
      stations: wholeStore.stations,
      actions: wholeStore.actions,
      traverses: wholeStore.traverses,
      evas: wholeStore.evas,
      rexes: wholeStore.rexes,
      level1s: wholeStore.level1s,
      level2s: wholeStore.level2s,
      level3s: wholeStore.level3s,
    };

    // get all as-planned traverses
    const allRexEvaUuids = allData.rexes.map((r) => r.evaUuid);
    const asPlannedEvasSequenceItemUuids = allData.evas
      .filter((e) => !allRexEvaUuids.includes(e.uuid))
      .flatMap((e) => e.sequence.map((seq) => seq.uuid));
    const asPlannedTraverses = allData.traverses.filter((t) =>
      asPlannedEvasSequenceItemUuids.includes(t.uuid)
    );
    const traverses: Traverse[] = asPlannedTraverses;

    const gridCoordinates: MissionGridPoint[][] = allData.mission.activeGridUuid
      ? await getGridFromFile(queryObj.missionId, allData.mission.activeGridUuid)
      : null;

    const exportTraverses: ExportTraverse[] = makeExportTraverses({
      traverses: traverses,
      missionGrid: gridCoordinates,
      allData,
    });

    res.status(200).json({
      status: "success",
      message: "readable traverses retrieved",
      data: exportTraverses,
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error getting readable traverses ${e}` });
    return;
  }
});

router.get("/schema", async (req: Request, res: Response): Promise<void> => {
  try {
    const schemaFile = fs.readFileSync(path.join(SCHEMA_DIR, "exportTraverse.json"), "utf8");
    const schema = JSON.parse(schemaFile);
    res.status(200).json({
      status: "success",
      message: "traverse schema retrieved",
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
