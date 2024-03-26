import express, { Request, Response } from "express";

import _ from "lodash";
import { hasPerms } from "utils/permissions";
import { Query } from "express-serve-static-core";
import { v4 as uuidv4 } from "uuid";
import {
  EntityData,
  ForeignKeyConstraintViolationException,
  Loaded,
  QueryOrder,
} from "@mikro-orm/core";
import { Action_db } from "server/database/models/_allModels";
import { emitStoreDelete, emitStoreUpsert } from "server/express/sockets";
import { upsertLogs } from "./log";
import { getEM } from "utils/mikro";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { uuid, stationUuid, poiUuid, socketId, missionId, log } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    actionUuid: uuid ? (uuid as string) : undefined,
    stationUuid: stationUuid ? (stationUuid as string) : undefined,
    poiUuid: poiUuid ? (poiUuid as string) : undefined,
    socketId: socketId ? (socketId as string) : undefined,
    logAction: log === "true",
  };
  return queryObj;
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const viewPermission = await hasPerms(queryObj.missionId, "view", req.session.user);
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  //check for required mission id is valid
  if (!queryObj.missionId || _.isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  try {
    const actions: Action[] = await getActions({
      missionId: queryObj.missionId,
      actionUuid: queryObj.actionUuid,
      stationUuid: queryObj.stationUuid,
      poiUuid: queryObj.poiUuid,
    });

    res.status(200).json({
      status: "success",
      message: "actions retrieved",
      data: actions,
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error getting actions ${e}` });
    return;
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const editPermission = await hasPerms(queryObj.missionId, "edit", req.session.user);
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  try {
    const actionsToUpsert: Action[] = req.body as Action[];
    await upsertActions(actionsToUpsert);

    // emit the upserted item to all clients via socket.io
    emitStoreUpsert({
      missionId: queryObj.missionId,
      socketId: queryObj.socketId,
      type: "action",
      data: actionsToUpsert,
    } as StoreUpsert<Action>);

    if (queryObj.logAction) {
      // log this upsert to the log table
      const log: Log = {
        uuid: uuidv4(),
        missionId: queryObj.missionId,
        type: "actionUpsert",
        payloadJson: JSON.stringify(actionsToUpsert),
        createdAt: new Date().toISOString(),
      };
      upsertLogs([log]);
    }

    res.status(200).json({
      status: "success",
      message: `Action(s) upserted with Uuids ${actionsToUpsert.map((a) => a.uuid)}`,
      data: actionsToUpsert,
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
    return;
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const editPermission = await hasPerms(queryObj.missionId, "edit", req.session.user);
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const uuidsToDelete: string[] = req.body;
    //const uuidsToDelete: string[] = req.body as string[];
    const deletedUuids = await deleteActions(uuidsToDelete);
    if (deletedUuids.length > 0) {
      // emit the deleted item to all clients via socket.io
      emitStoreDelete({
        missionId: queryObj.missionId,
        socketId: queryObj.socketId,
        type: "action",
        uuids: deletedUuids,
      } as StoreDelete);

      if (queryObj.logAction) {
        // log this deletion to the log table
        const log: Log = {
          uuid: uuidv4(),
          missionId: queryObj.missionId,
          type: "actionDelete",
          payloadJson: JSON.stringify({ deletedUuids }),
          createdAt: new Date().toISOString(),
        };
        upsertLogs([log]);
      }

      res.status(200).json({
        status: "success",
        message: "Action Deleted",
      });
    } else {
      res.status(404).json({
        status: "failure",
        message: "Record not found. Nothing deleted",
      });
    }
  } catch (e) {
    console.error(e);
    if (e instanceof ForeignKeyConstraintViolationException) {
      res.status(500).json({
        status: "error",
        message: "Cannot delete action. This action is referenced elsewhere",
      });
    } else {
      res
        .status(500)
        .json({ status: "error", message: `Error processing the DELETE request ${e}` });
    }
  }
});

export default router;

/**
 * get action(s) from the database using filter options.
 * @param filter optional filters: actionUuid, poiUuid, stationUuid, or missionId. If no filter options are provided, all actions will be returned.
 * @returns array of actions
 */
export async function getActions(filter: ActionFilterOptions): Promise<Action[]> {
  const em = getEM();

  //build filter where clause
  const whereClause: {
    uuid?: string;
    poi?: { uuid: string };
    station?: { uuid: string };
    mission?: { id: number };
  } = {};
  if (filter?.actionUuid) whereClause.uuid = filter.actionUuid;
  if (filter?.poiUuid) whereClause.poi = { uuid: filter.poiUuid };
  if (filter?.stationUuid) whereClause.station = { uuid: filter.stationUuid };
  if (filter?.missionId) whereClause.mission = { id: filter.missionId };

  const dbactions: Loaded<Action_db>[] = await em.find(
    Action_db,
    { ...whereClause },
    { orderBy: [{ name: QueryOrder.ASC }] }
  );

  //convert foreign keys
  const actions = convertActions(dbactions) as Action[];
  return actions;
}

/**
 * Inserts or Updates actions into the database
 * @param actions array of actions upsert
 * @returns a copy of the array of actions that was upserted
 */
export async function upsertActions(actions: Action[]): Promise<void> {
  const em = getEM();

  const actionsToUpsert = _.cloneDeep(actions); //create a copy to manipulate
  //convert fks
  for (const actionToUpsert of actionsToUpsert) {
    const convertedRecord: EntityData<Action_db> = {
      uuid: actionToUpsert.uuid || uuidv4(),
      name: actionToUpsert.name,
      mission: actionToUpsert.missionId,
      poi: actionToUpsert.poiUuid,
      station: actionToUpsert.stationUuid,
      parentAction: actionToUpsert.parentActionUuid,
      parentCopyDate: actionToUpsert.parentCopyDate
        ? new Date(actionToUpsert.parentCopyDate)
        : null,
      priority: actionToUpsert.priority,
      stmUuidRefs: actionToUpsert.stmUuidRefs,
      stmPriorities: actionToUpsert.stmPriorities,
      type: actionToUpsert.type,
      description: actionToUpsert.description,
      icon: actionToUpsert.icon,
      location: actionToUpsert.location,
      elevation: actionToUpsert.elevation,
      durationLower: actionToUpsert.durationLower,
      durationUpper: actionToUpsert.durationUpper,
      equipmentItemsUsage: actionToUpsert.equipmentItemsUsage,
      geographicUnitsUsage: actionToUpsert.geographicUnitsUsage,
      mass: actionToUpsert.mass,
      status: actionToUpsert.status,
      enabled: actionToUpsert.enabled,
      crewAssigned: actionToUpsert.crewAssigned,
      updatedAt: new Date(actionToUpsert.updatedAt),
      createdAt: new Date(actionToUpsert.createdAt),
    };

    const upsertReference: Action_db = await em.upsert(Action_db, convertedRecord);
    em.persist(upsertReference);
  }

  await em.flush();
}

/**
 * Deletes actions.
 * @param actionUuids action uuids to delete
 * @returns the uuids of the deleted actions
 */
export async function deleteActions(actionUuids: string[]): Promise<string[]> {
  const em = getEM();
  const deletedUuids = [];
  for (const actionUuid of actionUuids) {
    const entity = await em.findOne(Action_db, { uuid: actionUuid });
    if (entity) {
      deletedUuids.push(actionUuid);
      em.remove(entity);
    }
  }
  await em.flush();
  return deletedUuids;
}

/**
 * Converts db action fks to their uuid/id arrays
 * @param dbactions an array of actions in mikro db format
 * @returns an a converted array of actions or a single action
 */
function convertActions(dbactions: Action_db[]): Action[] {
  const actions: Action[] = [];
  for (const dbaction of dbactions) {
    //convert mission and owner ids
    const convertedAction: Action = {
      uuid: dbaction.uuid,
      name: dbaction.name,
      missionId: dbaction.mission.id,
      poiUuid: dbaction.poi?.uuid,
      stationUuid: dbaction.station?.uuid,
      parentActionUuid: dbaction.parentAction?.uuid,
      parentCopyDate: dbaction.parentCopyDate?.toISOString(),
      priority: dbaction.priority,
      stmUuidRefs: dbaction.stmUuidRefs,
      stmPriorities: dbaction.stmPriorities,
      type: dbaction.type,
      description: dbaction.description,
      icon: dbaction.icon,
      location: dbaction.location,
      elevation: dbaction.elevation,
      durationLower: dbaction.durationLower,
      durationUpper: dbaction.durationUpper,
      equipmentItemsUsage: dbaction.equipmentItemsUsage,
      geographicUnitsUsage: dbaction.geographicUnitsUsage,
      mass: dbaction.mass,
      status: dbaction.status,
      enabled: dbaction.enabled,
      crewAssigned: dbaction.crewAssigned,
      createdAt: dbaction.createdAt?.toISOString(),
      updatedAt: dbaction.updatedAt?.toISOString(),
    };
    actions.push(convertedAction);
  }
  return actions;
}
