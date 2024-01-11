import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { getEM, withORM } from "utils/mikro";
import {
  EntityData,
  ForeignKeyConstraintViolationException,
  Loaded,
  QueryOrder,
} from "@mikro-orm/core";
import { Station_db, Poi_db } from "server/database/models/_allModels";
import _ from "lodash";
import { v4 as uuidv4 } from "uuid";
import { hasPerms } from "utils/permissions";
import { emitStoreDelete, emitStoreUpsert } from "./socketio";
import { upsertLogs } from "./log";

const handleStation: NextApiHandler<WrappedResponse<Station[] | Station>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    //check logged in
    if (!req.session?.user) {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }

    const { uuid, socketId, missionId, log } = req.query;
    const intMissionId = parseInt(missionId as string);
    const stationUuid = uuid as string;
    const logAction = log === "true";

    //check for required mission id is valid
    if (!intMissionId || _.isNaN(intMissionId)) {
      return res.status(500).json({ status: "error", message: "Invalid mission ID" });
    }
    const editPermission = await hasPerms(intMissionId, "edit", req.session?.user);

    if (req.method === "GET") {
      const viewPermission = await hasPerms(intMissionId, "view", req.session.user);
      if (!viewPermission && !editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }

      try {
        const stations: Station[] = await getStations(intMissionId, stationUuid);

        return res.status(200).json({
          status: "success",
          message: "stations retrieved",
          data: stations,
        });
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ status: "error", message: "Error processing the GET request" });
      }
    }

    // upsert a station
    if (req.method === "POST") {
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
      try {
        const stations: Station[] = req.body as Station[];
        //add owner id to the evas
        const stationsToUpsert = stations.map((s) => {
          if (!s.ownerId) {
            return { ...s, ownerId: req.session.user.id };
          } else {
            return s;
          }
        });
        const upsertResponse: Station[] = await upsertStations(stationsToUpsert);

        //check response
        if (upsertResponse.length === 0) {
          return res.status(500).json({
            status: "error",
            message: "Upsert response did not return a value",
            data: null,
          });
        } else {
          // emit the upserted item to all clients via socket.io
          emitStoreUpsert({
            missionId: intMissionId,
            socketId,
            type: "station",
            data: upsertResponse,
          } as StoreUpsert<Station>);

          if (logAction) {
            // log this upsert to the log table
            const log: Log = {
              uuid: uuidv4(),
              missionId: intMissionId,
              type: "stationUpsert",
              payloadJson: JSON.stringify(stationsToUpsert),
              createdAt: new Date().toISOString(),
            };
            upsertLogs([log]);
          }

          return res.status(200).json({
            status: "success",
            message: `Station upserted with ID ${upsertResponse.map((s) => s.uuid)}`,
            data: upsertResponse,
          });
        }
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ status: "error", message: "Error processing the POST request" });
      }
    }

    // delete a record
    if (req.method === "DELETE") {
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
      try {
        const uuidsToDelete: string[] = req.body;
        const deletedUuids = await deleteStations(uuidsToDelete);

        if (deletedUuids.length > 0) {
          // emit the deleted item to all clients via socket.io
          emitStoreDelete({
            missionId: intMissionId,
            socketId,
            type: "station",
            uuids: deletedUuids,
          } as StoreDelete);

          if (logAction) {
            // log this deletion to the log table
            const log: Log = {
              uuid: uuidv4(),
              missionId: intMissionId,
              type: "stationDelete",
              payloadJson: JSON.stringify({ deletedUuids }),
              createdAt: new Date().toISOString(),
            };
            upsertLogs([log]);
          }

          return res.status(200).json({
            status: "success",
            message: "Station Deleted",
          });
        } else {
          return res.status(404).json({
            status: "failure",
            message: "Record not found. Nothing deleted",
          });
        }
      } catch (e) {
        console.error(e);
        if (e instanceof ForeignKeyConstraintViolationException) {
          return res.status(500).json({
            status: "error",
            message: "Cannot delete station. This station is referenced elsewhere",
          });
        } else {
          return res
            .status(500)
            .json({ status: "error", message: "Error processing the DELETE request" });
        }
      }
    }
  } catch (e) {
    return res.status(500).json({ status: "error", message: "Error in query: " + e });
  }
};

