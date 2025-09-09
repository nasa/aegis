import { getAccurateNow } from "utils/formatting";
import { v4 as uuidv4 } from "uuid";
import { Eva_db } from "server/database/models/_allModels";
import { EntityData } from "@mikro-orm/core";

/**
 * Generate a blank eva
 * @param partialEVA any fields that are to be overridden from default
 * @returns the generated eva
 */
export const generateBlankEVA = (partialEVA?: Partial<Eva>): Eva => {
  const defaultNewEVA: Eva = {
    uuid: uuidv4(),
    refUuid: uuidv4(),
    ownerId: null,
    missionId: null,
    name: "",
    status: "Candidate",
    sequence: [],
    description: "",
    traverseRate: null,
    duration: null,
    egressDuration: 10,
    ingressDuration: 10,
    egressLocationUuid: "lander",
    ingressLocationUuid: "lander",
    traverseColor: null,
    datetime: "",
    showEditWarning: false,
    editWarningMsg: "",
    createdAt: getAccurateNow().toISOString(),
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
  for (const dbEva of dbEVAs) {
    const convertedEVA: Eva = {
      uuid: dbEva.uuid,
      refUuid: dbEva.refUuid,
      missionId: dbEva.mission.id,
      name: dbEva.name,
      status: dbEva.status,
      sequence: dbEva.sequence,
      description: dbEva.description,
      duration: dbEva.duration,
      traverseRate: dbEva.traverseRate,
      egressDuration: dbEva.egressDuration,
      ingressDuration: dbEva.ingressDuration,
      egressLocationUuid: dbEva.egressLocationUuid,
      ingressLocationUuid: dbEva.ingressLocationUuid,
      ownerId: dbEva.ownerId,
      traverseColor: dbEva.traverseColor,
      datetime: dbEva.datetime,
      showEditWarning: dbEva.showEditWarning,
      editWarningMsg: dbEva.editWarningMsg,
      createdAt: dbEva.createdAt.toISOString(),
      updatedAt: dbEva.updatedAt.toISOString(),
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
      refUuid: storeEva.refUuid,
      mission: storeEva.missionId,
      name: storeEva.name,
      status: storeEva.status,
      sequence: storeEva.sequence,
      description: storeEva.description,
      duration: storeEva.duration,
      traverseRate: storeEva.traverseRate,
      egressDuration: storeEva.egressDuration,
      ingressDuration: storeEva.ingressDuration,
      egressLocationUuid: storeEva.egressLocationUuid,
      ingressLocationUuid: storeEva.ingressLocationUuid,
      traverseColor: storeEva.traverseColor,
      ownerId: storeEva.ownerId,
      datetime: storeEva.datetime,
      showEditWarning: storeEva.showEditWarning,
      editWarningMsg: storeEva.editWarningMsg,
      updatedAt: new Date(storeEva.updatedAt),
      createdAt: new Date(storeEva.createdAt),
    };
    dbEVAs.push(convertedRecord);
  }
  return dbEVAs;
}
