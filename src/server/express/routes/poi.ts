import type { EntityData } from "@mikro-orm/postgresql";
import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import { QueryOrder } from "@mikro-orm/postgresql";
import express from "express";
import cloneDeep from "lodash/cloneDeep";

import { Poi_db } from "server/database/models/_allModels";
import { convertPoisTypeDbToStore, convertPoisTypeStoreToDb } from "store/storeUtils/poi";
import { hasPerms } from "utils/permissions";
import { globalValues } from "../global";

import { emitStoreDelete, emitStoreUpsert } from "../sockets";
import { upsertDatabaseRetry } from "utils/database";
import { ConsoleLogger as serverLogger } from "utils/logging/serverLogger";
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
  const emssToken = req.headers["emss-token"] as string;

  const viewPermission = hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!viewPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "poi",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "poi",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  try {
    const pois = await getPois(queryObj.missionId);
    res.status(200).json({
      status: "success",
      message: "POIs retrieved",
      data: pois,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "poi",
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
  const { missionId, socketId, pois } = req.body as POIUpsertRequest;
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
      routeName: "poi",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: pois?.map((p) => p.uuid),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    // validate
    if (!pois || pois.length === 0) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "poi",
        appUsername: req.session?.appUser?.username,
        missionId,
        message: "No POIs provided in request body",
      });
      res.status(400).json({ status: "failure", message: "No POIs provided in request body" });
      return;
    }

    // Add owner id to the POIs
    const poisToUpsert = pois.map((p) => {
      if (!p.ownerId) {
        return { ...p, ownerId: req.session?.appUser?.id || -1 };
      } else {
        return p;
      }
    });

    const upsertResponse: POI[] = await upsertDatabaseRetry(() => upsertPois(poisToUpsert));

    // Check response
    if (!upsertResponse || upsertResponse.length === 0) {
      serverLogger.apiRoute({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "poi",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: pois?.map((p) => p.uuid),
        message: "Failed to update poi after multiple tries due to optimistic locking",
        error: new Error("Failed to update poi after multiple tries due to optimistic locking"),
      });
      res.status(500).json({
        status: "error",
        message: "Failed to update poi after multiple tries due to optimistic locking",
        data: null,
      });
      return;
    }

    // Emit the upserted item to all clients via socket.io
    emitStoreUpsert({
      missionId,
      socketId,
      type: "poi",
      data: upsertResponse,
    } as StoreUpsert);

    res.status(200).json({
      status: "success",
      message: "POI upserted",
      data: upsertResponse,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "poi",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: pois?.map((p) => p.uuid),
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, poiUuids } = req.body as POIDeleteRequest;
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
      routeName: "poi",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: poiUuids,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const deletedUuids = await deletePois(poiUuids);

    if (deletedUuids.length > 0) {
      // emit the deleted item to all clients via socket.io
      emitStoreDelete({
        missionId,
        socketId,
        type: "poi",
        uuids: deletedUuids,
      } as StoreDelete);

      res.status(200).json({
        status: "success",
        message: "POI deleted",
      });
    } else {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "DELETE",
        responseStatus: 404,
        routeName: "poi",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: poiUuids,
        message: "No record found. Nothing deleted",
      });
      res.status(404).json({
        status: "failure",
        message: "No record found. Nothing deleted",
      });
    }
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "DELETE",
      responseStatus: 500,
      routeName: "poi",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: poiUuids,
      message: `Error processing the DELETE request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the DELETE request ${e}` });
  }
});

export default router;

export async function getPois(missionId: number): Promise<POI[]> {
  const em = globalValues.orm.em;
  const dbPois = await em.find(Poi_db, { missionId }, { orderBy: { name: QueryOrder.ASC } });

  /** transform the Mikro Poi types into POI types used in the Store */
  return convertPoisTypeDbToStore(dbPois);
}

/**
 * Inserts or Updates POIs into the database
 * @param pois the POI objects to upsert
 * @returns a copy of the POI objects that was upserted
 */
async function upsertPois(pois: POI[]): Promise<POI[]> {
  const em = globalValues.orm.em;
  await em.begin(); // Start a transaction

  const poisToUpsert = cloneDeep(pois); // Create a copy to manipulate
  const poisUpsertedToDb = [];

  try {
    for (const poiToUpsert of poisToUpsert) {
      // Convert foreign keys and upsert
      const convertedPoi: EntityData<Poi_db> = convertPoisTypeStoreToDb([poiToUpsert])[0];
      const poiUpsertReference: Poi_db = await em.upsert(Poi_db, convertedPoi);
      em.persist(poiUpsertReference);
      poisUpsertedToDb.push(poiUpsertReference);
    }

    await em.commit(); // Flush and commit the transaction
  } catch (e) {
    await em.rollback(); // Rollback the transaction
    throw e; // Re-throw the error to be handled by the caller
  }

  // Convert foreign keys
  return convertPoisTypeDbToStore(poisUpsertedToDb);
}

/**
 * Deletes POIs.
 * @param poiUuids Pois uuids to delete
 * @returns the uuids of the deleted POIs
 */
async function deletePois(poiUuids: string[]): Promise<string[]> {
  const em = globalValues.orm.em;
  const deletedUuids = [];
  for (const poiUuid of poiUuids) {
    const entity = await em.findOne(Poi_db, { uuid: poiUuid });
    if (entity) {
      em.remove(entity); //delete poi
      deletedUuids.push(poiUuid);
    }
  }
  await em.flush(); //perform deletes
  return deletedUuids;
}
