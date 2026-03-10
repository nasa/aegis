import type { EntityData } from "@mikro-orm/postgresql";
import type { Poi_db } from "server/database/models/_allModels";

import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

/**
 * Generate a blank poi
 * @param partialPoi any fields that are to be overridden from default
 * @returns the generated poi
 */
export const generateBlankPoi = (partialPoi?: Partial<POI>): POI => {
  const defaultNewPoi: POI = {
    uuid: uuidv4(),
    ownerId: null,
    missionId: null,
    name: "",
    description: "",
    actionOrderUuids: [],
    priorityOverride: 0,
    radius: 5,
    location: null,
    elevation: null,
    icon: "1F534",
    tags: [],
    status: "Candidate",
    createdAt: getAccurateNow().toISOString(),
    updatedAt: null,
  };
  return { ...defaultNewPoi, ...partialPoi };
};

/**
 * Converts db poi fks to their uuid/id arrays
 * @param dbPois an array of pois in mikro db format
 * @returns an a converted array of pois or a single poi
 */
export function convertPoisTypeDbToStore(dbPois: Poi_db[]): POI[] {
  const pois: POI[] = [];
  for (const dbPoi of dbPois) {
    const convertedPoi: POI = {
      uuid: dbPoi.uuid,
      missionId: dbPoi.missionId,
      ownerId: dbPoi.ownerId,
      actionOrderUuids: dbPoi.actionOrderUuids,
      name: dbPoi.name,
      description: dbPoi.description,
      priorityOverride: dbPoi.priorityOverride,
      radius: dbPoi.radius,
      location: dbPoi.location,
      elevation: dbPoi.elevation,
      icon: dbPoi.icon,
      tags: dbPoi.tags,
      status: dbPoi.status,
      createdAt: dbPoi.createdAt.toISOString(),
      updatedAt: dbPoi.updatedAt.toISOString(),
    };
    pois.push(convertedPoi);
  }
  return pois;
}

/**
 * Converts pois that come from the store into the db type
 * @param storePois
 * @returns
 */
export function convertPoisTypeStoreToDb(storePois: POI[]): EntityData<Poi_db>[] {
  const dbPois: EntityData<Poi_db>[] = [];
  for (const storePoi of storePois) {
    const convertedRecord: EntityData<Poi_db> = {
      uuid: storePoi.uuid,
      ownerId: storePoi.ownerId,
      missionId: storePoi.missionId,
      actionOrderUuids: storePoi.actionOrderUuids,
      name: storePoi.name,
      description: storePoi.description,
      priorityOverride: storePoi.priorityOverride,
      radius: storePoi.radius,
      location: storePoi.location,
      elevation: storePoi.elevation,
      icon: storePoi.icon,
      tags: storePoi.tags,
      status: storePoi.status,
      createdAt: new Date(storePoi.createdAt),
      updatedAt: new Date(storePoi.updatedAt),
    };
    dbPois.push(convertedRecord);
  }
  return dbPois;
}
