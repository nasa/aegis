import cloneDeep from "lodash/cloneDeep";
import isEqual from "lodash/isEqual";

import { petSecondsAt, secondsFromhhmmss } from "utils/formatting";

/** Emoji drawn for an asset with no icon (❔), matching stations. */
export const DEFAULT_ASSET_ICON = "2754";
/** Uncertainty ring color for an asset with no color. */
export const DEFAULT_ASSET_RING_COLOR = "#999999";

/**
 * Color of an asset's radius ring, also used for the disc behind its emoji on the map and in
 * the asset table. Null when the radius is zero, so no ring or disc is drawn.
 */
export function getAssetRadiusColor(
  asset: Pick<Asset, "color" | "uncertaintyMeters">
): string | null {
  return asset.uncertaintyMeters > 0 ? asset.color || DEFAULT_ASSET_RING_COLOR : null;
}

export const ASSET_EDIT_FIELDS: readonly (keyof AssetEditValues)[] = [
  "name",
  "icon",
  "color",
  "location",
  "locationSetAt",
  "elevation",
  "uncertaintyMeters",
  "notes",
  "petSeconds",
  "petRex",
];

/** Map each asset uuid to the uuid of the asset folder holding it. */
export function getAssetFolderUuidByItem(folders: Folder[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const folder of folders) {
    if (folder.type !== "asset") continue;
    for (const itemUuid of folder.items) {
      if (!result[itemUuid]) result[itemUuid] = folder.uuid;
    }
  }
  return result;
}

/** A finite lat/lng point. A zero coordinate is valid. */
export function isPlacedLocation(location: AEGISPoint | null | undefined): boolean {
  return !!location && Number.isFinite(location.lat) && Number.isFinite(location.lng);
}

/** Which shared flag hides an asset on every map, if any. The asset's own flag wins. */
export function getAssetHiddenReason(
  asset: Pick<Asset, "visible">,
  folder: Pick<Folder, "visible"> | null | undefined
): AssetHiddenReason {
  if (!asset.visible) return "asset";
  if (folder && !folder.visible) return "folder";
  return null;
}

/**
 * The single map visibility rule for every asset artifact (marker, ring, label, hover,
 * selection, preview, hit testing). Independent of the selected section, EVA, or REX.
 */
export function isAssetVisibleOnMap(
  asset: Pick<Asset, "visible" | "location">,
  folder: Pick<Folder, "visible"> | null | undefined,
  showAssets: boolean
): boolean {
  return (
    isPlacedLocation(asset.location) && showAssets && getAssetHiddenReason(asset, folder) === null
  );
}

/**
 * The assets to draw on a map. The in-edit asset replaces its saved values (same uuid) and a
 * new asset is drawn once it has a location. Hidden or unplaced assets are filtered out before any
 * map conversion, so nothing is drawn at the projection origin.
 */
export function getVisibleMapAssets({
  assets,
  folders,
  inEdit,
  showAssets,
}: {
  assets: Asset[];
  folders: Folder[];
  inEdit: AssetInEdit | null;
  showAssets: boolean;
}): AssetMapItem[] {
  if (!showAssets) return [];
  const folderUuidByItem = getAssetFolderUuidByItem(folders);
  const foldersByUuid = new Map(folders.map((folder) => [folder.uuid, folder]));
  const inEditAsset = inEdit
    ? assets.find((asset) => asset.uuid === inEdit.uuid) ||
      (inEdit.isNew ? ({ uuid: inEdit.uuid, visible: true } as Asset) : null)
    : null;
  const candidates = assets.filter((asset) => asset.uuid !== inEditAsset?.uuid);
  if (inEditAsset) candidates.push({ ...inEditAsset, ...inEdit.values });

  const result: AssetMapItem[] = [];
  for (const asset of candidates) {
    const folder = foldersByUuid.get(folderUuidByItem[asset.uuid]);
    if (!isAssetVisibleOnMap(asset, folder, showAssets)) continue;
    result.push({
      uuid: asset.uuid,
      name: asset.name,
      icon: asset.icon || DEFAULT_ASSET_ICON,
      color: asset.color ?? null,
      uncertaintyMeters: asset.uncertaintyMeters,
      location: { lat: asset.location.lat, lng: asset.location.lng },
    });
  }
  return result;
}

/** Capture the current PET and its source REX together, leaving both blank when unavailable. */
export function getCurrentAssetPet(
  mission: Pick<Mission, "rexes">,
  nowMs: number
): Pick<Asset, "petSeconds" | "petRex"> {
  const runningRexes = Object.values(mission.rexes ?? {}).filter((rex) => rex.isRunning);
  const rex = runningRexes.length === 1 ? runningRexes[0] : null;
  const petSeconds = petSecondsAt(rex, nowMs);
  return {
    petSeconds,
    petRex: petSeconds !== null ? { uuid: rex.uuid, name: rex.name } : null,
  };
}

/** Parse signed or unsigned HH:MM:SS, allowing hours beyond 99. Blank/invalid input returns null. */
export function parseAssetPetSeconds(text: string): number | null {
  const trimmed = text.trim();
  if (!/^[+-]?\d{2,}:[0-5]\d:[0-5]\d$/.test(trimmed)) return null;
  const seconds = secondsFromhhmmss(/^[+-]/.test(trimmed) ? trimmed : `+${trimmed}`);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

/** Detached copy of the editable fields of an asset. */
export function getAssetEditValues(asset: Asset): AssetEditValues {
  const values = {} as AssetEditValues;
  for (const field of ASSET_EDIT_FIELDS) {
    (values as Record<string, unknown>)[field] = cloneDeep(asset[field] ?? null);
  }
  return values;
}

const LOCATION_FIELDS: readonly (keyof AssetEditValues)[] = [
  "location",
  "elevation",
  "locationSetAt",
];
const PET_FIELDS: readonly (keyof AssetEditValues)[] = ["petSeconds", "petRex"];

/**
 * Fields of `values` that differ from `base`, detached. Location, elevation, and its timestamp are
 * one unit; PET and its source REX are another. A change carries the whole unit.
 */
export function getChangedAssetFields(
  base: AssetEditValues,
  values: AssetEditValues
): Partial<AssetEditValues> {
  const changes: Partial<AssetEditValues> = {};
  for (const field of ASSET_EDIT_FIELDS) {
    if (!isEqual(base[field] ?? null, values[field] ?? null)) {
      (changes as Record<string, unknown>)[field] = cloneDeep(values[field] ?? null);
    }
  }
  for (const fields of [LOCATION_FIELDS, PET_FIELDS]) {
    if (fields.some((field) => field in changes)) {
      for (const field of fields) {
        (changes as Record<string, unknown>)[field] = cloneDeep(values[field] ?? null);
      }
    }
  }
  return changes;
}

/** Validation message for in-edit values, or null when they can be saved. */
export function validateAssetEditValues(values: AssetEditValues): string | null {
  if (!values.name?.trim()) return "Name is required";
  if (!Number.isFinite(values.uncertaintyMeters) || values.uncertaintyMeters < 0) {
    return "Radius must be a number of meters, zero or more";
  }
  if (values.petSeconds !== null && !Number.isSafeInteger(values.petSeconds)) {
    return "PET must be a whole number of seconds";
  }
  if (values.location !== null && !isPlacedLocation(values.location)) {
    return "Coordinates must be finite";
  }
  if ((values.location === null) !== (values.locationSetAt === null)) {
    return "Location and its timestamp must be set together";
  }
  return null;
}
