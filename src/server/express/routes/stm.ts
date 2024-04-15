import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import _ from "lodash";

import { hasPerms } from "utils/permissions";

import { getEM } from "utils/mikro";
import {
  EntityData,
  EntityName,
  ForeignKeyConstraintViolationException,
  Loaded,
  QueryOrder,
} from "@mikro-orm/core";
import { STM_Level1_db, STM_Level2_db, STM_Level3_db } from "server/database/models/_allModels";
import {
  convertStms1TypeDbToStore,
  convertStms1TypeStoreToDb,
  convertStms2TypeDbToStore,
  convertStms2TypeStoreToDb,
  convertStms3TypeDbToStore,
  convertStms3TypeStoreToDb,
} from "store/storeUtils/stm";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, stmType, l1, l2, l3 } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    stmType: stmType ? stmType.toString() : undefined,
    l1: l1 ? l1.toString() : undefined,
    l2: l2 ? l2.toString() : undefined,
    l3: l3 ? l3.toString() : undefined,
  };
  return queryObj;
};
type QueryParamDict = {
  l1: string;
  l2: string;
  l3: string;
  a: string;
};

const queryParamDict: QueryParamDict = {
  l1: "Level1",
  l2: "level2",
  l3: "level3",
  a: "ALL",
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const viewPermission = await hasPerms(queryObj.missionId, "view", req.session.user);
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || _.isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  //required for all queries. validate.
  if (!queryObj.stmType) {
    res.status(500).json({ status: "error", message: "Invalid stm type" });
    return;
  }
  try {
    let records: STMLevel1[] | STMLevel2[] | STMLevel3[] = [];

    if (queryObj.stmType === "l1") {
      records = await getLevel1s(queryObj.missionId, queryObj.l1);
    } else if (queryObj.stmType === "l2") {
      records = await getLevel2s(queryObj.missionId, queryObj.l1, queryObj.l2);
    } else if (queryObj.stmType === "l3") {
      records = await getLevel3s(queryObj.missionId, queryObj.l1, queryObj.l2, queryObj.l3);
    } else {
      res.status(500).json({ status: "error", message: "Invalid stm type" });
      return;
    }

    res.status(200).json({
      status: "success",
      message: `${queryParamDict[queryObj.stmType as keyof QueryParamDict]} retrieved`,
      data: records,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, stmObjects, stmType } = req.body as STMUpsertRequest;
  const editPermission = await hasPerms(missionId, "edit", req.session.user);
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    let upsertResponse: STMLevel1[] | STMLevel2[] | STMLevel3[] = [];

    switch (stmType) {
      case "Level1":
        upsertResponse = await upsertSTMs(stmObjects as STMLevel1[], stmType);
        break;
      case "Level2":
        upsertResponse = await upsertSTMs(stmObjects as STMLevel2[], stmType);
        break;
      case "Level3":
        upsertResponse = await upsertSTMs(stmObjects as STMLevel3[], stmType);
        break;
      default:
        res.status(500).json({ status: "error", message: "Invalid STM type provided" });
        return;
    }

    //check response
    if (upsertResponse.length > 0) {
      res.status(200).json({
        status: "success",
        message: `${stmType} upserted with uuid ${upsertResponse.map((s) => s.uuid)}`,
        data: upsertResponse,
      });
    } else {
      res.status(500).json({
        status: "error",
        message: "Upsert response did not return a value",
        data: null,
      });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, stmType, uuids } = req.body as STMDeleteRequest;
  const editPermission = await hasPerms(missionId, "edit", req.session.user);
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    let deletedResponse: string[];

    if (stmType === "Level1") {
      deletedResponse = await deleteSTMs(uuids, "Level1");
    } else if (stmType === "Level2") {
      deletedResponse = await deleteSTMs(uuids, "Level2");
    } else if (stmType === "Level3") {
      deletedResponse = await deleteSTMs(uuids, "Level3");
    } else if (stmType === "ALL" && missionId) {
      const deleteMessage = await deleteSTMTree(missionId);
      deletedResponse = [deleteMessage];
    } else {
      res.status(500).json({ status: "error", message: "Invalid STM type provided" });
      return;
    }

    if (deletedResponse.length > 0) {
      res.status(200).json({
        status: "success",
        message: `${stmType} deleted`,
      });
    } else {
      res.status(404).json({
        status: "failure",
        message: `Record not found. Nothing deleted`,
      });
    }
  } catch (e) {
    console.error(e);
    if (e instanceof ForeignKeyConstraintViolationException) {
      res.status(500).json({
        status: "error",
        message: "Cannot delete mission. This mission is referenced elsewhere",
        data: null,
      });
    } else {
      res.status(500).json({
        status: "error",
        message: "Error processing the DELETE request",
        data: null,
      });
    }
  }
});

