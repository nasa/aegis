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
import { Station_db, Poi_db } from "server/database/models/_allModels";
import { emitStoreDelete, emitStoreUpsert } from "../sockets";
import {
  convertStationsTypeDbToStore,
  convertStationsTypeStoreToDb,
} from "store/storeUtils/station";

const router = express.Router();

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, stations } = req.body as StationUpsertRequest;
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
    //add owner id to the evas
    const stationsToUpsert = stations.map((s) => {
      if (!s.ownerId) {
        return { ...s, ownerId: req.session?.appUser?.id || -1 };
      } else {
        return s;
      }
    });
    const upsertResponse: Station[] = await upsertStations(stationsToUpsert);

    //check response
    if (upsertResponse.length === 0) {
      res.status(500).json({
        status: "error",
        message: "Upsert response did not return a value",
        data: null,
      });
    }

    // emit the upserted item to all clients via socket.io
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
export async function upsertStations(stations: Station[]): Promise<Station[]> {
  const em = getEM();

  const stationsToUpsert = cloneDeep(stations); //create a copy to manipulate
  const stationsUpsertedToDb = [];

  for (const stationToUpsert of stationsToUpsert) {
    const convertedStation: EntityData<Station_db> = convertStationsTypeStoreToDb([
      stationToUpsert,
    ])[0];

    //upsert station
    const stationRefFromDb: Station_db = await em.upsert(Station_db, convertedStation);
    await em.populate(stationRefFromDb, ["poi"]); //need to populate pois in order to remove them

    //remove all pois
    stationRefFromDb.poi.removeAll();
    //add back pois
    if (stationToUpsert.poiUuids) {
      for (const uuid of stationToUpsert.poiUuids) {
        const poiReference = em.getReference(Poi_db, uuid);
        stationRefFromDb.poi.add(poiReference);
      }
    }

    em.persist(stationRefFromDb);
    stationsUpsertedToDb.push(stationRefFromDb);
  }

  await em.flush();
  //convert foreign keys
  return convertStationsTypeDbToStore(stationsUpsertedToDb);
}

/**
 * Deletes stations and the entity relationships to any POIs.
 * This operation does not touch actions. Actions should be removed by calling the Actions API directly.
 * @param stationUuids station uuids to delete
 * @returns the uuids of the deleted station
 */
export async function deleteStations(stationUuids: string[]): Promise<string[]> {
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