/**
 * get station(s) from the database
 * @param missionId required. Mission ID for the station.
 * @param stationUUID optional. UUID of the station to retrieve
 * @returns array of stations
 */
export async function getStations(missionId: number, stationUUID?: string): Promise<Station[]> {
  const em = getEM();

  //find stations by either mission Id or uuid
  let dbstations: Loaded<Station_db, "poi">[];

  if (stationUUID) {
    dbstations = await em.find(
      Station_db,
      { uuid: stationUUID },
      {
        orderBy: [{ name: QueryOrder.ASC }],
        populate: ["poi"],
      }
    );
  } else {
    dbstations = await em.find(
      Station_db,
      { mission: { id: missionId } },
      {
        orderBy: [{ name: QueryOrder.ASC }],
        populate: ["poi"],
      }
    );
  }

  //convert foreign keys
  return convertStations(dbstations);
}

/**
 * Inserts or Updates stations into the database
 * @param stations the stations to upsert
 * @returns a copy of the stations that was upserted
 */
async function upsertStations(stations: Station[]): Promise<Station[]> {
  const em = getEM();

  const stationsToUpsert = _.cloneDeep(stations); //create a copy to manipulate
  const stationsUpsertedToDb = [];

  for (const stationToUpsert of stationsToUpsert) {
    const convertedStation: EntityData<Station_db> = {
      uuid: stationToUpsert.uuid || uuidv4(),
      owner: stationToUpsert.ownerId,
      mission: stationToUpsert.missionId,
      actionOrderUuids: stationToUpsert.actionOrderUuids,
      name: stationToUpsert.name,
      status: stationToUpsert.status,
      description: stationToUpsert.description,
      radius: stationToUpsert.radius,
      location: stationToUpsert.location,
      elevation: stationToUpsert.elevation,
      walkbackPath: stationToUpsert.walkbackPath,
      walkbackPathSegmentDistances: stationToUpsert.walkbackPathSegmentDistances,
      walkbackPathSegmentElevations: stationToUpsert.walkbackPathSegmentElevations,
      durationLower: stationToUpsert.durationLower,
      durationUpper: stationToUpsert.durationUpper,
      icon: stationToUpsert.icon,
      updatedAt: new Date(stationToUpsert.updatedAt),
      createdAt: new Date(stationToUpsert.createdAt),
    };

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
  return convertStations(stationsUpsertedToDb);
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
    await em.flush(); //perform deletes
    return deletedUuids;
  }
}

/**
 * Converts db station fks to their plain uuid/id arrays
 * @param dbstations an array of stations in mikro db format
 * @returns an array of stations
 */
function convertStations(dbstations: Station_db[]): Station[] {
  const stations: Station[] = [];
  for (const dbstation of dbstations) {
    //convert station object
    const convertedStation: Station = {
      uuid: dbstation.uuid,
      ownerId: dbstation.owner.id,
      missionId: dbstation.mission.id,
      actionOrderUuids: dbstation.actionOrderUuids,
      name: dbstation.name,
      status: dbstation.status,
      description: dbstation.description,
      radius: dbstation.radius,
      location: dbstation.location,
      elevation: dbstation.elevation,
      walkbackPath: dbstation.walkbackPath,
      walkbackPathSegmentDistances: dbstation.walkbackPathSegmentDistances,
      walkbackPathSegmentElevations: dbstation.walkbackPathSegmentElevations,
      durationLower: dbstation.durationLower,
      durationUpper: dbstation.durationUpper,
      icon: dbstation.icon,
      createdAt: dbstation.createdAt.toISOString(),
      updatedAt: dbstation.updatedAt.toISOString(),
    };
    //convert collection of poi's to just an array of poi uuids
    convertedStation.poiUuids = [];
    if (dbstation.poi.length > 0) {
      for (const poi of dbstation.poi) {
        convertedStation.poiUuids.push(poi.uuid);
      }
    }

    stations.push(convertedStation);
  }
  return stations;
}

export default withIronSessionApiRoute(withORM(handleStation), ironOptions);
