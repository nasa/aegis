import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";
import { hasPerms } from "utils/permissions";
import { makeExportActions } from "utils/export";
import { getAll } from "../all";
import path from "path";
import fs from "fs";
import { getGridFromFile } from "../grid";
import { SCHEMA_DIR } from "utils/consts-server";
import { QueryOrder } from "@mikro-orm/core";
import { getEM } from "utils/mikro";
import { Action_db, Eva_db } from "server/database/models/_allModels";
import { isISOString } from "utils/formatting";

const router = express.Router();

const parseQuery = (query: Query) => {
  const {
    uuid,
    stationUuid,
    traverseUuid,
    poiUuid,
    evaUuid,
    socketId,
    missionId,
    modifiedSince,
    datesOnly,
  } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    actionUuid: uuid ? (uuid as string) : undefined,
    stationUuid: stationUuid ? (stationUuid as string) : undefined,
    poiUuid: poiUuid ? (poiUuid as string) : undefined,
    traverseUuid: traverseUuid ? (traverseUuid as string) : undefined,
    evaUuid: evaUuid ? (evaUuid as string) : undefined,
    socketId: socketId ? (socketId as string) : undefined,
    modifiedSince: modifiedSince ? (modifiedSince as string) : undefined,
    datesOnly: datesOnly === "true",
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

  // Validate modifiedSince parameter if provided
  if (queryObj.modifiedSince && !isISOString(queryObj.modifiedSince)) {
    res.status(400).json({
      status: "error",
      message: "Invalid modifiedSince format. Use ISO date string format.",
    });
    return;
  }

  if (queryObj.datesOnly) {
    try {
      const em = getEM();

      // Build filter where clause
      const whereClause: {
        uuid?: string;
        poi?: { uuid: string };
        station?: { uuid: string };
        traverse?: { uuid: string };
        mission?: { id: number };
        $or?: Array<Record<string, unknown>>;
        updatedAt?: { $gte: Date };
      } = {};
      if (queryObj.actionUuid) whereClause.uuid = queryObj.actionUuid;
      if (queryObj.poiUuid) whereClause.poi = { uuid: queryObj.poiUuid };
      if (queryObj.stationUuid) whereClause.station = { uuid: queryObj.stationUuid };
      if (queryObj.traverseUuid) whereClause.traverse = { uuid: queryObj.traverseUuid };
      if (queryObj.missionId) whereClause.mission = { id: queryObj.missionId };

      if (queryObj.evaUuid) {
        const eva = await em.findOne(Eva_db, { uuid: queryObj.evaUuid });
        if (eva) {
          const sequenceItemUuids = eva.sequence.map((sequenceItem) => sequenceItem.uuid);

          whereClause.$or = [
            { station: { uuid: { $in: sequenceItemUuids } } },
            { traverse: { uuid: { $in: sequenceItemUuids } } },
          ];
        }
      }

      if (queryObj.modifiedSince) {
        const sinceDate = new Date(queryObj.modifiedSince);
        whereClause.updatedAt = { $gte: sinceDate };
      }

      // For datesOnly, we only fetch the specific fields we need
      const dbActions = await em.find(Action_db, whereClause, {
        fields: ["uuid", "createdAt", "updatedAt"],
        orderBy: { name: QueryOrder.ASC },
      });

      // Transform to desired format
      const dateActions = dbActions.map((action) => ({
        actionUuid: action.uuid,
        createdAt: action.createdAt,
        updatedAt: action.updatedAt,
      }));

      res.status(200).json({
        status: "success",
        message: `action dates retrieved`,
        data: dateActions,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ status: "error", message: `Error getting actions ${e}` });
    }
  } else {
    try {
      // Standard flow for full objects
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
      if (queryObj.traverseUuid) {
        actions = actions.filter((action) => action.traverseUuid === queryObj.traverseUuid);
      }
      if (queryObj.evaUuid) {
        const evaSequenceItemUuids = wholeStore.evas
          .find((eva) => eva.uuid === queryObj.evaUuid)
          .sequence.map((sequenceItem) => sequenceItem.uuid);

        actions = actions.filter(
          (action) =>
            evaSequenceItemUuids.includes(action.stationUuid) ||
            evaSequenceItemUuids.includes(action.traverseUuid)
        );
      }
      if (queryObj.modifiedSince) {
        const sinceDate = new Date(queryObj.modifiedSince);
        actions = actions.filter((action) => new Date(action.updatedAt) >= sinceDate);
      }

      const gridCoordinates: MissionGridPoint[][] = wholeStore.mission.activeGridUuid
        ? await getGridFromFile(queryObj.missionId, wholeStore.mission.activeGridUuid)
        : null;

      const exportActions: ExportAction[] = makeExportActions({
        actions: actions,
        mission: wholeStore.mission,
        stations: wholeStore.stations,
        pois: wholeStore.pois,
        traverses: wholeStore.traverses,
        level1s: wholeStore.level1s,
        level2s: wholeStore.level2s,
        level3s: wholeStore.level3s,
        missionGrid: gridCoordinates,
      });

      res.status(200).json({
        status: "success",
        message: "readable actions retrieved",
        data: exportActions,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ status: "error", message: `Error getting readable actions ${e}` });
    }
  }
});

router.get("/schema", async (req: Request, res: Response): Promise<void> => {
  try {
    const schemaFile = fs.readFileSync(path.join(SCHEMA_DIR, "exportAction.json"), "utf8");
    const schema = JSON.parse(schemaFile);
    res.status(200).json({
      status: "success",
      message: "action schema retrieved",
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
