import { v4 as uuidv4 } from "uuid";
import { copyDirectoryContents } from "server/file/file";
import { roundDateToSecond } from "../formatting"; // Assuming this exists in src/utils

// Creates a new UUID and stores mapping from old to new
export const createUuidMapping = (oldUuid: string, uuidMap: UuidMap): string => {
  const newUuid = uuidv4();
  uuidMap.set(oldUuid, newUuid);
  return newUuid;
};

// Initialize UUID maps
export const initializeUuidMaps = (): EntityMaps => {
  return {
    stations: new Map<string, string>(),
    pois: new Map<string, string>(),
    actions: new Map<string, string>(),
    evas: new Map<string, string>(),
    layers: new Map<string, string>(),
    sublayers: new Map<string, string>(),
    traverses: new Map<string, string>(),
    presets: new Map<string, string>(),
    rexes: new Map<string, string>(),
    stmLevel1s: new Map<string, string>(),
    stmLevel2s: new Map<string, string>(),
    stmLevel3s: new Map<string, string>(),
    stmRules: new Map<string, string>(),
    grids: new Map<string, string>(),
    folders: new Map<string, string>(),
  };
};

// Copy mission assets
export const copyMissionAssets = async (
  fromMissionId: number,
  toMissionId: number
): Promise<void> => {
  try {
    console.log(`Copying assets from mission ${fromMissionId} to mission ${toMissionId}`);

    // Recursively copy directories and files
    await copyDirectoryContents(fromMissionId, toMissionId);

    console.log(`Successfully copied mission assets from ${fromMissionId} to ${toMissionId}`);
  } catch (error) {
    throw new Error(`Failed to copy mission assets: ${error}`);
  }
};

// Re-export roundDateToSecond if it's needed by other dup files, or import directly where needed
export { roundDateToSecond };