export default router;

/**
 * get level1(s) from the database.
 * @param missionId the mission id. required
 * @param level1Uuid optional level1 uuid to retrieve. No value will retrieve all level1s for the mission
 * @returns array of stm level1s. returns empty array if no records found
 */
export async function getLevel1s(missionId: number, level1Uuid?: string): Promise<STMLevel1[]> {
  const em = getEM();

  let level1s: Loaded<STM_Level1_db, never>[];
  if (level1Uuid) {
    level1s = await em.find(
      STM_Level1_db,
      { uuid: level1Uuid, mission: { id: missionId } },
      { orderBy: { numbering: QueryOrder.ASC } }
    );
  } else {
    level1s = await em.find(
      STM_Level1_db,
      { mission: { id: missionId } },
      { orderBy: { numbering: QueryOrder.ASC } }
    );
  }

  if (level1s) {
    return convertStms1TypeDbToStore(level1s); //convert fks
  } else {
    return [];
  }
}

/**
 * get level2(s) from the database
 * @param missionId the mission id. required
 * @param level1Uuid optional level1 uuid. If specified, all level2s under this level1 are returned
 * @param level2Uuid optional level2 uuid to retrieve. No value will retrieve all level2s for the mission/level1
 * @returns array of stm level2s. returns empty array if no records found
 */
export async function getLevel2s(
  missionId: number,
  level1Uuid?: string,
  level2Uuid?: string
): Promise<STMLevel2[]> {
  const em = getEM();

  //build the "where" options in Mikro ORM syntax
  const level1WhereClause: { uuid?: string; mission: { id: number } } = {
    mission: { id: missionId },
  };
  if (level1Uuid) level1WhereClause.uuid = level1Uuid;

  const level2WhereClause: { uuid?: string; level1: {} } = { level1: level1WhereClause };
  if (level2Uuid) level2WhereClause.uuid = level2Uuid;

  const level2s: Loaded<STM_Level2_db, never>[] = await em.find(
    STM_Level2_db,
    { ...level2WhereClause },
    { orderBy: [{ level1: { numbering: QueryOrder.ASC } }, { numbering: QueryOrder.ASC }] }
  );

  if (level2s) {
    return convertStms2TypeDbToStore(level2s); //convert fks
  } else {
    return [];
  }
}

/**
 * get level3(s) from the database
 * @param missionId the mission id. required
 * @param level1Uuid optional level1 uuid. If specified, all level3s under this level1 are returned
 * @param level2Uuid optional level2 uuid. If specified, all level3s under this level2 are returned
 * @param level3Uuid optional level3 uuid to retrieve. No value will retrieve all level3s for the mission/level1/level2
 * @returns array of stm level3s. returns empty array if no records found
 */
export async function getLevel3s(
  missionId: number,
  level1Uuid?: string,
  level2Uuid?: string,
  level3Uuid?: string
): Promise<STMLevel3[]> {
  const em = getEM();

  //build the "where" options in Mikro ORM syntax
  const level1WhereClause: { uuid?: string; mission: { id: number } } = {
    mission: { id: missionId },
  };
  if (level1Uuid) level1WhereClause.uuid = level1Uuid;

  const level2WhereClause: { uuid?: string; level1: {} } = { level1: level1WhereClause };
  if (level2Uuid) level2WhereClause.uuid = level2Uuid;

  const level3WhereClause: { uuid?: string; level2: {} } = { level2: level2WhereClause };
  if (level3Uuid) level3WhereClause.uuid = level3Uuid;

  const level3s: Loaded<STM_Level3_db, never>[] = await em.find(
    STM_Level3_db,
    { ...level3WhereClause },
    {
      orderBy: [
        { level2: { level1: { numbering: QueryOrder.ASC } } },
        { level2: { numbering: QueryOrder.ASC } },
        { numbering: QueryOrder.ASC },
      ],
    }
  );

  if (level3s) {
    return convertStms3TypeDbToStore(level3s); //convert fks
  } else {
    return [];
  }
}

/**
 * Inserts or Updates either level1s, level2, or level3s into the database.
 * Takes the object and converts fks to upsert, then converts them back on return
 * @param stmObjects the STM level1s, level2, or level3s object to upsert
 * @param stmType a string representation of the record type. This is used to type check at runtime since these are custom typescript types
 * @returns a copy of the STM objects that were upserted
 */
