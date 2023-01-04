import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import { ForeignKeyConstraintViolationException, Loaded, QueryOrder } from "@mikro-orm/core";
import { Station as Station_db } from "server/database/models/station.model";
import { Poi as Poi_db } from "server/database/models/poi.model";
import _ from "lodash";
import { roundDateToSecond } from "utils/formatting";

export const handleStation: NextApiHandler<WrappedResponse<Station[] | Station>> = async (
  req,
  res
): Promise<unknown> => {
  if (req.session?.user) {
    const { missionId, uuid } = req.query;
    const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);
    const stationUUID = Array.isArray(uuid) ? uuid[0] : uuid;

    if (req.method === "GET") {
      //check for required mission id is valid
      if (!intMissionId || _.isNaN(intMissionId)) {
        return res.status(500).json({ status: "error", message: "Invalid mission ID" });
      }
      try {
        const stations: Station[] = await getStations(intMissionId, stationUUID);

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
      try {
        const stationToUpsert: Station = req.body as Station;
        const upsertResponse: Station = await upsertStation(stationToUpsert);

        //check response
        if (!upsertResponse) {
          return res.status(500).json({
            status: "error",
            message: "Upsert response did not return a value",
            data: null,
          });
        } else {
          return res.status(200).json({
            status: "success",
            message: `Station upserted with ID ${upsertResponse.uuid}`,
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
      try {
        const deletedUUID = await deleteStation(stationUUID);
        if (deletedUUID) {
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
  } else {
    return res.status(401).json({ status: "failure", message: "Unauthorized" });
  }
};

/**
 * get station(s) from the database
 * @param missionId required. Mission ID for the station.
 * @param stationUUID optional. UUID of the station to retrieve
 * @returns array of stations
 */
export async function getStations(missionId: number, stationUUID?: string): Promise<Station[]> {
  await Mikro.getORM();
  const em = Mikro.getEM();

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
  const stations = convertStations(dbstations);
  return stations;
}

/**
 * Inserts or Updates a station into the database
 * @param station the station object to upsert
 * @returns a copy of the station object that was upserted
 */
export async function upsertStation(station: Station): Promise<Station> {
  await Mikro.getORM();
  const em = Mikro.getEM();

  const stationToUpsert = _.cloneDeep(station); //create a copy to manipulate

  const updateDate = roundDateToSecond(new Date()); //db does not store miliseconds
  stationToUpsert.updatedAt = updateDate;
  stationToUpsert.createdAt = stationToUpsert.createdAt || updateDate;

  //convert fks
  const stationDbRecord: any = {
    ...stationToUpsert,
    mission: stationToUpsert.missionId,
    owner: stationToUpsert.ownerId,
  };
  delete stationDbRecord.missionId;
  delete stationDbRecord.ownerId;
  delete stationDbRecord.poiUuid;

  //upsert station
  const stationRefFromDb: Station_db = await em.upsert(Station_db, stationDbRecord);
  await em.populate(stationRefFromDb, ["poi"]); //? test todo if i need this

  //remove all pois
  stationRefFromDb.poi.removeAll();
  //add back pois
  if (stationToUpsert.poiUuid) {
    for (const uuid of stationToUpsert.poiUuid) {
      const poiReference = em.getReference(Poi_db, uuid);
      stationRefFromDb.poi.add(poiReference);
    }
  }

  await em.persistAndFlush(stationRefFromDb);
  await Mikro.closeORM();

  //convert foreign keys
  const convertedStation: Station = convertStations([stationRefFromDb])[0];
  return convertedStation;
}

/**
 * Deletes a single station and the entity relationships to any POIs.
 * This operation does not touch actions. Actions should be removed by calling the Actions API directly.
 * @param stationUuid station uuid to delete
 * @returns the uuid of the deleted station, or null if nothing was deleted
 */
export async function deleteStation(stationUuid: string): Promise<string | null> {
  await Mikro.getORM();
  const em = Mikro.getEM();
  let returnVal = stationUuid;
  const entity = await em.findOne(Station_db, { uuid: stationUuid }, { populate: ["poi"] });

  if (entity) {
    entity.poi.removeAll(); //delete relationship to poi (does not delete the poi record)
    em.remove(entity); //delete station
    await em.flush(); //perform deletes
  } else {
    returnVal = null;
  }
  await Mikro.closeORM();
  return returnVal;
}

/**
 * Converts db station fks to their uuid/id arrays
 * @param dbstations an array of stations in mikro db format
 * @returns an array of stations
 */
function convertStations(dbstations: Station_db[]): Station[] {
  const stations: Station[] = [];
  for (const dbstation of dbstations) {
    //convert mission and owner ids
    const tempStation: any = {
      ...dbstation,
      ownerId: dbstation.owner.id,
      missionId: dbstation.mission.id,
    };
    //convert collection of poi's to just an array of poi uuids
    tempStation.poiUuid = [];
    if (dbstation.poi.length > 0) {
      for (const poi of dbstation.poi) {
        tempStation.poiUuid.push(poi.uuid);
      }
    }
    //clean up fk entities
    delete tempStation.owner;
    delete tempStation.mission;
    delete tempStation.action;
    delete tempStation.poi;

    const convertedStation: Station = tempStation;
    stations.push(convertedStation);
  }
  return stations;
}

export default withIronSessionApiRoute(Mikro.withORM(handleStation), ironOptions);
