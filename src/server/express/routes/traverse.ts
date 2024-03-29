import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import _ from "lodash";

import { hasPerms } from "utils/permissions";

import { getEM } from "utils/mikro";
import {
  Loaded,
  EntityData,
  QueryOrder,
  ForeignKeyConstraintViolationException,
} from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";
import { Traverse_db } from "server/database/models/_allModels";
import { emitStoreDelete, emitStoreUpsert } from "../sockets";
import { upsertLogs } from "./log";
import {
  convertTraversesTypeDbToStore,
  convertTraversesTypeStoreToDb,
} from "store/storeUtils/traverse";

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
    const traverses: Traverse[] = await getTraverses(queryObj.missionId, queryObj.uuid);

    res.status(200).json({
      status: "success",
      message: "Traverses retrieved",
      data: traverses,
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
    const traversesToUpsert: Traverse[] = req.body as Traverse[];
    const upsertResponse: Traverse[] = await upsertTraverses(traversesToUpsert);

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
      missionId: queryObj.missionId,
      socketId: queryObj.socketId,
      type: "traverse",
      data: upsertResponse,
    } as StoreUpsert<Traverse>);

    if (queryObj.logAction) {
      // log this upsert to the log table
      const log: Log = {
        uuid: uuidv4(),
        missionId: queryObj.missionId,
        type: "traverseUpsert",
        payloadJson: JSON.stringify(traversesToUpsert),
        createdAt: new Date().toISOString(),
      };
      upsertLogs([log]);
    }

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
  const queryObj = parseQuery(req.query);
  const editPermission = await hasPerms(queryObj.missionId, "edit", req.session.user);
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const uuidsToDelete: string[] = req.body;
    const deletedUuids = await deleteTraverses(uuidsToDelete);
    if (deletedUuids.length > 0) {
      // emit the deleted item to all clients via socket.io
      emitStoreDelete({
        missionId: queryObj.missionId,
        socketId: queryObj.socketId,
        type: "traverse",
        uuids: deletedUuids,
      } as StoreDelete);

      if (queryObj.logAction) {
        // log this deletion to the log table
        const log: Log = {
          uuid: uuidv4(),
          missionId: queryObj.missionId,
          type: "traverseDelete",
          payloadJson: JSON.stringify({ deletedUuids }),
          createdAt: new Date().toISOString(),
        };
        upsertLogs([log]);
      }

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
  let dbtraverses: Loaded<Traverse_db, never>[];

  if (traverseUuid) {
    dbtraverses = await em.find(
      Traverse_db,
      { uuid: traverseUuid },
      { orderBy: [{ name: QueryOrder.ASC }] }
    );
  } else {
    dbtraverses = await em.find(
      Traverse_db,
      { mission: { id: missionId } },
      { orderBy: [{ name: QueryOrder.ASC }] }
    );
  }

  //convert foreign keys
  return convertTraversesTypeDbToStore(dbtraverses);
}

/**
 * Inserts or Updates Traverses into the database
 * @param traverses the Traverse objects to upsert
 * @returns a copy of the Traverse objects that was upserted
 */
export async function upsertTraverses(traverses: Traverse[]): Promise<Traverse[]> {
  const em = getEM();

  const traversesToUpsert = _.cloneDeep(traverses); //create a copy to manipulate
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
