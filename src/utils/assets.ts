import cloneDeep from "lodash/cloneDeep";
import isEqual from "lodash/isEqual";
import { validators } from "components/interface/form/formValidators";

import { petSecondsAt, secondsFromhhmmss } from "utils/formatting";

/** Emoji drawn for an asset with no icon (❔), matching stations. */
export const DEFAULT_ASSET_ICON = "2754";
/** Blue used wherever an asset has no custom color. */
export const DEFAULT_ASSET_COLOR = "#2878B5";

export function getAssetColor(asset: Pick<Asset, "color">): string {
  return asset.color ?? DEFAULT_ASSET_COLOR;
}

// String limits use JavaScript/HTML UTF-16 length, matching the form controls.
export const ASSET_NAME_MAX_LENGTH = 80;
export const ASSET_NOTES_MAX_LENGTH = 10_000;
export const ASSET_RADIUS_MAX_METERS = 1_000;

/**
 * Color of an asset's radius circle, using the default blue without a custom color.
 * Null when the radius is zero, so no circle is drawn.
 */
export function getAssetRadiusColor(
  asset: Pick<Asset, "color" | "uncertaintyMeters">
): string | null {
  return asset.uncertaintyMeters > 0 ? getAssetColor(asset) : null;
}

export const ASSET_EDIT_FIELDS: readonly (keyof AssetEditValues)[] = [
  "name",
  "icon",
  "color",
  "location",
  "elevation",
  "uncertaintyMeters",
  "notes",
  "petSeconds",
  "rexUuid",
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
 * The single map visibility rule for every asset artifact (marker, radius, label, hover,
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
 * The assets to draw on a map. Selection and editing reveal only the active asset without
 * changing visibility settings. The in-edit asset replaces its saved values under the same uuid.
 * Unplaced assets are filtered out before map conversion.
 */
export function getVisibleMapAssets({
  assets,
  folders,
  inEdit,
  showAssets,
  selectedAssetUuid = null,
}: {
  assets: Asset[];
  folders: Folder[];
  inEdit: AssetInEdit | null;
  showAssets: boolean;
  selectedAssetUuid?: string | null;
}): AssetMapItem[] {
  const folderUuidByItem = getAssetFolderUuidByItem(folders);
  const foldersByUuid = new Map(folders.map((folder) => [folder.uuid, folder]));
  const inEditAsset = inEdit
    ? assets.find((asset) => asset.uuid === inEdit.uuid) ||
      (inEdit.isNew ? ({ uuid: inEdit.uuid, visible: true } as Asset) : null)
    : null;
  const candidates = assets.filter((asset) => asset.uuid !== inEditAsset?.uuid);
  if (inEditAsset) {
    const changes = inEdit.isNew
      ? inEdit.values
      : getChangedAssetFields(inEdit.base, inEdit.values);
    candidates.push({ ...inEditAsset, ...changes });
  }

  const result: AssetMapItem[] = [];
  for (const asset of candidates) {
    const folder = foldersByUuid.get(folderUuidByItem[asset.uuid]);
    const active = asset.uuid === selectedAssetUuid || asset.uuid === inEditAsset?.uuid;
    if (!isPlacedLocation(asset.location)) continue;
    if (!active && !isAssetVisibleOnMap(asset, folder, showAssets)) continue;
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
): Pick<Asset, "petSeconds" | "rexUuid"> {
  const runningRexes = Object.values(mission.rexes ?? {}).filter((rex) => rex.isRunning);
  const rex = runningRexes.length === 1 ? runningRexes[0] : null;
  const petSeconds = petSecondsAt(rex, nowMs);
  return {
    petSeconds,
    rexUuid: petSeconds !== null ? rex.uuid : null,
  };
}

/** Parse signed or unsigned HH:MM:SS, allowing hours beyond 99. Blank/invalid input returns null. */
export function parseAssetPetSeconds(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed || validators.mustBeHHMMSS(trimmed)) return null;
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

const LOCATION_FIELDS: readonly (keyof AssetEditValues)[] = ["location", "elevation"];
const PET_FIELDS: readonly (keyof AssetEditValues)[] = ["petSeconds", "rexUuid"];

/**
 * Fields of `values` that differ from `base`, detached. Location and elevation are
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
