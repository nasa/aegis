import type { EntityData, Loaded } from "@mikro-orm/postgresql";
import type { Request, Response } from "express";

import { QueryOrder, ForeignKeyConstraintViolationException } from "@mikro-orm/postgresql";
import express from "express";
import cloneDeep from "lodash/cloneDeep";

import { Traverse_db } from "server/database/models/_allModels";
import {
  convertTraversesTypeDbToStore,
  convertTraversesTypeStoreToDb,
} from "store/storeUtils/traverse";
import { hasPerms } from "utils/permissions";
import { globalValues } from "../global";

import { emitStoreDelete, emitStoreUpsert } from "../sockets";
import { upsertDatabaseRetry } from "utils/database";
import { apiRouteLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, traverses } = req.body as TraverseUpsertRequest;
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
      routeName: "traverse",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: traverses?.map((t) => t.uuid),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    // validate
    if (!traverses || traverses.length === 0) {
      apiRouteLogger({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "traverse",
        appUsername: req.session?.appUser?.username,
        missionId,
        message: "No traverses provided in request body",
      });
      res.status(400).json({ status: "failure", message: "No traverses provided in request body" });
      return;
    }

    const upsertResponse: Traverse[] = await upsertDatabaseRetry(() => upsertTraverses(traverses));

    // Check response
    if (!upsertResponse || upsertResponse.length === 0) {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "traverse",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: traverses?.map((t) => t.uuid),
        message: "Failed to update traverse after multiple tries due to optimistic locking",
        error: new Error(
          "Failed to update traverse after multiple tries due to optimistic locking"
        ),
      });
      res.status(500).json({
        status: "error",
        message: "Failed to update traverse after multiple tries due to optimistic locking",
        data: null,
      });
      return;
    }

    // Emit the upserted item to all clients via socket.io
    emitStoreUpsert({
      missionId,
      socketId,
      type: "traverse",
      data: upsertResponse,
    } as StoreUpsert);

    res.status(200).json({
      status: "success",
      message: `Traverses upserted with Uuids ${upsertResponse.map((t) => t.uuid)}`,
      data: upsertResponse,
    });
  } catch (e) {
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "traverse/",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: traverses?.map((t) => t.uuid),
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, traverseUuids } = req.body as TraverseDeleteRequest;
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
      routeName: "traverse",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: traverseUuids,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const deletedUuids = await deleteTraverses(traverseUuids);
    if (deletedUuids.length > 0) {
      // emit the deleted item to all clients via socket.io
      emitStoreDelete({
        missionId,
        socketId,
        type: "traverse",
        uuids: deletedUuids,
      } as StoreDelete);

      res.status(200).json({
        status: "success",
        message: "Traverse Deleted",
      });
    } else {
      apiRouteLogger({
        logLevel: "notice",
        httpMethod: "DELETE",
        responseStatus: 404,
        routeName: "traverse",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: traverseUuids,
        message: "Record not found. Nothing deleted",
      });
      res.status(404).json({
        status: "failure",
        message: "Record not found. Nothing deleted",
      });
    }
  } catch (e) {
    if (e instanceof ForeignKeyConstraintViolationException) {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "DELETE",
        responseStatus: 500,
        routeName: "traverse",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: traverseUuids,
        message: "Cannot delete traverse. This Traverse is referenced elsewhere",
        error: asError(e),
      });
      res.status(500).json({
        status: "error",
        message: "Cannot delete traverse. This Traverse is referenced elsewhere",
      });
    } else {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "DELETE",
        responseStatus: 500,
        routeName: "traverse",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: traverseUuids,
        message: "Error processing the DELETE request",
        error: asError(e),
      });
      res.status(500).json({ status: "error", message: "Error processing the DELETE request" });
    }
  }
});

export default router;

/**
 * get Traverse(s) from the database
 * @param missionId required. Mission ID for the traverse.
 * @param traverseUuid optional. UUID of the traverse to retrieve
 * @returns array of traverses
 */
export async function getTraverses(missionId: number, traverseUuid?: string): Promise<Traverse[]> {
  const em = globalValues.orm.em;

  //find traverses by either mission Id or uuid
  let dbTraverses: Loaded<Traverse_db, never>[];

  if (traverseUuid) {
    dbTraverses = await em.find(
      Traverse_db,
      { uuid: traverseUuid },
      { orderBy: [{ name: QueryOrder.ASC }] }
    );
  } else {
    dbTraverses = await em.find(
      Traverse_db,
      { mission: { id: missionId } },
      { orderBy: [{ name: QueryOrder.ASC }] }
    );
  }

  //convert foreign keys
  return convertTraversesTypeDbToStore(dbTraverses);
}

/**
 * Gets traverses refUuids by their uuids.
 * @param traverseUuids array of traverse uuids to retrieve
 * @returns array of traverse refUuids
 */
export async function getTraverseRefUuids(traverseUuids: string[]): Promise<string[]> {
  const em = globalValues.orm.em;
  const dbTraverses: Loaded<Traverse_db>[] = await em.find(Traverse_db, {
    uuid: { $in: traverseUuids },
  });
  return dbTraverses.map((t) => t.refUuid);
}

/**
 * Inserts or Updates Traverses into the database
 * @param traverses the Traverse objects to upsert
 * @returns a copy of the Traverse objects that was upserted
 */
async function upsertTraverses(traverses: Traverse[]): Promise<Traverse[]> {
  const em = globalValues.orm.em;
  await em.begin(); // Start a transaction

  const traversesToUpsert = cloneDeep(traverses); // Create a copy to manipulate
  const traversesUpsertedToDb = [];

  try {
    for (const traverseToUpsert of traversesToUpsert) {
      const convertedTraverse: EntityData<Traverse_db> = convertTraversesTypeStoreToDb([
        traverseToUpsert,
      ])[0];

      // Upsert traverse
      const traverseRefFromDb: Traverse_db = await em.upsert(Traverse_db, convertedTraverse);
      em.persist(traverseRefFromDb);
      traversesUpsertedToDb.push(traverseRefFromDb);
    }

    await em.commit(); // Flush and commit the transaction
  } catch (e) {
    await em.rollback(); // Rollback the transaction
    throw e; // Re-throw the error to be handled by the caller
  }

  // Convert foreign keys
  return convertTraversesTypeDbToStore(traversesUpsertedToDb);
}

/**
 * Deletes Traverses and the entity relationships to any POIs.
 * @param traverseUuids Traverse uuid to delete
 * @returns the uuids of the deleted Traverses
 */
async function deleteTraverses(traverseUuids: string[]): Promise<string[]> {
  const em = globalValues.orm.em;
  const deletedUuids = [];
  for (const traverseUuid of traverseUuids) {
    const entity = await em.findOne(Traverse_db, { uuid: traverseUuid });
    if (entity) {
      deletedUuids.push(traverseUuid);
      em.remove(entity); //delete traverse
    }
  }

  await em.flush(); //perform deletes
  return deletedUuids;
}
