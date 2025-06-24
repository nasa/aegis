import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import cloneDeep from "lodash/cloneDeep";

import { hasPerms } from "utils/permissions";

import { getEM } from "utils/mikro";
import { EntityData, ForeignKeyConstraintViolationException, QueryOrder } from "@mikro-orm/core";
import { Eva_db, Rex_db } from "server/database/models/_allModels";
import { emitStoreDelete, emitStoreUpsert } from "../sockets";
import { convertRexesTypeDbToStore, convertRexesTypeStoreToDb } from "store/storeUtils/rex";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, socketId, uuid, evaRefUuid } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    socketId: socketId ? (socketId as string) : undefined,
    uuid: uuid ? uuid.toString() : null,
    evaRefUuid: evaRefUuid ? (evaRefUuid as string) : undefined,
  };
  return queryObj;
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const emssToken = req.headers["emss-token"] as string;

  const viewPermission = await hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    user: req.session.user,
    emssToken,
  });
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
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

// Get eva refs
router.get("/byEvaRef", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const emssToken = req.headers["emss-token"] as string;

  const viewPermission = await hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    user: req.session.user,
    emssToken,
  });
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  //check for required mission id is valid
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  if (!queryObj.evaRefUuid) {
    res.status(500).json({ status: "error", message: "No EVA Ref given" });
    return;
  }

  try {
    const em = getEM();

    const evaWhereClause: {
      refUuid?: string;
    } = {};
    if (queryObj.evaRefUuid) evaWhereClause.refUuid = queryObj.evaRefUuid;

    const dbEvas = await em.find(Eva_db, evaWhereClause, {
      fields: ["uuid", "refUuid", "createdAt"],
      orderBy: { createdAt: QueryOrder.ASC },
    });

    dbEvas.shift(); // remove As Planned EVA (no rex attached)

    const rexWhereClause: {
      evaUuid?: { $in: string[] };
    } = {};
    if (dbEvas.length > 0) rexWhereClause.evaUuid = { $in: dbEvas.map((e) => e.uuid) };

    const dbRexes = await em.find(Rex_db, rexWhereClause, {
      fields: ["evaUuid", "uuid", "name", "createdAt", "updatedAt", "isRunning"],
      orderBy: { name: QueryOrder.ASC },
    });

    const refRexes = dbRexes.map((rex) => ({
      uuid: rex.uuid,
      name: rex.name,
      createdAt: rex.createdAt.toISOString(),
      updatedAt: rex.updatedAt.toISOString(),
      isRunning: rex.isRunning,
    }));

    res.status(200).json({
      status: "success",
      message: `Rexes retrieved`,
      data: refRexes,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error getting rexes ${e}` });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, rexes } = req.body as RexUpsertRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = await hasPerms({
    missionId,
    permission: "edit",
    user: req.session.user,
    emssToken,
  });
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const rexesToUpsert = rexes.map((r) => {
      if (!r.ownerId) {
        return { ...r, ownerId: req.session?.user?.id || -1 };
      } else {
        return r;
      }
    });
    //perform the upsert
    const upsertResponse: Rex[] = await upsertRexes(rexesToUpsert);

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
    user: req.session.user,
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
 * upserts rexes into the database
 * @param rexes rexes to upsert
 * @returns the upserted rexes
 */
export async function upsertRexes(rexes: Rex[]): Promise<Rex[]> {
  const em = getEM();

  const rexesToUpsert: Rex[] = cloneDeep(rexes);
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
