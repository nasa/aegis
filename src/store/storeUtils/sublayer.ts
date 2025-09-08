import type { EntityData } from "@mikro-orm/postgresql";
import type { Sublayer_db } from "server/database/models/_allModels";

import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

export const defaultSublayerStyle: MapSublayerStyle = {
  opacity: 1,
  contrast: 1,
  brightness: 1,
  saturation: 1,
  blendMode: "normal",
  color: "#FFFFFF",
  weight: 1,
  fillColor: "none",
  fillOpacity: 0,
  isDashed: false,
  dashLen: 10,
  altColor: "#FFFFFF",
  altOpacity: 100,
};
/**
 * Generate a blank sublayer
 * @param partialSublayer any fields that are to be overridden from default
 * @returns the generated layer
 */
export const generateBlankSublayer = (partialSublayer?: Partial<Sublayer>): Sublayer => {
  const defaultNewSublayer: Sublayer = {
    uuid: uuidv4(),
    missionId: null,
    layerUuid: null,
    name: "",
    description: "",
    legend: null,
    path: "",
    tilePattern: "",
    type: "tile",
    boundingBox: null,
    tileFormat: "tms",
    minNativeZoom: 0,
    maxNativeZoom: 0,
    maxZoom: 30,
    style: defaultSublayerStyle,
    isTimeBased: false,
    timeLayerManifest: null,
    createdAt: getAccurateNow().toISOString(),
    updatedAt: getAccurateNow().toISOString(),
  };
  return { ...defaultNewSublayer, ...partialSublayer };
};

/**
 * Converts db layer fks to their uuid/id arrays
 * @param dbSublayers an array of sublayer in mikro db format
 * @returns an a converted array of sublayer or a single layer
 */
export function convertSublayersTypeDbToStore(dbSublayers: Sublayer_db[]): Sublayer[] {
  const sublayer: Sublayer[] = [];
  for (const dbSublayer of dbSublayers) {
    const convertedSublayer: Sublayer = {
      uuid: dbSublayer.uuid,
      missionId: dbSublayer.mission.id,
      layerUuid: dbSublayer.layer.uuid,
      name: dbSublayer.name,
      description: dbSublayer.description,
      legend: dbSublayer.legend,
      path: dbSublayer.path,
      tilePattern: dbSublayer.tilePattern,
      type: dbSublayer.type,
      boundingBox: dbSublayer.boundingBox,
      tileFormat: dbSublayer.tileFormat,
      minNativeZoom: dbSublayer.minNativeZoom,
      maxNativeZoom: dbSublayer.maxNativeZoom,
      maxZoom: dbSublayer.maxZoom,
      style: dbSublayer.style,
      isTimeBased: dbSublayer.isTimeBased,
      timeLayerManifest: dbSublayer.timeLayerManifest,
      createdAt: dbSublayer.createdAt.toISOString(),
      updatedAt: dbSublayer.updatedAt.toISOString(),
    };
    sublayer.push(convertedSublayer);
  }
  return sublayer;
}

/**
 * Converts sublayer that come from the store into the db type
 * @param storeSublayers
 * @returns
 */
export function convertSublayersTypeStoreToDb(
  storeSublayers: Sublayer[]
): EntityData<Sublayer_db>[] {
  const dbSublayers: EntityData<Sublayer_db>[] = [];
  for (const storeSublayer of storeSublayers) {
    const convertedRecord: EntityData<Sublayer_db> = {
      uuid: storeSublayer.uuid,
      mission: storeSublayer.missionId,
      layer: storeSublayer.layerUuid,
      name: storeSublayer.name,
      description: storeSublayer.description,
      legend: storeSublayer.legend,
      type: storeSublayer.type,
      path: storeSublayer.path,
      tilePattern: storeSublayer.tilePattern,
      boundingBox: storeSublayer.boundingBox,
      tileFormat: storeSublayer.tileFormat,
      minNativeZoom: storeSublayer.minNativeZoom,
      maxNativeZoom: storeSublayer.maxNativeZoom,
      maxZoom: storeSublayer.maxZoom,
      style: storeSublayer.style,
      isTimeBased: storeSublayer.isTimeBased,
      timeLayerManifest: storeSublayer.timeLayerManifest,
      createdAt: new Date(storeSublayer.createdAt),
      updatedAt: new Date(storeSublayer.updatedAt),
    };
    dbSublayers.push(convertedRecord);
  }
  return dbSublayers;
}
