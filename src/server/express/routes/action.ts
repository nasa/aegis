import express, { Request, Response } from "express";

import _ from "lodash";
import { hasPerms } from "utils/permissions";
import { Query } from "express-serve-static-core";
import {
  EntityData,
  ForeignKeyConstraintViolationException,
  Loaded,
  QueryOrder,
} from "@mikro-orm/core";
import { Action_db } from "server/database/models/_allModels";
import { emitStoreDelete, emitStoreUpsert } from "server/express/sockets";
import { getEM } from "utils/mikro";
import { convertActionsTypeDbToStore, convertActionsTypeStoreToDb } from "store/storeUtils/action";

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
  const { socketId, missionId, log, actions } = req.body as ActionUpsertRequest;
  const editPermission = await hasPerms(missionId, "edit", req.session.user);
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  try {
    await upsertActions(actions);

    // emit the upserted item to all clients via socket.io
    emitStoreUpsert(
      {
        missionId,
        socketId,
        type: "action",
        data: actions,
      } as StoreUpsert,
      log
    );
    res.status(200).json({
      status: "success",
      message: `Action(s) upserted with Uuids ${actions.map((a) => a.uuid)}`,
      data: actions,
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
  const { socketId, missionId, log, actionUuids } = req.body as ActionDeleteRequest;
  const editPermission = await hasPerms(missionId, "edit", req.session.user);
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const deletedUuids = await deleteActions(actionUuids);
    if (deletedUuids.length > 0) {
      // emit the deleted item to all clients via socket.io
      emitStoreDelete(
        {
          missionId,
          socketId,
          type: "action",
          uuids: deletedUuids,
        } as StoreDelete,
        log
      );
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
  const actions = convertActionsTypeDbToStore(dbactions) as Action[];
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
    const convertedRecord: EntityData<Action_db> = convertActionsTypeStoreToDb([actionToUpsert])[0];
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
