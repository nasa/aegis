import type { EntityData, Loaded } from "@mikro-orm/postgresql";
import type { Request, Response } from "express";

import { ForeignKeyConstraintViolationException, QueryOrder } from "@mikro-orm/postgresql";
import express from "express";
import cloneDeep from "lodash/cloneDeep";

import { Action_db } from "server/database/models/_allModels";
import { emitStoreDelete, emitStoreUpsert } from "server/express/sockets";
import { convertActionsTypeDbToStore, convertActionsTypeStoreToDb } from "store/storeUtils/action";
import { getEM } from "utils/mikro";
import { hasPerms } from "utils/permissions";
import { upsertDatabaseRetry } from "utils/database";
import { apiRouteLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const emssToken = req.headers["emss-token"] as string;

  const { socketId, missionId, actions } = req.body as ActionUpsertRequest;
  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "action",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: actions?.map((a) => a.uuid),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  try {
    const upsertResponse = await upsertDatabaseRetry(() => upsertActions(actions));

    // Check response
    if (!upsertResponse || upsertResponse.length === 0) {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "action",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: actions?.map((a) => a.uuid),
        message: "Failed to update action after multiple tries due to optimistic locking",
        error: new Error("Failed to update action after multiple tries due to optimistic locking"),
      });
      res.status(500).json({
        status: "error",
        message: "Failed to update action after multiple tries due to optimistic locking",
        data: null,
      });
      return;
    }

    // emit the upserted item to all clients via socket.io
    emitStoreUpsert({
      missionId,
      socketId,
      type: "action",
      data: upsertResponse,
    } as StoreUpsert);
    res.status(200).json({
      status: "success",
      message: `Action(s) upserted with Uuids ${upsertResponse.map((a) => a.uuid)}`,
      data: upsertResponse,
    });
    return;
  } catch (e) {
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "action",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: actions?.map((a) => a.uuid),
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
    return;
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const emssToken = req.headers["emss-token"] as string;

  const { socketId, missionId, actionUuids } = req.body as ActionDeleteRequest;
  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "DELETE",
      responseStatus: 401,
      routeName: "action",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: actionUuids,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const deletedUuids = await deleteActions(actionUuids);
    if (deletedUuids.length > 0) {
      // emit the deleted item to all clients via socket.io
      emitStoreDelete({
        missionId,
        socketId,
        type: "action",
        uuids: deletedUuids,
      } as StoreDelete);
      res.status(200).json({
        status: "success",
        message: "Action Deleted",
      });
    } else {
      apiRouteLogger({
        logLevel: "notice",
        httpMethod: "DELETE",
        responseStatus: 404,
        routeName: "action",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: actionUuids,
        message: "Record not found. Nothing deleted",
      });
      res.status(404).json({
        status: "failure",
        message: "Record not found. Nothing deleted",
      });
    }
  } catch (e) {
    console.error(e);
    if (e instanceof ForeignKeyConstraintViolationException) {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "DELETE",
        responseStatus: 500,
        routeName: "action",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: actionUuids,
        message: "Cannot delete action. This action is referenced elsewhere",
        error: asError(e),
      });
      res.status(500).json({
        status: "error",
        message: "Cannot delete action. This action is referenced elsewhere",
      });
    } else {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "DELETE",
        responseStatus: 500,
        routeName: "action",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: actionUuids,
        message: `Error processing the DELETE request ${e}`,
        error: asError(e),
      });
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

  const dbActions: Loaded<Action_db>[] = await em.find(
    Action_db,
    { ...whereClause },
    { orderBy: [{ name: QueryOrder.ASC }] }
  );

  //convert foreign keys
  return convertActionsTypeDbToStore(dbActions) as Action[];
}

/**
 * Gets action refUuids by their uuids.
 * @param actionUuids array of action uuids to retrieve
 * @returns array of action refUuids
 */
export async function getActionRefUuids(actionUuids: string[]): Promise<string[]> {
  const em = getEM();

  const dbActions: Loaded<Action_db>[] = await em.find(Action_db, {
    uuid: { $in: actionUuids },
  });
  return dbActions.map((a) => a.refUuid);
}

/**
 * Inserts or Updates actions into the database
 * @param actions array of actions upsert
 * @returns a copy of the array of actions that was upserted
 */
async function upsertActions(actions: Action[]): Promise<Action[]> {
  const em = getEM();
  await em.begin();

  const actionsToUpsert = cloneDeep(actions); // Create a copy to manipulate
  const actionsUpsertedToDb = [];
  try {
    for (const actionToUpsert of actionsToUpsert) {
      // Convert fks
      const convertedRecord: EntityData<Action_db> = convertActionsTypeStoreToDb([
        actionToUpsert,
      ])[0];
      const upsertReference: Action_db = await em.upsert(Action_db, convertedRecord);
      em.persist(upsertReference);
      actionsUpsertedToDb.push(upsertReference);
    }

    await em.commit(); // Flush and commit transaction
  } catch (e) {
    await em.rollback();
    throw e; // Re-throw the error to be handled by the caller
  }
  return convertActionsTypeDbToStore(actionsUpsertedToDb);
}

/**
 * Deletes actions.
 * @param actionUuids action uuids to delete
 * @returns the uuids of the deleted actions
 */
async function deleteActions(actionUuids: string[]): Promise<string[]> {
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
