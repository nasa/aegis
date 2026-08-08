import type { EntityData } from "@mikro-orm/postgresql";
import type { Preset_db } from "server/database/models/_allModels";

import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

/**
 * Generate a blank preset
 * @param partialPreset any fields that are to be overridden from default
 * @returns the generated preset
 */
export const generateBlankPreset = (partialPreset?: Partial<Preset>): Preset => {
  const defaultNewPreset: Preset = {
    uuid: uuidv4(),
    name: "",
    missionId: null,
    ownerId: null,
    description: "",
    missionDefault: false,
    layerOrder: [],
    mapSublayerControls: null,
    mapCircleControls: {},
    mapGridControl: null,
    sunAzimuth: 0,
    sunEnabled: false,
    earthAzimuth: 0,
    earthEnabled: false,
    earthAsMoon: false,
    createdAt: getAccurateNow().toISOString(),
    updatedAt: getAccurateNow().toISOString(),
  };
  return { ...defaultNewPreset, ...partialPreset };
};

/**
 * Backward-compat: the label halo style fields were renamed
 * labelStroke*  →  labelHalo*. Map any legacy keys on a style object in place so
 * presets saved before the rename keep their halo settings.
 */
export function migrateLegacyHaloStyle(style: MapSublayerStyle | null | undefined): void {
  if (!style) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = style as any;
  if ("labelStrokeColor" in s) {
    if (s.labelHaloColor === undefined) s.labelHaloColor = s.labelStrokeColor;
    delete s.labelStrokeColor;
  }
  if ("labelStrokeWidth" in s) {
    if (s.labelHaloWidth === undefined) s.labelHaloWidth = s.labelStrokeWidth;
    delete s.labelStrokeWidth;
  }
  if ("labelStrokeOpacity" in s) {
    if (s.labelHaloOpacity === undefined) s.labelHaloOpacity = s.labelStrokeOpacity;
    delete s.labelStrokeOpacity;
  }
}

export function migrateLegacyCircleControlHaloStyles(
  mapCircleControls: MapCircleControls | null | undefined
): void {
  for (const control of Object.values(mapCircleControls ?? {})) {
    migrateLegacyHaloStyle(control.style);
  }
}

/**
 * Converts db preset fks to their uuid/id arrays
 * @param dbPresets an array of presets in mikro db format
 * @returns an a converted array of presets or a single preset
 */
export function convertPresetsTypeDbToStore(dbPresets: Preset_db[]): Preset[] {
  const presets: Preset[] = [];
  for (const dbPreset of dbPresets) {
    const convertedPreset: Preset = {
      uuid: dbPreset.uuid,
      missionId: dbPreset.missionId,
      ownerId: dbPreset.ownerId,
      name: dbPreset.name,
      description: dbPreset.description,
      missionDefault: dbPreset.missionDefault,
      mapSublayerControls: dbPreset.mapSublayerControls,
      mapCircleControls: dbPreset.mapCircleControls,
      mapGridControl: dbPreset.mapGridControl,
      sunAzimuth: dbPreset?.sunAzimuth || 0,
      sunEnabled: dbPreset?.sunEnabled || false,
      earthAzimuth: dbPreset?.earthAzimuth || 0,
      earthEnabled: dbPreset?.earthEnabled || false,
      earthAsMoon: dbPreset?.earthAsMoon || false,
      layerOrder: dbPreset.layerOrder,
      createdAt: dbPreset.createdAt.toISOString(),
      updatedAt: dbPreset.updatedAt.toISOString(),
    };
    // Migrate legacy label halo field names on every style object.
    for (const control of Object.values(convertedPreset.mapSublayerControls ?? {})) {
      migrateLegacyHaloStyle(control.style);
    }
    migrateLegacyCircleControlHaloStyles(convertedPreset.mapCircleControls);
    migrateLegacyHaloStyle(convertedPreset.mapGridControl?.style);
    presets.push(convertedPreset);
  }
  return presets;
}

/**
 * Converts presets that come from the store into the db type
 * @param storePresets
 * @returns
 */
export function convertPresetsTypeStoreToDb(storePresets: Preset[]): EntityData<Preset_db>[] {
  const dbPresets: EntityData<Preset_db>[] = [];
  for (const storePreset of storePresets) {
    const convertedRecord: EntityData<Preset_db> = {
      uuid: storePreset.uuid,
      ownerId: storePreset.ownerId,
      missionId: storePreset.missionId,
      name: storePreset.name,
      description: storePreset.description,
      missionDefault: storePreset.missionDefault,
      mapSublayerControls: storePreset.mapSublayerControls,
      mapCircleControls: storePreset.mapCircleControls,
      mapGridControl: storePreset.mapGridControl,
      sunAzimuth: storePreset.sunAzimuth,
      sunEnabled: storePreset.sunEnabled,
      earthAzimuth: storePreset.earthAzimuth,
      earthEnabled: storePreset.earthEnabled,
      earthAsMoon: storePreset.earthAsMoon,
      layerOrder: storePreset.layerOrder,
      createdAt: new Date(storePreset.createdAt),
      updatedAt: new Date(storePreset.updatedAt),
    };
    dbPresets.push(convertedRecord);
  }
  return dbPresets;
}
