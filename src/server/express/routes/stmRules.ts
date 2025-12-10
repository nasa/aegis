import type { EntityData, Loaded } from "@mikro-orm/postgresql";
import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import { QueryOrder } from "@mikro-orm/postgresql";
import express from "express";
import cloneDeep from "lodash/cloneDeep";

import { STM_Rule_db } from "server/database/models/_allModels";
import { convertStmRulesTypeDbToStore, convertStmRulesTypeStoreToDb } from "store/storeUtils/stm";
import { hasPerms } from "utils/permissions";
import { globalValues } from "../global";

import { emitStoreDelete, emitStoreUpsert } from "../sockets";
import { upsertDatabaseRetry } from "utils/database";
import { apiRouteLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, socketId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    socketId: socketId ? (socketId as string) : undefined,
  };
  return queryObj;
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const viewPermission = hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    appUser: req.session.appUser,
  });
  if (!viewPermission) {
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "stmRules",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    apiRouteLogger({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "stmRules",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  try {
    const records: STMRule[] = await upsertDatabaseRetry(() => getStmRules(queryObj.missionId));

    res.status(200).json({
      status: "success",
      message: `Rules for mission ${queryObj.missionId} retrieved`,
      data: records,
    });
  } catch (e) {
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "stmRules",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, stmRules } = req.body as STMRuleUpsertRequest;
  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
  });
  if (!editPermission) {
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "stmRules",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: stmRules?.map((r) => r.uuid),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    // validate
    if (!stmRules || stmRules.length === 0) {
      apiRouteLogger({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "stmRules",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: stmRules?.map((r) => r.uuid),
        message: "No stm rules provided in request body",
      });
      res.status(400).json({ status: "failure", message: "No stm rules provided in request body" });
      return;
    }
    if (!missionId || isNaN(missionId)) {
      apiRouteLogger({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "stmRules",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: stmRules?.map((r) => r.uuid),
        message: "Invalid mission ID",
      });
      res.status(400).json({ status: "error", message: "Invalid mission ID" });
      return;
    }

    const upsertResponse: STMRule[] = await upsertStmRules(missionId, stmRules);

    // Check response
    if (!upsertResponse || upsertResponse.length === 0) {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "stmRules",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: stmRules?.map((r) => r.uuid),
        message: "Failed to update stm rules after multiple tries due to optimistic locking",
        error: new Error(
          "Failed to update stm rules after multiple tries due to optimistic locking"
        ),
      });
      res.status(500).json({
        status: "error",
        message: "Failed to update stm rules after multiple tries due to optimistic locking",
        data: null,
      });
      return;
    }

    // Emit the upserted item to all clients via socket.io
    emitStoreUpsert({
      missionId,
      socketId,
      type: "stmRule",
      data: upsertResponse,
    } as StoreUpsert);

    res.status(200).json({
      status: "success",
      message: `${stmRules.length} rules for mission ${missionId} upserted`,
      data: upsertResponse,
    });
  } catch (e) {
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "stmRules",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: stmRules?.map((r) => r.uuid),
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, stmRuleUuids } = req.body as STMRuleDeleteRequest;
  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
  });
  if (!editPermission) {
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "DELETE",
      responseStatus: 401,
      routeName: "stmRules",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: stmRuleUuids,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!missionId || isNaN(missionId)) {
    apiRouteLogger({
      logLevel: "notice",
      httpMethod: "DELETE",
      responseStatus: 400,
      routeName: "stmRules",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: stmRuleUuids,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  try {
    const deletedUuids: string[] = await deleteStmRules(stmRuleUuids);

    // emit the deleted item to all clients via socket.io
    emitStoreDelete({
      missionId,
      socketId,
      type: "stmRule",
      uuids: deletedUuids,
    } as StoreDelete);

    res.status(200).json({
      status: "success",
      message: `${stmRuleUuids.length} rules for mission ${missionId} deleted`,
      data: deletedUuids,
    });
  } catch (e) {
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "DELETE",
      responseStatus: 500,
      routeName: "stmRules",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: stmRuleUuids,
      message: `Error processing the DELETE request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the DELETE request ${e}` });
  }
});

export default router;

/**
 * get STMRules from the database.
 * @param missionId the mission id. required
 * @returns array of stm rules returns empty array if no records found
 */
export async function getStmRules(missionId: number): Promise<STMRule[]> {
  const em = globalValues.orm.em;

  const stmRules: Loaded<STM_Rule_db, never>[] = await em.find(
    STM_Rule_db,
    { mission: { id: missionId } },
    { orderBy: { createdAt: QueryOrder.ASC } }
  );

  if (stmRules) {
    return convertStmRulesTypeDbToStore(stmRules); //convert fks
  } else {
    return [];
  }
}

/**
 * upsert STM rules
 * @param stmRules the stm rule to create
 * @returns the created stm rule
 */
async function upsertStmRules(missionId: number, stmRules: STMRule[]): Promise<STMRule[]> {
  const em = globalValues.orm.em;
  await em.begin(); // Start a transaction

  const stmRulesToUpsert = cloneDeep(stmRules); // Create a copy to manipulate
  const stmRulesUpsertedToDb = [];

  try {
    // Build stm rule to upsert
    for (const stmRuleToUpsert of stmRulesToUpsert) {
      // Convert foreign keys
      stmRuleToUpsert.missionId = missionId;
      const convertedStmRule: EntityData<STM_Rule_db> = convertStmRulesTypeStoreToDb([
        stmRuleToUpsert,
      ])[0];
      const stmRuleUpsertReference: STM_Rule_db = await em.upsert(STM_Rule_db, convertedStmRule);
      em.persist(stmRuleUpsertReference);

      stmRulesUpsertedToDb.push(stmRuleUpsertReference);
    }

    await em.commit(); // Flush and commit the transaction
  } catch (e) {
    await em.rollback(); // Rollback the transaction
    throw e; // Re-throw the error to be handled by the caller
  }

  // Convert foreign keys
  return convertStmRulesTypeDbToStore(stmRulesUpsertedToDb);
}

/**
 * delete STM rules
 * @param stmRuleUuids the stm rule uuids to delete
 * @returns the deleted stm rules
 */
async function deleteStmRules(stmRuleUuids: string[]): Promise<string[]> {
  const em = globalValues.orm.em;
  const deletedUuids = [];
  for (const stmRuleUuid of stmRuleUuids) {
    const entity = await em.findOne(STM_Rule_db, { uuid: stmRuleUuid });
    if (entity) {
      em.remove(entity); //delete stm rule
      deletedUuids.push(stmRuleUuid);
    }
  }
  await em.flush(); //perform deletes
  return deletedUuids;
}
