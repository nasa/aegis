import express, { Request, Response } from "express";

import cloneDeep from "lodash/cloneDeep";

import { hasPerms } from "utils/permissions";

import { getEM } from "utils/mikro";
import {
  Loaded,
  EntityData,
  QueryOrder,
  ForeignKeyConstraintViolationException,
} from "@mikro-orm/core";
import { Traverse_db } from "server/database/models/_allModels";
import { emitStoreDelete, emitStoreUpsert } from "../sockets";
import {
  convertTraversesTypeDbToStore,
  convertTraversesTypeStoreToDb,
} from "store/storeUtils/traverse";

const router = express.Router();

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, traverses } = req.body as TraverseUpsertRequest;
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
    const upsertResponse: Traverse[] = await upsertTraverses(traverses);

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
      type: "traverse",
      data: upsertResponse,
    } as StoreUpsert);

    res.status(200).json({
      status: "success",
      message: `Traverses upserted with Uuids ${upsertResponse.map((t) => t.uuid)}`,
      data: upsertResponse,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, traverseUuids } = req.body as TraverseDeleteRequest;
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
      res.status(404).json({
        status: "failure",
        message: "Record not found. Nothing deleted",
      });
    }
  } catch (e) {
    console.error(e);
    if (e instanceof ForeignKeyConstraintViolationException) {
      res.status(500).json({
        status: "error",
        message: "Cannot delete traverse. This Traverse is referenced elsewhere",
      });
    } else {
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
  const em = getEM();

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
  const em = getEM();
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
export async function upsertTraverses(traverses: Traverse[]): Promise<Traverse[]> {
  const em = getEM();

  const traversesToUpsert = cloneDeep(traverses); //create a copy to manipulate
  const traversesUpsertedToDb = [];

  for (const traverseToUpsert of traversesToUpsert) {
    const convertedTraverse: EntityData<Traverse_db> = convertTraversesTypeStoreToDb([
      traverseToUpsert,
    ])[0];

    //upsert traverse
    const traverseRefFromDb: Traverse_db = await em.upsert(Traverse_db, convertedTraverse);
    em.persist(traverseRefFromDb);
    traversesUpsertedToDb.push(traverseRefFromDb);
  }

  await em.flush();
  //convert foreign keys
  return convertTraversesTypeDbToStore(traversesUpsertedToDb);
}

/**
 * Deletes Traverses and the entity relationships to any POIs.
 * @param traverseUuids Traverse uuid to delete
 * @returns the uuids of the deleted Traverses
 */
export async function deleteTraverses(traverseUuids: string[]): Promise<string[]> {
  const em = getEM();
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
