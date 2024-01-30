import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import _ from "lodash";

import { hasPerms } from "utils/permissions";

import { getEM } from "utils/mikro";
import { EntityData, QueryOrder } from "@mikro-orm/core";
import { Poi_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import { emitStoreDelete, emitStoreUpsert } from "../sockets";
import { upsertLogs } from "./log";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, socketId, log } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    socketId: socketId ? (socketId as string) : undefined,
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
    const pois = await getPois(queryObj.missionId);
    res.status(200).json({
      status: "success",
      message: "POIs retrieved",
      data: pois,
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
    const pois: POI[] = req.body as POI[];
    //add owner id to the evas
    const poisToUpsert = pois.map((p) => {
      if (!p.ownerId) {
        return { ...p, ownerId: req.session.user.id };
      } else {
        return p;
      }
    });
    const upsertResponse: POI[] = await upsertPois(poisToUpsert);
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
      type: "poi",
      data: upsertResponse,
    } as StoreUpsert<POI>);

    if (queryObj.logAction) {
      // log this upsert to the log table
      const log: Log = {
        uuid: uuidv4(),
        missionId: queryObj.missionId,
        type: "poiUpsert",
        payloadJson: JSON.stringify(poisToUpsert),
        createdAt: new Date().toISOString(),
      };
      upsertLogs([log]);
    }

    res.status(200).json({
      status: "success",
      message: "POI upserted",
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
    const deletedUuids = await deletePois(uuidsToDelete);

    if (deletedUuids.length > 0) {
      // emit the deleted item to all clients via socket.io
      emitStoreDelete({
        missionId: queryObj.missionId,
        socketId: queryObj.socketId,
        type: "poi",
        uuids: deletedUuids,
      } as StoreDelete);

      if (queryObj.logAction) {
        // log this deletion to the log table
        const log: Log = {
          uuid: uuidv4(),
          missionId: queryObj.missionId,
          type: "poiDelete",
          payloadJson: JSON.stringify({ uuidsToDelete }),
          createdAt: new Date().toISOString(),
        };
        upsertLogs([log]);
      }

      res.status(200).json({
        status: "success",
        message: "POI deleted",
      });
    } else {
      res.status(404).json({
        status: "failure",
        message: "No record found. Nothing deleted",
      });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the DELETE request ${e}` });
  }
});

export default router;

export async function getPois(missionId: number): Promise<POI[]> {
  const em = getEM();
  const dbPois = await em.find(
    Poi_db,
    { mission: missionId },
    { orderBy: { name: QueryOrder.ASC } }
  );

  /** transform the Mikro Poi objects into POI objects used in the Store */
  const transformedPois: POI[] = [];
  for (const poiItem of dbPois) {
    const convertedPoi: POI = {
      uuid: poiItem.uuid,
      ownerId: poiItem.owner.id,
      missionId: poiItem.mission.id,
      actionOrderUuids: poiItem.actionOrderUuids,
      name: poiItem.name,
      description: poiItem.description,
      priorityOverride: poiItem.priorityOverride,
      radius: poiItem.radius,
      location: poiItem.location,
      elevation: poiItem.elevation,
      icon: poiItem.icon,
      tags: poiItem.tags,
      status: poiItem.status,
      createdAt: poiItem.createdAt.toISOString(),
      updatedAt: poiItem.updatedAt.toISOString(),
    };
    transformedPois.push(convertedPoi);
  }

  return transformedPois;
}

/**
 * Inserts or Updates Pois into the database
 * @param pois the poi objects to upsert
 * @returns a copy of the poi objects that was upserted
 */
export async function upsertPois(pois: POI[]): Promise<POI[]> {
  const em = getEM();

  const poisToUpsert = _.cloneDeep(pois); //create a copy to manipulate
  const poisUpsertedToDb = [];

  //build poi to upsert
  for (const poiToUpsert of poisToUpsert) {
    //convert fks
    const convertedPoi: EntityData<Poi_db> = {
      uuid: poiToUpsert.uuid || uuidv4(),
      owner: poiToUpsert.ownerId,
      mission: poiToUpsert.missionId,
      actionOrderUuids: poiToUpsert.actionOrderUuids,
      name: poiToUpsert.name,
      description: poiToUpsert.description,
      priorityOverride: poiToUpsert.priorityOverride,
      radius: poiToUpsert.radius,
      location: poiToUpsert.location,
      elevation: poiToUpsert.elevation,
      icon: poiToUpsert.icon,
      tags: poiToUpsert.tags,
      status: poiToUpsert.status,
      createdAt: new Date(poiToUpsert.createdAt),
      updatedAt: new Date(poiToUpsert.updatedAt),
    };
    const poiUpsertReference: Poi_db = await em.upsert(Poi_db, convertedPoi);
    em.persist(poiUpsertReference);
    poisUpsertedToDb.push(poiUpsertReference);
  }

  await em.flush();
  //convert foreign keys
  const convertedPois = poisUpsertedToDb.map((p) => {
    return {
      uuid: p.uuid,
      missionId: p.mission.id,
      ownerId: p.owner.id,
      actionOrderUuids: p.actionOrderUuids,
      name: p.name,
      description: p.description,
      priorityOverride: p.priorityOverride,
      radius: p.radius,
      location: p.location,
      elevation: p.elevation,
      icon: p.icon,
      tags: p.tags,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  });
  return convertedPois;
}

/**
 * Deletes POIs.
 * @param poiUuids Pois uuids to delete
 * @returns the uuids of the deleted POIs
 */
export async function deletePois(poiUuids: string[]): Promise<string[]> {
  const em = getEM();
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
