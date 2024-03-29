import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import _ from "lodash";

import { getEM } from "utils/mikro";
import {
  EntityData,
  ForeignKeyConstraintViolationException,
  Loaded,
  QueryOrder,
} from "@mikro-orm/core";
import { hasPerms } from "utils/permissions";
import { v4 as uuidv4 } from "uuid";
import { Eva_db } from "server/database/models/_allModels";
import { emitStoreDelete, emitStoreUpsert } from "server/express/sockets";
import { upsertLogs } from "./log";
import { convertEVAsTypeDbToStore, convertEVAsTypeStoreToDb } from "store/storeUtils/eva";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { uuid, socketId, missionId, log } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    evaUuid: uuid ? (uuid as string) : undefined,
    socketId: socketId ? (socketId as string) : undefined,
    logAction: log === "true",
  };
  return queryObj;
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const viewPermission = await hasPerms(queryObj.missionId, "view", req.session?.user);
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || _.isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  try {
    const evas: Eva[] = await getEVAs(queryObj.missionId, queryObj.evaUuid);

    res.status(200).json({
      status: "success",
      message: "EVAs retrieved",
      data: evas,
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
    const evas: Eva[] = req.body as Eva[];
    //add owner id to the evas
    const evasToUpsert = evas.map((e) => {
      if (!e.ownerId) {
        return { ...e, ownerId: req.session.user.id };
      } else {
        return e;
      }
    });
    const upsertResponse: Eva[] = await upsertEVAs(evasToUpsert);

    //check response
    if (upsertResponse.length === 0) {
      res.status(500).json({
        status: "error",
        message: "Upsert response did not return a value",
        data: null,
      });
      return;
    } else {
      // emit the upserted item to all clients via socket.io
      emitStoreUpsert({
        missionId: queryObj.missionId,
        socketId: queryObj.socketId,
        type: "eva",
        data: upsertResponse,
      } as StoreUpsert<Eva>);
      if (queryObj.logAction) {
        // log this upsert to the log table
        const log: Log = {
          uuid: uuidv4(),
          missionId: queryObj.missionId,
          type: "evaUpsert",
          payloadJson: JSON.stringify(evasToUpsert),
          createdAt: new Date().toISOString(),
        };
        upsertLogs([log]);
      }

      res.status(200).json({
        status: "success",
        message: `EVAs upserted with Uuids ${upsertResponse.map((e) => e.uuid)}`,
        data: upsertResponse,
      });
    }
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
    const deletedUuids = await deleteEVAs(uuidsToDelete);
    if (deletedUuids.length > 0) {
      // emit the deleted item to all clients via socket.io
      emitStoreDelete({
        missionId: queryObj.missionId,
        socketId: queryObj.socketId,
        type: "eva",
        uuids: deletedUuids,
      } as StoreDelete);
      if (queryObj.logAction) {
        // log this deletion to the log table
        const log: Log = {
          uuid: uuidv4(),
          missionId: queryObj.missionId,
          type: "evaDelete",
          payloadJson: JSON.stringify({ uuidsToDelete }),
          createdAt: new Date().toISOString(),
        };
        upsertLogs([log]);
      }

      res.status(200).json({
        status: "success",
        message: "EVA Deleted",
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
        message: "Cannot delete eva. This EVA is referenced elsewhere",
      });
    } else {
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
  const em = getEM();

  //find evas by either mission Id or uuid
  let dbevas: Loaded<Eva_db, never>[];

  if (evaUuid) {
    dbevas = await em.find(Eva_db, { uuid: evaUuid }, { orderBy: [{ name: QueryOrder.ASC }] });
  } else {
    dbevas = await em.find(
      Eva_db,
      { mission: { id: missionId } },
      { orderBy: [{ name: QueryOrder.ASC }] }
    );
  }

  //convert foreign keys
  return convertEVAsTypeDbToStore(dbevas);
}

/**
 * Inserts or Updates EVAs into the database
 * @param evas the EVA objects to upsert
 * @returns a copy of the EVA objects that was upserted
 */
export async function upsertEVAs(evas: Eva[]): Promise<Eva[]> {
  const em = getEM();

  const evasToUpsert = _.cloneDeep(evas); //create a copy to manipulate
  const evasUpsertedToDb = [];

  for (const evaToUpsert of evasToUpsert) {
    const convertedEva: EntityData<Eva_db> = convertEVAsTypeStoreToDb([evaToUpsert])[0];
    const evaRefFromDb: Eva_db = await em.upsert(Eva_db, convertedEva);
    em.persist(evaRefFromDb);
    evasUpsertedToDb.push(evaRefFromDb);
  }

  await em.flush();
  //convert foreign keys
  return convertEVAsTypeDbToStore(evasUpsertedToDb);
}

/**
 * Deletes a EVAs and the entity relationships to any POIs.
 * @param evaUuids EVA uuids to delete
 * @returns the uuids of the deleted EVA
 */
export async function deleteEVAs(evaUuids: string[]): Promise<string[]> {
  const em = getEM();
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
