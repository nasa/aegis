import type { EntityData, Loaded } from "@mikro-orm/postgresql";
import type { Request, Response } from "express";

import { QueryOrder, ForeignKeyConstraintViolationException } from "@mikro-orm/postgresql";
import express from "express";
import cloneDeep from "lodash/cloneDeep";

import { Station_db, Poi_db } from "server/database/models/_allModels";
import {
  convertStationsTypeDbToStore,
  convertStationsTypeStoreToDb,
} from "store/storeUtils/station";
import { getEM } from "utils/mikro";
import { hasPerms } from "utils/permissions";

import { emitStoreDelete, emitStoreUpsert } from "../sockets";
import { upsertDatabaseRetry } from "utils/database";

const router = express.Router();

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, stations } = req.body as StationUpsertRequest;
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
    // Add owner id to the stations
    const stationsToUpsert = stations.map((s) => {
      if (!s.ownerId) {
        return { ...s, ownerId: req.session?.appUser?.id || -1 };
      } else {
        return s;
      }
    });

    const upsertResponse: Station[] = await upsertDatabaseRetry(() =>
      upsertStations(stationsToUpsert)
    );

    // Check response
    if (!upsertResponse || upsertResponse.length === 0) {
      res.status(500).json({
        status: "error",
        message: "Failed to update station after multiple tries",
        data: null,
      });
      return;
    }

    // Emit the upserted item to all clients via socket.io
    emitStoreUpsert({
      missionId,
      socketId,
      type: "station",
      data: upsertResponse,
    } as StoreUpsert);

    res.status(200).json({
      status: "success",
      message: `Station upserted with ID ${upsertResponse.map((s) => s.uuid)}`,
      data: upsertResponse,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, stationUuids } = req.body as StationDeleteRequest;
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
    const deletedUuids = await deleteStations(stationUuids);

    if (deletedUuids.length > 0) {
      // emit the deleted item to all clients via socket.io
      emitStoreDelete({
        missionId,
        socketId,
        type: "station",
        uuids: deletedUuids,
      } as StoreDelete);

      res.status(200).json({
        status: "success",
        message: "Station Deleted",
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
        message: "Cannot delete station. This station is referenced elsewhere",
      });
    } else {
      res.status(500).json({ status: "error", message: "Error processing the DELETE request" });
    }
  }
});

export default router;

/**
 * get station(s) from the database
 * @param missionId required. Mission ID for the station.
 * @param stationUUID optional. UUID of the station to retrieve
 * @returns array of stations
 */
export async function getStations(missionId: number, stationUUID?: string): Promise<Station[]> {
  const em = getEM();

  //find stations by either mission Id or uuid
  let dbStations: Loaded<Station_db, "poi">[];

  if (stationUUID) {
    dbStations = await em.find(
      Station_db,
      { uuid: stationUUID },
      {
        orderBy: [{ name: QueryOrder.ASC }],
        populate: ["poi"],
      }
    );
  } else {
    dbStations = await em.find(
      Station_db,
      { mission: { id: missionId } },
      {
        orderBy: [{ name: QueryOrder.ASC }],
        populate: ["poi"],
      }
    );
  }

  //convert foreign keys
  return convertStationsTypeDbToStore(dbStations);
}

/**
 * Gets station refUuids by their uuids.
 * @param stationUuids array of station uuids to retrieve
 * @returns array of stations refUuids
 */
export async function getStationRefUuids(stationUuids: string[]): Promise<string[]> {
  const em = getEM();
  const dbStations: Loaded<Station_db>[] = await em.find(Station_db, {
    uuid: { $in: stationUuids },
  });
  return dbStations.map((s) => s.refUuid);
}

/**
 * Inserts or Updates stations into the database
 * @param stations the stations to upsert
 * @returns a copy of the stations that was upserted
 */
async function upsertStations(stations: Station[]): Promise<Station[]> {
  const em = getEM();
  await em.begin(); // Start a transaction

  const stationsToUpsert = cloneDeep(stations); // Create a copy to manipulate
  const stationsUpsertedToDb = [];

  try {
    for (const stationToUpsert of stationsToUpsert) {
      const convertedStation: EntityData<Station_db> = convertStationsTypeStoreToDb([
        stationToUpsert,
      ])[0];

      // Upsert station
      const stationRefFromDb: Station_db = await em.upsert(Station_db, convertedStation);
      await em.populate(stationRefFromDb, ["poi"]); // Need to populate pois in order to remove them

      // Remove all POIs
      stationRefFromDb.poi.removeAll();

      // Add back POIs
      if (stationToUpsert.poiUuids) {
        for (const uuid of stationToUpsert.poiUuids) {
          const poiReference = em.getReference(Poi_db, uuid);
          stationRefFromDb.poi.add(poiReference);
        }
      }

      em.persist(stationRefFromDb);
      stationsUpsertedToDb.push(stationRefFromDb);
    }

    await em.commit(); // Flush and commit the transaction
  } catch (e) {
    await em.rollback(); // Rollback the transaction
    throw e; // Re-throw the error to be handled by the caller
  }

  // Convert foreign keys
  return convertStationsTypeDbToStore(stationsUpsertedToDb);
}

/**
 * Deletes stations and the entity relationships to any POIs.
 * This operation does not touch actions. Actions should be removed by calling the Actions API directly.
 * @param stationUuids station uuids to delete
 * @returns the uuids of the deleted station
 */
async function deleteStations(stationUuids: string[]): Promise<string[]> {
  const em = getEM();
  const deletedUuids = [];
  for (const stationUuid of stationUuids) {
    const entity = await em.findOne(Station_db, { uuid: stationUuid }, { populate: ["poi"] });
    if (entity) {
      em.remove(entity);
      deletedUuids.push(stationUuid);
    }
  }
  await em.flush(); //perform deletes
  return deletedUuids;
}
