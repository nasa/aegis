import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { makeExportActions } from "utils/export";
import { hasPerms } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

import { getGrids } from "../grid";
import { getAutomergeMissions } from "../missionAutomerge";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, refUuid, evaRefUuid, rexUuid } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    actionRefUuid: refUuid ? (refUuid as string) : undefined,
    evaRefUuid: evaRefUuid ? (evaRefUuid as string) : undefined,
    rexUuid: rexUuid ? (rexUuid as string) : undefined, // if !rexUuid then use the as-planned EVA copy
  };
  return queryObj;
};

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const emssToken = req.headers["emss-token"] as string;

  const viewPermission = hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!viewPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "readable/action",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  //check for required mission id is valid
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "readable/action",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  if (queryObj.evaRefUuid && queryObj.actionRefUuid) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "readable/action",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "evaRefUuid cannot be used with action refUuid",
    });
    res.status(400).json({
      status: "error",
      message: "evaRefUuid cannot be used with action refUuid",
    });
    return;
  }

  try {
    const mission = (await getAutomergeMissions([queryObj.missionId]))[0];
    let actions: Action[] = [];

    if (queryObj.actionRefUuid) {
      if (queryObj.rexUuid) {
        // get the rex version of this action
        const rexEvaUuid = mission.rexes[queryObj.rexUuid]?.evaUuid;
        const rexEvaSequenceItemUuids = mission.evas[rexEvaUuid]?.sequence?.map(
          (sequenceItem) => sequenceItem.uuid
        );
        actions = Object.values(mission.actions).filter(
          (action) =>
            action.refUuid === queryObj.actionRefUuid &&
            (rexEvaSequenceItemUuids?.includes(action.stationUuid) ||
              rexEvaSequenceItemUuids?.includes(action.traverseUuid))
        );
      } else {
        // get the as-planned version of this action
        const allRexEvas = Object.values(mission.rexes).map((r) => r.evaUuid);
        const asPlannedEvasSequenceItemUuids = Object.values(mission.evas)
          .filter((e) => !allRexEvas.includes(e.uuid))
          .flatMap((e) => e.sequence.map((sequenceItem) => sequenceItem.uuid));
        actions = Object.values(mission.actions).filter(
          (action) =>
            action.refUuid === queryObj.actionRefUuid &&
            (asPlannedEvasSequenceItemUuids.includes(action.stationUuid) ||
              asPlannedEvasSequenceItemUuids.includes(action.traverseUuid))
        );
      }
    } else if (queryObj.evaRefUuid) {
      if (queryObj.rexUuid) {
        // get the rex version of this eva
        // technically we don't even need to check the evaRefUuid here, since we have a rexUuid
        const rexEvaUuid = mission.rexes[queryObj.rexUuid]?.evaUuid;
        const rexEvaSequenceItemUuids = mission.evas[rexEvaUuid]?.sequence?.map(
          (sequenceItem) => sequenceItem.uuid
        );
        actions = Object.values(mission.actions).filter(
          (action) =>
            rexEvaSequenceItemUuids?.includes(action.stationUuid) ||
            rexEvaSequenceItemUuids?.includes(action.traverseUuid)
        );
      } else {
        // get the as-planned copy of this eva
        const allRexEvas = Object.values(mission.rexes).map((r) => r.evaUuid);
        const asPlannedEva = Object.values(mission.evas).find(
          (e) => e.refUuid === queryObj.evaRefUuid && !allRexEvas.includes(e.uuid)
        );
        if (asPlannedEva) {
          const evaSequenceItemUuids = asPlannedEva.sequence?.map(
            (sequenceItem) => sequenceItem.uuid
          );
          actions = Object.values(mission.actions).filter(
            (action) =>
              evaSequenceItemUuids.includes(action.stationUuid) ||
              evaSequenceItemUuids.includes(action.traverseUuid)
          );
        }
      }
    }

    const gridCoordinates: MissionGridPoint[][] =
      mission.activeGridUuid && !mission.usingLGRSCoordinates
        ? (await getGrids(queryObj.missionId, true, mission.activeGridUuid))[0]?.coordinates
        : null;

    const exportActions: ExportAction[] = makeExportActions({
      actions: actions,
      missionGrid: gridCoordinates,
      mission,
    });

    res.status(200).json({
      status: "success",
      message: "readable actions retrieved",
      data: exportActions,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "readable/action",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: `Error getting readable actions ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error getting readable actions ${e}` });
  }
});

export default router;
