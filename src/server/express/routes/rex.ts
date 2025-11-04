import type { EntityData } from "@mikro-orm/postgresql";
import type { Request, Response } from "express";

import { ForeignKeyConstraintViolationException } from "@mikro-orm/postgresql";
import express from "express";
import cloneDeep from "lodash/cloneDeep";

import { Rex_db } from "server/database/models/_allModels";
import { convertRexesTypeDbToStore, convertRexesTypeStoreToDb } from "store/storeUtils/rex";
import { getEM } from "utils/mikro";
import { hasPerms } from "utils/permissions";

import { emitStoreDelete, emitStoreUpsert } from "../sockets";
import { upsertDatabaseRetry } from "utils/database";
import { apiRouteLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, rexes } = req.body as RexUpsertRequest;
  const emssToken = req.headers["emss-token"] as string;

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
      routeName: "rex",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: rexes?.map((r) => r.uuid),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  if (!rexes || rexes.length === 0) {
    apiRouteLogger({
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 400,
      routeName: "rex",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: rexes?.map((r) => r.uuid),
      message: `No rexes provided in request body`,
    });
    res.status(400).json({
      status: "failure",
      message: `No rexes provided in request body`,
    });
    return;
  }

  try {
    // Add owner id to the rexes
    const rexesToUpsert = rexes.map((r) => {
      if (!r.ownerId) {
        return { ...r, ownerId: req.session?.appUser?.id || -1 };
      } else {
        return r;
      }
    });

    // Perform the upsert
    const upsertResponse: Rex[] = await upsertDatabaseRetry(() => upsertRexes(rexesToUpsert));

    // Check response
    if (!upsertResponse || upsertResponse.length === 0) {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "rex",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: rexes?.map((r) => r.uuid),
        message: "Failed to update rex after multiple tries due to optimistic locking",
        error: new Error("Failed to update rex after multiple tries due to optimistic locking"),
      });
      res.status(500).json({
        status: "error",
        message: "Failed to update rex after multiple tries due to optimistic locking",
        data: null,
      });
      return;
    }

    // Emit the upserted item to all clients via socket.io
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
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "rex",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: rexes?.map((r) => r.uuid),
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, uuids } = req.body as RexDeleteRequest;
  const emssToken = req.headers["emss-token"] as string;

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
      routeName: "rex",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids,
      message: "Unauthorized",
    });
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
      apiRouteLogger({
        logLevel: "notice",
        httpMethod: "DELETE",
        responseStatus: 404,
        routeName: "rex",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids,
        message: "No record found. Nothing deleted",
      });
      res.status(404).json({
        status: "failure",
        message: "No record found. Nothing deleted",
      });
    }
  } catch (e) {
    if (e instanceof ForeignKeyConstraintViolationException) {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "DELETE",
        responseStatus: 500,
        routeName: "rex",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids,
        message: "Cannot delete rex. The rex is referenced elsewhere",
        error: asError(e),
      });
      res.status(500).json({
        status: "error",
        message: "Cannot delete rex. The rex is referenced elsewhere",
      });
    } else {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "DELETE",
        responseStatus: 500,
        routeName: "rex",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids,
        message: "Error processing the DELETE request",
        error: asError(e),
      });
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
async function upsertRexes(rexes: Rex[]): Promise<Rex[]> {
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
    await em.commit(); // Flush and commit the transaction
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
async function deleteRexes(uuids: string[]): Promise<string[]> {
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
