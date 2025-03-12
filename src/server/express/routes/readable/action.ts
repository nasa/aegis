import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";
import export_action_schema from "../../../../schema/exportAction.json";
import { hasPerms } from "utils/permissions";
import { makeExportActions } from "utils/export";
import { getAll } from "../all";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { uuid, stationUuid, poiUuid, socketId, missionId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    actionUuid: uuid ? (uuid as string) : undefined,
    stationUuid: stationUuid ? (stationUuid as string) : undefined,
    poiUuid: poiUuid ? (poiUuid as string) : undefined,
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

    let actions: Action[] = wholeStore.actions;
    if (queryObj.actionUuid) {
      actions = actions.filter((action) => action.uuid === queryObj.actionUuid);
    }
    if (queryObj.stationUuid) {
      actions = actions.filter((action) => action.stationUuid === queryObj.stationUuid);
    }
    if (queryObj.poiUuid) {
      actions = actions.filter((action) => action.poiUuid === queryObj.poiUuid);
    }

    const stations: Station[] = wholeStore.stations;

    const pois: POI[] = wholeStore.pois;

    const stmStore: STMState = {
      level1s: wholeStore.level1s,
      level2s: wholeStore.level2s,
      level3s: wholeStore.level3s,
      rules: wholeStore.stmRules,
      rulesFromDb: wholeStore.stmRules,
      ruleEditingUuid: "",
    };

    const exportActions: ExportAction[] = makeExportActions({
      actions: actions,
      mission: wholeStore.mission,
      stations: stations,
      pois: pois,
      stmStore: stmStore,
    });

    res.status(200).json({
      status: "success",
      message: "actions retrieved",
      data: exportActions,
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error getting actions ${e}` });
    return;
  }
});

router.get("/actionSchema", async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({
    status: "success",
    message: "actions retrieved",
    data: export_action_schema,
  });
  return;
});

export default router;
