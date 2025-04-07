import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { v4 as uuidv4 } from "uuid";
import { Eva_db } from "server/database/models/_allModels";
import { EntityData } from "@mikro-orm/core";

/**
 * Generate a blank eva
 * @param partialEVA any fields that are to be overriden from default
 * @returns the generated eva
 */
export const generateBlankEVA = (partialEVA?: Partial<Eva>): Eva => {
  const defaultNewEVA: Eva = {
    uuid: uuidv4(),
    ownerId: null,
    missionId: null,
    name: "",
    status: "Candidate",
    sequence: [],
    description: "",
    traverseRate: null,
    maxDuration: null,
    egressDuration: 10,
    ingressDuration: 10,
    egressLocationUuid: "lander",
    ingressLocationUuid: "lander",
    traverseColor: null,
    datetime: "",
    createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    updatedAt: null,
  };
  return { ...defaultNewEVA, ...partialEVA };
};

/**
 * Converts db eva fks to their uuid/id arrays
 * @param dbEVAs an array of evas in mikro db format
 * @returns an a converted array of evas or a single eva
 */
export function convertEVAsTypeDbToStore(dbEVAs: Eva_db[]): Eva[] {
  const evas: Eva[] = [];
  for (const dbeva of dbEVAs) {
    const convertedEVA: Eva = {
      uuid: dbeva.uuid,
      missionId: dbeva.mission.id,
      name: dbeva.name,
      status: dbeva.status,
      sequence: dbeva.sequence,
      description: dbeva.description,
      maxDuration: dbeva.maxDuration,
      traverseRate: dbeva.traverseRate,
      egressDuration: dbeva.egressDuration,
      ingressDuration: dbeva.ingressDuration,
      egressLocationUuid: dbeva.egressLocationUuid,
      ingressLocationUuid: dbeva.ingressLocationUuid,
      ownerId: dbeva.ownerId,
      traverseColor: dbeva.traverseColor,
      datetime: dbeva.datetime,
      createdAt: dbeva.createdAt.toISOString(),
      updatedAt: dbeva.updatedAt.toISOString(),
    };
    evas.push(convertedEVA);
  }
  return evas;
}

/**
 * Converts evas that come from the store into the db type
 * @param storeEVAs
 * @returns
 */
export function convertEVAsTypeStoreToDb(storeEVAs: Eva[]): EntityData<Eva_db>[] {
  const dbEVAs: EntityData<Eva_db>[] = [];
  for (const storeEva of storeEVAs) {
    const convertedRecord: EntityData<Eva_db> = {
      uuid: storeEva.uuid,
      mission: storeEva.missionId,
      name: storeEva.name,
      status: storeEva.status,
      sequence: storeEva.sequence,
      description: storeEva.description,
      maxDuration: storeEva.maxDuration,
      traverseRate: storeEva.traverseRate,
      egressDuration: storeEva.egressDuration,
      ingressDuration: storeEva.ingressDuration,
      egressLocationUuid: storeEva.egressLocationUuid,
      ingressLocationUuid: storeEva.ingressLocationUuid,
      traverseColor: storeEva.traverseColor,
      ownerId: storeEva.ownerId,
      datetime: storeEva.datetime,
      updatedAt: new Date(storeEva.updatedAt),
      createdAt: new Date(storeEva.createdAt),
    };
    dbEVAs.push(convertedRecord);
  }
  return dbEVAs;
}
