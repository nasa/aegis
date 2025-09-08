import type { EntityData } from "@mikro-orm/postgresql";
import type { Request, Response } from "express";

import { ForeignKeyConstraintViolationException, OptimisticLockError } from "@mikro-orm/postgresql";
import express from "express";
import cloneDeep from "lodash/cloneDeep";
import random from "lodash/random";

import { Rex_db } from "server/database/models/_allModels";
import { convertRexesTypeDbToStore, convertRexesTypeStoreToDb } from "store/storeUtils/rex";
import { getEM } from "utils/mikro";
import { hasPerms } from "utils/permissions";

import { emitStoreDelete, emitStoreUpsert } from "../sockets";

const router = express.Router();

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, rexes } = req.body as RexUpsertRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = await hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  if (!rexes) {
    res.status(400).json({
      status: "failure",
      message: `No rexes provided to upsert`,
    });
  }

  try {
    const rexesToUpsert = rexes.map((r) => {
      if (!r.ownerId) {
        return { ...r, ownerId: req.session?.appUser?.id || -1 };
      } else {
        return r;
      }
    });
    //perform the upsert
    let upsertResponse = null;
    for (let tries = 0; tries < 7; tries++) {
      try {
        upsertResponse = await upsertRexes(rexesToUpsert);
        break; // if successful, exit the retry loop
      } catch (e) {
        if (e instanceof OptimisticLockError) {
          // lock error. wait anywhere from 100-200ms before retrying
          await new Promise((resolve) => setTimeout(resolve, random(100, 200)));
        } else {
          // some other kind of error happened
          // re-throw it so the outer try/catch can grab it and exit the for loop
          throw e;
        }
      }
    }

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
    emitStoreUpsert({
      missionId,
      socketId,
      type: "rex",
      data: upsertResponse,
    } as StoreUpsert);

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
  const { missionId, socketId, uuids } = req.body as RexDeleteRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = await hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const deletedRexUuids: string[] = await deleteRexes(uuids);
    if (deletedRexUuids.length > 0) {
      emitStoreDelete({
        missionId,
        socketId,
        type: "rex",
        uuids: deletedRexUuids,
      } as StoreDelete);

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
 * upsert rexes into the database
 * @param rexes rexes to upsert
 * @returns the upserted rexes
 */
export async function upsertRexes(rexes: Rex[]): Promise<Rex[]> {
  const em = getEM();
  await em.begin(); // start a transaction

  const rexesToUpsert: Rex[] = cloneDeep(rexes);
  const rexesUpsertedToDb = [];
  try {
    for (const rexToUpsert of rexesToUpsert) {
      const upsertRecord: EntityData<Rex_db> = convertRexesTypeStoreToDb([rexToUpsert])[0];
      const rexUpsertReference: Rex_db = await em.upsert(Rex_db, upsertRecord);
      em.persist(rexUpsertReference);
      rexesUpsertedToDb.push(rexUpsertReference);
    }
    await em.commit();
  } catch (e) {
    await em.rollback(); // rollback the transaction
    throw e; // re-throw the error to be handled by the caller
  }

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
