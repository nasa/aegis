import type { Request, Response } from "express";
import type { EntityData, Loaded } from "@mikro-orm/postgresql";

import { ForeignKeyConstraintViolationException, QueryOrder } from "@mikro-orm/postgresql";
import express from "express";
import cloneDeep from "lodash/cloneDeep";

import { Eva_db } from "server/database/models/_allModels";
import { emitStoreDelete, emitStoreUpsert } from "server/express/sockets";
import { convertEVAsTypeDbToStore, convertEVAsTypeStoreToDb } from "store/storeUtils/eva";
import { hasPerms } from "utils/permissions";
import { globalValues } from "../global";
import { upsertDatabaseRetry } from "utils/database";
import { ConsoleLogger as serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { socketId, missionId, evas } = req.body as EvaUpsertRequest;
  const emssToken = req.headers["emss-token"] as string;
  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "eva",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: evas?.map((e) => e.uuid),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    // validate
    if (!evas || evas.length === 0) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "eva",
        appUsername: req.session?.appUser?.username,
        missionId,
        message: "No EVAs provided in request body",
      });
      res.status(400).json({ status: "failure", message: "No EVAs provided in request body" });
      return;
    }

    // Add owner id to the evas
    const evasToUpsert = evas.map((e) => {
      if (!e.ownerId) {
        return { ...e, ownerId: req.session?.appUser?.id || -1 }; // default to -1 if no user (emss-token call)
      } else {
        return e;
      }
    });

    const upsertResponse: Eva[] = await upsertDatabaseRetry(() => upsertEVAs(evasToUpsert));

    // Check response
    if (!upsertResponse || upsertResponse.length === 0) {
      serverLogger.apiRoute({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "eva",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: evas?.map((e) => e.uuid),
        message: "Failed to update eva after multiple tries due to optimistic locking",
        error: new Error("Failed to update eva after multiple tries due to optimistic locking"),
      });
      res.status(500).json({
        status: "error",
        message: "Failed to update eva after multiple tries due to optimistic locking",
        data: null,
      });
      return;
    }

    // Emit the upserted item to all clients via socket.io
    emitStoreUpsert({
      missionId,
      socketId,
      type: "eva",
      data: upsertResponse,
    } as StoreUpsert);
    res.status(200).json({
      status: "success",
      message: `EVAs upserted with Uuids ${upsertResponse.map((e) => e.uuid)}`,
      data: upsertResponse,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "eva",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: evas?.map((e) => e.uuid),
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { socketId, missionId, evaUuids } = req.body as EvaDeleteRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "DELETE",
      responseStatus: 401,
      routeName: "eva",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: evaUuids,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const deletedUuids = await deleteEVAs(evaUuids);
    if (deletedUuids.length > 0) {
      // emit the deleted item to all clients via socket.io
      emitStoreDelete({
        missionId,
        socketId,
        type: "eva",
        uuids: deletedUuids,
      } as StoreDelete);
      res.status(200).json({
        status: "success",
        message: "EVA Deleted",
      });
    } else {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "DELETE",
        responseStatus: 404,
        routeName: "eva",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: evaUuids,
        message: "Record not found. Nothing deleted",
      });
      res.status(404).json({
        status: "failure",
        message: "Record not found. Nothing deleted",
      });
    }
  } catch (e) {
    serverLogger.error(
      { logId: "eva", logValue: "Error deleting EVA" },
      e instanceof Error ? e : new Error(String(e))
    );
    if (e instanceof ForeignKeyConstraintViolationException) {
      serverLogger.apiRoute({
        logLevel: "error",
        httpMethod: "DELETE",
        responseStatus: 500,
        routeName: "eva",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: evaUuids,
        message: "Cannot delete eva. This EVA is referenced elsewhere",
        error: asError(e),
      });
      res.status(500).json({
        status: "error",
        message: "Cannot delete eva. This EVA is referenced elsewhere",
      });
    } else {
      serverLogger.apiRoute({
        logLevel: "error",
        httpMethod: "DELETE",
        responseStatus: 500,
        routeName: "eva",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: evaUuids,
        message: "Error processing the DELETE request",
        error: asError(e),
      });
      res.status(500).json({ status: "error", message: "Error processing the DELETE request" });
    }
  }
});

export default router;

/**
 * get EVA(s) from the database
 * @param missionId required. Mission ID for the eva.
 * @param evaUuid optional. UUID of the eva to retrieve
 * @returns array of evas
 */
export async function getEVAs(missionId: number, evaUuid?: string): Promise<Eva[]> {
  const em = globalValues.orm.em;

  //find evas by either mission Id or uuid
  let dbEvas: Loaded<Eva_db, never>[];

  if (evaUuid) {
    dbEvas = await em.find(Eva_db, { uuid: evaUuid }, { orderBy: [{ name: QueryOrder.ASC }] });
  } else {
    dbEvas = await em.find(Eva_db, { missionId }, { orderBy: [{ name: QueryOrder.ASC }] });
  }

  //convert foreign keys
  return convertEVAsTypeDbToStore(dbEvas);
}

/**
 * Gets EVA(s) refUuids by their uuids.
 * @param evaUuids array of EVA uuids to retrieve
 * @returns array of EVA refUuids
 */
export async function getEVARefUuids(evaUuids: string[]): Promise<string[]> {
  const em = globalValues.orm.em;
  const dbEvas: Loaded<Eva_db>[] = await em.find(Eva_db, {
    uuid: { $in: evaUuids },
  });
  return dbEvas.map((e) => e.refUuid);
}

/**
 * Inserts or Updates EVAs into the database
 * @param evas the EVA objects to upsert
 * @returns a copy of the EVA objects that was upserted
 */
async function upsertEVAs(evas: Eva[]): Promise<Eva[]> {
  const em = globalValues.orm.em;
  await em.begin(); // Start a transaction

  const evasToUpsert = cloneDeep(evas); // Create a copy to manipulate
  const evasUpsertedToDb = [];

  try {
    for (const evaToUpsert of evasToUpsert) {
      const convertedEva: EntityData<Eva_db> = convertEVAsTypeStoreToDb([evaToUpsert])[0];
      const evaRefFromDb: Eva_db = await em.upsert(Eva_db, convertedEva);
      em.persist(evaRefFromDb);
      evasUpsertedToDb.push(evaRefFromDb);
    }

    await em.commit(); // Flush and commit the transaction
  } catch (e) {
    await em.rollback(); // Rollback the transaction
    throw e; // Re-throw the error to be handled by the caller
  }

  // Convert foreign keys
  return convertEVAsTypeDbToStore(evasUpsertedToDb);
}

/**
 * Deletes a EVAs and the entity relationships to any POIs.
 * @param evaUuids EVA uuids to delete
 * @returns the uuids of the deleted EVA
 */
async function deleteEVAs(evaUuids: string[]): Promise<string[]> {
  const em = globalValues.orm.em;
  const deletedUuids = [];
  for (const evaUuid of evaUuids) {
    const entity = await em.findOne(Eva_db, { uuid: evaUuid });
    if (entity) {
      em.remove(entity); //delete eva
      deletedUuids.push(evaUuid);
    }
  }
  await em.flush(); //perform deletes
  return deletedUuids;
}
