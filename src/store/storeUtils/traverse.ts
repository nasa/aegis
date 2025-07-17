import { getAccurateNow } from "utils/formatting";
import { v4 as uuidv4 } from "uuid";
import { Traverse_db } from "server/database/models/_allModels";
import { EntityData } from "@mikro-orm/core";

/**
 * Generate a blank traverse
 * @param partialTraverse any fields that are to be overriden from default
 * @returns the generated traverse
 */
export const generateBlankTraverse = (partialTraverse?: Partial<Traverse>): Traverse => {
  const defaultNewTraverse: Traverse = {
    uuid: uuidv4(),
    refUuid: uuidv4(),
    missionId: null,
    name: "",
    description: "",
    duration: null,
    path: [],
    pathSegmentDistances: null,
    pathSegmentElevations: null,
    status: null,
    color: null,
    actionOrderUuids: [],
    createdAt: getAccurateNow().toISOString(),
    updatedAt: null,
  };
  return { ...defaultNewTraverse, ...partialTraverse };
};

/**
 * Converts db traverse fks to their uuid/id arrays
 * @param dbTraverses an array of traverses in mikro db format
 * @returns an a converted array of traverses or a single traverse
 */
export function convertTraversesTypeDbToStore(dbTraverses: Traverse_db[]): Traverse[] {
  const traverses: Traverse[] = [];
  for (const dbTraverse of dbTraverses) {
    const convertedTraverse: Traverse = {
      uuid: dbTraverse.uuid,
      refUuid: dbTraverse.refUuid,
      missionId: dbTraverse.mission.id,
      name: dbTraverse.name,
      path: dbTraverse.path,
      pathSegmentDistances: dbTraverse.pathSegmentDistances,
      pathSegmentElevations: dbTraverse.pathSegmentElevations,
      status: dbTraverse.status,
      duration: dbTraverse.duration,
      description: dbTraverse.description,
      traverseRate: dbTraverse.traverseRate,
      color: dbTraverse.color,
      actionOrderUuids: dbTraverse.actionOrderUuids,
      createdAt: dbTraverse.createdAt.toISOString(),
      updatedAt: dbTraverse.updatedAt.toISOString(),
    };
    traverses.push(convertedTraverse);
  }
  return traverses;
}

/**
 * Converts traverses that come from the store into the db type
 * @param storeTraverses
 * @returns
 */
export function convertTraversesTypeStoreToDb(
  storeTraverses: Traverse[]
): EntityData<Traverse_db>[] {
  const dbTraverses: EntityData<Traverse_db>[] = [];
  for (const storeTraverse of storeTraverses) {
    const convertedRecord: EntityData<Traverse_db> = {
      uuid: storeTraverse.uuid,
      refUuid: storeTraverse.refUuid,
      mission: storeTraverse.missionId,
      name: storeTraverse.name,
      path: storeTraverse.path,
      pathSegmentDistances: storeTraverse.pathSegmentDistances,
      pathSegmentElevations: storeTraverse.pathSegmentElevations,
      status: storeTraverse.status,
      duration: storeTraverse.duration,
      description: storeTraverse.description,
      traverseRate: storeTraverse.traverseRate,
      color: storeTraverse.color,
      actionOrderUuids: storeTraverse.actionOrderUuids,
      updatedAt: new Date(storeTraverse.updatedAt),
      createdAt: new Date(storeTraverse.createdAt),
    };
    dbTraverses.push(convertedRecord);
  }
  return dbTraverses;
}
