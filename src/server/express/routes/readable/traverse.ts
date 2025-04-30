import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";
import export_traverse_schema from "../../../../schema/exportTraverse.json";
import { hasPerms } from "utils/permissions";
import { makeExportActions, makeExportTraverses } from "utils/export";
import { getAll } from "../all";
import { getCalculatedFieldsByTraverse } from "store/processing/calculatedFields";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { uuid, socketId, evaUuid, missionId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    traverseUuid: uuid ? (uuid as string) : undefined,
    evaUuid: evaUuid ? (evaUuid as string) : undefined,
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

    let traverses = wholeStore.traverses;
    if (queryObj.evaUuid) {
      const chosenEvaTraverseSequenceItems = wholeStore.evas
        .find((eva) => eva.uuid === queryObj.evaUuid)
        ?.sequence.filter((sequenceItem) => sequenceItem.type === "traverse");
      traverses = traverses.filter((traverse) =>
        chosenEvaTraverseSequenceItems?.some((sequenceItem) => sequenceItem.uuid === traverse.uuid)
      );
    }
    if (queryObj.traverseUuid) {
      traverses = traverses.filter((traverse) => traverse.uuid === queryObj.traverseUuid);
    }

    const exportActions: ExportAction[] = makeExportActions({
      actions: wholeStore.actions,
      mission: wholeStore.mission,
      stations: wholeStore.stations,
      pois: wholeStore.pois,
      traverses: traverses,
      level1s: wholeStore.level1s,
      level2s: wholeStore.level2s,
      level3s: wholeStore.level3s,
    });

    const calculatedTraverses: TraverseCalculatedFields[] = traverses.map((traverse) =>
      getCalculatedFieldsByTraverse({
        traverseUuid: traverse.uuid,
        traverses: traverses,
        mission: wholeStore.mission,
        evas: wholeStore.evas,
        actions: wholeStore.actions,
      })
    );

    const exportTraverses: ExportTraverse[] = makeExportTraverses({
      traverses: traverses,
      calculatedFields: calculatedTraverses,
      actions: exportActions,
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
  res.status(200).json({
    status: "success",
    message: "traverse schema retrieved",
    data: export_traverse_schema,
  });
});

export default router;
