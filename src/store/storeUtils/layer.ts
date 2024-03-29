import { roundDateToSecond } from "utils/formatting";
import { v4 as uuidv4 } from "uuid";
import { Layer_db } from "server/database/models/_allModels";
import { EntityData } from "@mikro-orm/core";

/**
 * Generate a blank layer
 * @param partialLayer any fields that are to be overriden from default
 * @returns the generated layer
 */
export const generateBlankLayer = (partialLayer?: Partial<Layer>): Layer => {
  const defaultNewLayer: Layer = {
    uuid: uuidv4(),
    missionId: null,
    name: "",
    createdAt: roundDateToSecond(new Date()).toISOString(),
    updatedAt: roundDateToSecond(new Date()).toISOString(),
  };
  return { ...defaultNewLayer, ...partialLayer };
};

/**
 * Converts db layer fks to their uuid/id arrays
 * @param dbLayers an array of layers in mikro db format
 * @returns an a converted array of layers or a single layer
 */
export function convertLayersTypeDbToStore(dbLayers: Layer_db[]): Layer[] {
  const layers: Layer[] = [];
  for (const dbLayer of dbLayers) {
    const convertedLayer: Layer = {
      uuid: dbLayer.uuid,
      missionId: dbLayer.mission.id,
      name: dbLayer.name,
      createdAt: dbLayer.createdAt.toISOString(),
      updatedAt: dbLayer.updatedAt.toISOString(),
    };
    layers.push(convertedLayer);
  }
  return layers;
}

/**
 * Converts layers that come from the store into the db type
 * @param storeLayers
 * @returns
 */
export function convertLayersTypeStoreToDb(storeLayers: Layer[]): EntityData<Layer_db>[] {
  const dbLayers: EntityData<Layer_db>[] = [];
  for (const storeLayer of storeLayers) {
    const convertedRecord: EntityData<Layer_db> = {
      uuid: storeLayer.uuid,
      mission: storeLayer.missionId,
      name: storeLayer.name,
      createdAt: new Date(storeLayer.createdAt),
      updatedAt: new Date(storeLayer.updatedAt),
    };
    dbLayers.push(convertedRecord);
  }
  return dbLayers;
}
