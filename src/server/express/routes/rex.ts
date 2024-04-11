import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import _ from "lodash";

import { hasPerms } from "utils/permissions";

import { getEM } from "utils/mikro";
import { EntityData, ForeignKeyConstraintViolationException } from "@mikro-orm/core";
import { Rex_db } from "server/database/models/_allModels";
import { emitStoreDelete, emitStoreUpsert } from "../sockets";
import { convertRexesTypeDbToStore, convertRexesTypeStoreToDb } from "store/storeUtils/rex";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, socketId, uuid, log } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    socketId: socketId ? (socketId as string) : undefined,
    uuid: uuid ? uuid.toString() : null,
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
  if (!queryObj.missionId || _.isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  try {
    const records = await getRexes(queryObj.missionId);

    res.status(200).json({
      status: "success",
      message: "rex retrieved",
      data: records,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
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
    //perform the upsert
    const rexes: Rex[] = req.body as Rex[];
    const upsertResponse: Rex[] = await upsertRexes(rexes);

    //check response
    if (upsertResponse.length === 0) {
      res.status(500).json({
        status: "error",
        message: "Upsert response did not return a value",
        data: null,
      });
      return;
    }

    // emit the upserted item to all clients via socket.io
    emitStoreUpsert(
      {
        missionId: queryObj.missionId,
        socketId: queryObj.socketId,
        type: "rex",
        data: upsertResponse,
      } as StoreUpsert<Rex>,
      queryObj.logAction
    );

    res.status(200).json({
      status: "success",
      message: `Rex upserted with uuid ${upsertResponse.map((r) => r.uuid)}`,
      data: upsertResponse,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
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
    const deletedRexUuids: string[] = await deleteRexes(uuidsToDelete);
    if (deletedRexUuids.length > 0) {
      emitStoreDelete(
        {
          missionId: queryObj.missionId,
          socketId: queryObj.socketId,
          type: "rex",
          uuids: deletedRexUuids,
        } as StoreDelete,
        queryObj.logAction
      );

      res.status(200).json({
        status: "success",
        message: "Rex Deleted",
      });
    } else {
      res.status(404).json({
        status: "failure",
        message: "No record found. Nothing deleted",
      });
    }
  } catch (e) {
    console.error(e);
    if (e instanceof ForeignKeyConstraintViolationException) {
      res.status(500).json({
        status: "error",
        message: "Cannot delete rex. The rex is referenced elsewhere",
      });
    } else {
      res.status(500).json({ status: "error", message: "Error processing the DELETE request" });
    }
  }
});

export default router;
/**
 * get rex(s) from the database
 * @param missionId mission id to get rexes for
 * @returns rexes
 */
export async function getRexes(missionId: number): Promise<Rex[]> {
  const em = getEM();
  const rexes = await em.find(Rex_db, { mission: missionId });

  return convertRexesTypeDbToStore(rexes);
}

/**
 * upserts rexes into the database
 * @param rexes rexes to upsert
 * @returns the upserted rexes
 */
export async function upsertRexes(rexes: Rex[]): Promise<Rex[]> {
  const em = getEM();

  const rexesToUpsert: Rex[] = _.cloneDeep(rexes);
  const rexesUpsertedToDb = [];

  for (const rexToUpsert of rexesToUpsert) {
    const upsertRecord: EntityData<Rex_db> = convertRexesTypeStoreToDb([rexToUpsert])[0];
    const rexUpsertReference: Rex_db = await em.upsert(Rex_db, upsertRecord);
    em.persist(rexUpsertReference);
    rexesUpsertedToDb.push(rexUpsertReference);
  }
  await em.flush();

  //convert foreign keys
  return convertRexesTypeDbToStore(rexesUpsertedToDb);
}

/**
 * Deletes rexes
 * @param uuids rex uuids to delete
 * @returns the uuids of the deleted rexes
 */
export async function deleteRexes(uuids: string[]): Promise<string[]> {
  const em = getEM();
  const deletedUuids = [];
  for (const uuid of uuids) {
    const entity = await em.findOne(Rex_db, uuid);
    if (entity) {
      em.remove(entity); //delete rex
      deletedUuids.push(uuid);
    }
  }
  await em.flush(); //perform deletes
  return deletedUuids;
}
