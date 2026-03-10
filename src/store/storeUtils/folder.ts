import type { EntityData } from "@mikro-orm/postgresql";
import type { Folder_db } from "server/database/models/_allModels";

import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

/**
 * Generate a blank folder
 * @param partialFolder any fields that are to be overridden from default
 * @returns the generated folder
 */
export const generateBlankFolder = (partialFolder?: Partial<Folder>): Folder => {
  const defaultNewFolder: Folder = {
    uuid: uuidv4(),
    missionId: null,
    name: "",
    type: "poi", // Default type
    items: [],
    createdAt: getAccurateNow().toISOString(),
    updatedAt: getAccurateNow().toISOString(),
  };
  return { ...defaultNewFolder, ...partialFolder };
};

/**
 * Convert a folder from database format to store format
 * @param dbFolder Folder in database format
 * @returns Folder in store format
 */
export function convertFolderDbToStore(dbFolder: Folder_db): Folder {
  return {
    uuid: dbFolder.uuid,
    missionId: dbFolder.missionId,
    name: dbFolder.name,
    type: dbFolder.type,
    items: dbFolder.items,
    createdAt: dbFolder.createdAt.toISOString(),
    updatedAt: dbFolder.updatedAt.toISOString(),
  };
}

/**
 * Convert a folder from store format to database format
 * @param storeFolder Folder in store format
 * @returns Folder in database format
 */
export function convertFolderStoreToDb(storeFolder: Folder): EntityData<Folder_db> {
  return {
    uuid: storeFolder.uuid,
    missionId: storeFolder.missionId,
    name: storeFolder.name,
    type: storeFolder.type,
    items: storeFolder.items,
    createdAt: new Date(storeFolder.createdAt),
    updatedAt: new Date(storeFolder.updatedAt),
  };
}
