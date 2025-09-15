import type { Request, Response } from "express";
import type { EntityData, Loaded } from "@mikro-orm/postgresql";

import { ForeignKeyConstraintViolationException, QueryOrder } from "@mikro-orm/postgresql";
import express from "express";
import cloneDeep from "lodash/cloneDeep";

import { Eva_db } from "server/database/models/_allModels";
import { emitStoreDelete, emitStoreUpsert } from "server/express/sockets";
import { convertEVAsTypeDbToStore, convertEVAsTypeStoreToDb } from "store/storeUtils/eva";
import { getEM } from "utils/mikro";
import { hasPerms } from "utils/permissions";
import { upsertDatabaseRetry } from "utils/database";

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
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
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
      res.status(500).json({
        status: "error",
        message: "Failed to update eva after multiple tries",
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
    console.error(e);
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
  let dbEvas: Loaded<Eva_db, never>[];

  if (evaUuid) {
    dbEvas = await em.find(Eva_db, { uuid: evaUuid }, { orderBy: [{ name: QueryOrder.ASC }] });
  } else {
    dbEvas = await em.find(
      Eva_db,
      { mission: { id: missionId } },
      { orderBy: [{ name: QueryOrder.ASC }] }
    );
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
  const em = getEM();
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
  const em = getEM();
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
