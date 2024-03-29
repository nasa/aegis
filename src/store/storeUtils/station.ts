import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { v4 as uuidv4 } from "uuid";
import { Station_db } from "server/database/models/_allModels";
import { EntityData } from "@mikro-orm/core";

/**
 * Generate a blank station
 * @param partialStation any fields that are to be overriden from default
 * @returns the generated station
 */
export const generateBlankStation = (partialStation?: Partial<Station>): Station => {
  const defaultNewStation: Station = {
    uuid: uuidv4(),
    ownerId: null,
    missionId: null,
    poiUuids: [],
    actionOrderUuids: [],
    name: "",
    status: "Candidate",
    description: "",
    icon: null,
    radius: 5,
    location: null,
    elevation: null,
    durationLower: 10,
    durationUpper: 15,
    walkbackPath: null,
    walkbackPathSegmentDistances: null,
    walkbackPathSegmentElevations: null,
    createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    updatedAt: null,
  };
  return { ...defaultNewStation, ...partialStation };
};

/**
 * Converts db station fks to their uuid/id arrays
 * @param dbStations an array of stations in mikro db format
 * @returns an a converted array of stations or a single station
 */
export function convertStationsTypeDbToStore(dbStations: Station_db[]): Station[] {
  const stations: Station[] = [];
  for (const dbStation of dbStations) {
    const convertedStation: Station = {
      uuid: dbStation.uuid,
      ownerId: dbStation.owner.id,
      missionId: dbStation.mission.id,
      actionOrderUuids: dbStation.actionOrderUuids,
      name: dbStation.name,
      status: dbStation.status,
      description: dbStation.description,
      radius: dbStation.radius,
      location: dbStation.location,
      elevation: dbStation.elevation,
      walkbackPath: dbStation.walkbackPath,
      walkbackPathSegmentDistances: dbStation.walkbackPathSegmentDistances,
      walkbackPathSegmentElevations: dbStation.walkbackPathSegmentElevations,
      durationLower: dbStation.durationLower,
      durationUpper: dbStation.durationUpper,
      icon: dbStation.icon,
      createdAt: dbStation.createdAt.toISOString(),
      updatedAt: dbStation.updatedAt.toISOString(),
    };
    //convert collection of poi's to just an array of poi uuids
    convertedStation.poiUuids = [];
    if (dbStation.poi.length > 0) {
      for (const poi of dbStation.poi) {
        convertedStation.poiUuids.push(poi.uuid);
      }
    }
    stations.push(convertedStation);
  }
  return stations;
}

/**
 * Converts stations that come from the store into the db type
 * @param storeStations
 * @returns
 */
export function convertStationsTypeStoreToDb(storeStations: Station[]): EntityData<Station_db>[] {
  const dbStations: EntityData<Station_db>[] = [];
  for (const storeStation of storeStations) {
    //poi references are not converted here, they are converted in the upsert function
    const convertedRecord: EntityData<Station_db> = {
      uuid: storeStation.uuid,
      owner: storeStation.ownerId,
      mission: storeStation.missionId,
      actionOrderUuids: storeStation.actionOrderUuids,
      name: storeStation.name,
      status: storeStation.status,
      description: storeStation.description,
      radius: storeStation.radius,
      location: storeStation.location,
      elevation: storeStation.elevation,
      walkbackPath: storeStation.walkbackPath,
      walkbackPathSegmentDistances: storeStation.walkbackPathSegmentDistances,
      walkbackPathSegmentElevations: storeStation.walkbackPathSegmentElevations,
      durationLower: storeStation.durationLower,
      durationUpper: storeStation.durationUpper,
      icon: storeStation.icon,
      updatedAt: new Date(storeStation.updatedAt),
      createdAt: new Date(storeStation.createdAt),
    };
    dbStations.push(convertedRecord);
  }
  return dbStations;
}