export async function upsertSTMs(
  stmObjects: STMLevel1[] | STMLevel2[] | STMLevel3[],
  stmType: "Level1" | "Level2" | "Level3"
): Promise<STMLevel1[] | STMLevel2[] | STMLevel3[]> {
  const em = getEM();

  //determine the db table and perform upsert
  if (stmType === "Level1") {
    const stmsUpsertedToDb: STMLevel1[] = [];
    for (const stmObject of stmObjects) {
      const level1 = stmObject as STMLevel1;
      const convertedLevel1: EntityData<STM_Level1_db> = convertStms1TypeStoreToDb([level1])[0]; //convert fks

      const upsertReference: STM_Level1_db = await em.upsert(STM_Level1_db, convertedLevel1);
      em.persist(upsertReference);

      const upsertedLevel1: STMLevel1 = convertStms1TypeDbToStore([upsertReference])[0];
      stmsUpsertedToDb.push(upsertedLevel1);
    }
    await em.flush();
    return stmsUpsertedToDb;
  } else if (stmType === "Level2") {
    const stmsUpsertedToDb: STMLevel2[] = [];
    for (const stmObject of stmObjects) {
      const level2 = stmObject as STMLevel2;
      const convertedLevel2: EntityData<STM_Level2_db> = convertStms2TypeStoreToDb([level2])[0]; //convert fks

      const upsertReference: STM_Level2_db = await em.upsert(STM_Level2_db, convertedLevel2);
      em.persist(upsertReference);

      const upsertedLevel2: STMLevel2 = convertStms2TypeDbToStore([upsertReference])[0];
      stmsUpsertedToDb.push(upsertedLevel2);
    }
    await em.flush();
    return stmsUpsertedToDb;
  } else {
    const stmsUpsertedToDb: STMLevel3[] = [];
    for (const stmObject of stmObjects) {
      const level3 = stmObject as STMLevel3;
      const convertedLevel3: EntityData<STM_Level3_db> = convertStms3TypeStoreToDb([level3])[0];

      const upsertReference: STM_Level3_db = await em.upsert(STM_Level3_db, convertedLevel3);
      em.persist(upsertReference);

      const upsertedLevel3: STMLevel3 = convertStms3TypeDbToStore([upsertReference])[0];
      stmsUpsertedToDb.push(upsertedLevel3);
    }
    await em.flush();
    return stmsUpsertedToDb;
  }
}

/**
 * Deletes level1s, level2s, or level3s for given UUIDs
 * @param stmUUID UUIDs of the level1, level2, or level3 to delete
 * @param stmType the type of STM object
 * @return Retruns a promise of a string uuids of the entity deleted
 */
export async function deleteSTMs(
  stmUuids: string[],
  stmType: "Level1" | "Level2" | "Level3"
): Promise<string[]> {
  const em = getEM();
  const deletedUuids = [];
  let tableEntity: EntityName<STM_Level1_db | STM_Level2_db | STM_Level3_db>;

  if (stmType === "Level1") {
    tableEntity = STM_Level1_db;
  } else if (stmType === "Level2") {
    tableEntity = STM_Level2_db;
  } else {
    tableEntity = STM_Level3_db;
  }
  for (const stmUuid of stmUuids) {
    const entity = await em.findOne(tableEntity, stmUuid);
    if (entity) {
      em.remove(entity);
      deletedUuids.push(stmUuid);
    }
  }
  await em.flush(); //perform deletes
  return deletedUuids;
}

/**
 * Deletes entire STM tree for a given mission
 */
export async function deleteSTMTree(missionId: number): Promise<string> {
  const em = getEM();

  // loop through hierarchy and delete. There's probably a better way to do this but I burned hours so this is it for now
  const level1s = await getLevel1s(missionId);
  for (const level1 of level1s) {
    const level2s = await getLevel2s(missionId, level1.uuid);
    for (const level2 of level2s) {
      const level3s = await getLevel3s(missionId, null, level2.uuid);
      for (const level3 of level3s) {
        const entity = await em.findOne(STM_Level3_db, level3.uuid);
        em.remove(entity);
      }
      const entity = await em.findOne(STM_Level2_db, level2.uuid);
      em.remove(entity);
    }
    const entity = await em.findOne(STM_Level1_db, level1.uuid);
    em.remove(entity);
  }
  await em.flush();

  return "all items deleted";
}
