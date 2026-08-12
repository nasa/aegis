import { serverLogger } from "utils/logging/serverLogger";
import { v4 as uuidv4 } from "uuid";
import { copyDirectoryContents } from "server/file/file";

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
    folders: new Map<string, string>(),
  };
};

// Copy mission assets
export const copyMissionAssets = async (
  fromMissionId: number,
  toMissionId: number
): Promise<void> => {
  try {
    serverLogger.info({
      logId: "duplicate",
      logValue: `Copying assets from mission ${fromMissionId} to mission ${toMissionId}`,
    });

    // Recursively copy directories and files
    await copyDirectoryContents(fromMissionId, toMissionId);

    serverLogger.info({
      logId: "duplicate",
      logValue: `Successfully copied mission assets from ${fromMissionId} to ${toMissionId}`,
    });
  } catch (error) {
    throw new Error(`Failed to copy mission assets: ${error}`);
  }
};
