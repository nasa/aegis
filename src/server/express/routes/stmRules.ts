import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import cloneDeep from "lodash/cloneDeep";

import { hasPerms } from "utils/permissions";

import { getEM } from "utils/mikro";
import { EntityData, Loaded, QueryOrder } from "@mikro-orm/core";
import { STM_Rule_db } from "server/database/models/_allModels";
import { convertStmRulesTypeDbToStore, convertStmRulesTypeStoreToDb } from "store/storeUtils/stm";
import { emitStoreDelete, emitStoreUpsert } from "../sockets";

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
  const viewPermission = await hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    appUser: req.session.appUser,
  });
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  try {
    const records: STMRule[] = await getStmRules(queryObj.missionId);

    res.status(200).json({
      status: "success",
      message: `Rules for mission ${queryObj.missionId} retrieved`,
      data: records,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, stmRules } = req.body as STMRuleUpsertRequest;
  const editPermission = await hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
  });
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!missionId || isNaN(missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  try {
    const upsertResponse: STMRule[] = await upsertStmRules(missionId, stmRules);

    // emit the upserted item to all clients via socket.io
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
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, stmRuleUuids } = req.body as STMRuleDeleteRequest;
  const editPermission = await hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
  });
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!missionId || isNaN(missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
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
    console.error(e);
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
  const em = getEM();

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
export async function upsertStmRules(missionId: number, stmRules: STMRule[]): Promise<STMRule[]> {
  const em = getEM();

  const stmRulesToUpsert = cloneDeep(stmRules); //create a copy to manipulate
  const stmRulesUpsertedToDb = [];

  //build stm rule to upsert
  for (const stmRuleToUpsert of stmRulesToUpsert) {
    //convert fks
    stmRuleToUpsert.missionId = missionId;
    const convertedStmRule: EntityData<STM_Rule_db> = convertStmRulesTypeStoreToDb([
      stmRuleToUpsert,
    ])[0];
    const stmRuleUpsertReference: STM_Rule_db = await em.upsert(STM_Rule_db, convertedStmRule);
    em.persist(stmRuleUpsertReference);

    stmRulesUpsertedToDb.push(stmRuleUpsertReference);
  }

  await em.flush();
  //convert foreign keys
  return convertStmRulesTypeDbToStore(stmRulesUpsertedToDb);
}

/**
 * delete STM rules
 * @param stmRuleUuids the stm rule uuids to delete
 * @returns the deleted stm rules
 */
export async function deleteStmRules(stmRuleUuids: string[]): Promise<string[]> {
  const em = getEM();
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
