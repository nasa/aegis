import cloneDeep from "lodash/cloneDeep";
import isEqual from "lodash/isEqual";

import { petSecondsAt } from "utils/formatting";

/** Emoji drawn for an asset with no icon (❔), matching stations. */
export const DEFAULT_ASSET_ICON = "2754";
/** Uncertainty ring color for an asset with no color. */
export const DEFAULT_ASSET_RING_COLOR = "#ffcc00";

export const ASSET_DRAFT_FIELDS: readonly (keyof AssetDraftValues)[] = [
  "name",
  "icon",
  "color",
  "location",
  "elevation",
  "uncertaintyMeters",
  "notes",
  "placement",
];

/** Case-insensitive name order with a uuid tie-breaker, for folders and assets alike. */
export function compareByName(
  a: { name: string; uuid: string },
  b: { name: string; uuid: string }
): number {
  return (
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
    (a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0)
  );
}

/** The most recently created asset (`createdAt`, uuid tie-breaker), or null. */
export function getMostRecentAsset(assets: Asset[]): Asset | null {
  let latest: Asset | null = null;
  for (const asset of assets) {
    if (
      !latest ||
      asset.createdAt > latest.createdAt ||
      (asset.createdAt === latest.createdAt && asset.uuid > latest.uuid)
    ) {
      latest = asset;
    }
  }
  return latest;
}

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
 * The assets to draw on a map. A draft replaces its saved asset's values (same uuid) and a new
 * draft is drawn once it has a location. Hidden or unplaced assets are filtered out before any
 * map conversion, so nothing is drawn at the projection origin.
 */
export function getVisibleMapAssets({
  assets,
  folders,
  draft,
  showAssets,
}: {
  assets: Asset[];
  folders: Folder[];
  draft: AssetDraft | null;
  showAssets: boolean;
}): AssetMapItem[] {
  if (!showAssets) return [];
  const folderUuidByItem = getAssetFolderUuidByItem(folders);
  const foldersByUuid = new Map(folders.map((folder) => [folder.uuid, folder]));
  const draftAsset = draft
    ? assets.find((asset) => asset.uuid === draft.uuid) ||
      (draft.isNew ? ({ uuid: draft.uuid, visible: true } as Asset) : null)
    : null;
  const candidates = assets.filter((asset) => asset.uuid !== draftAsset?.uuid);
  if (draftAsset) candidates.push({ ...draftAsset, ...draft.values });

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

/**
 * Capture placement context at one instant: the running REX (from mission data, regardless of
 * the selected REX/EVA), its EVA, and a detached copy of its PET clock. More than one running
 * REX is ambiguous, so no REX context is stored.
 */
export function captureAssetPlacement(
  mission: Pick<Mission, "rexes" | "evas">,
  nowMs: number
): AssetPlacementCapture {
  const runningRexes = Object.values(mission.rexes ?? {}).filter((rex) => rex.isRunning);
  const placement: AssetPlacementContext = {
    locationSetAt: nowMs,
    runningRexUuid: null,
    runningRexName: null,
    runningEvaUuid: null,
    runningEvaName: null,
    petClock: null,
  };
  if (runningRexes.length !== 1) {
    return { placement, ambiguous: runningRexes.length > 1 };
  }
  const [rex] = runningRexes;
  const eva = mission.evas?.[rex.evaUuid] ?? null;
  // A REX's EVA copy may have no name of its own; fall back to its as-planned EVA's name.
  const rexEvaUuids = new Set(Object.values(mission.rexes ?? {}).map((r) => r.evaUuid));
  const asPlannedEva = eva
    ? Object.values(mission.evas ?? {}).find(
        (candidate) => candidate.refUuid === eva.refUuid && !rexEvaUuids.has(candidate.uuid)
      )
    : null;
  placement.runningRexUuid = rex.uuid;
  placement.runningRexName = rex.name ?? null;
  placement.runningEvaUuid = rex.evaUuid ?? null;
  placement.runningEvaName = eva?.name || asPlannedEva?.name || null;
  placement.petClock = {
    petValueAtStartStop: rex.petValueAtStartStop,
    petStartStopTimestamp: rex.petStartStopTimestamp,
    petRunning: rex.petRunning,
  };
  return { placement, ambiguous: false };
}

/** PET at the moment the asset was placed, or null when unavailable. */
export function getAssetPlacementPetSeconds(
  placement: AssetPlacementContext | null
): number | null {
  if (!placement?.petClock) return null;
  return petSecondsAt(placement.petClock, placement.locationSetAt);
}

/** Detached copy of the editable fields of an asset. */
export function getAssetDraftValues(asset: Asset): AssetDraftValues {
  const values = {} as AssetDraftValues;
  for (const field of ASSET_DRAFT_FIELDS) {
    (values as Record<string, unknown>)[field] = cloneDeep(asset[field] ?? null);
  }
  return values;
}

const PLACEMENT_FIELDS: readonly (keyof AssetDraftValues)[] = [
  "location",
  "elevation",
  "placement",
];

/**
 * Fields of `values` that differ from `base`, detached. Location, elevation, and placement
 * context are one unit: a change to any of them includes all three.
 */
export function getChangedAssetFields(
  base: AssetDraftValues,
  values: AssetDraftValues
): Partial<AssetDraftValues> {
  const changes: Partial<AssetDraftValues> = {};
  for (const field of ASSET_DRAFT_FIELDS) {
    if (!isEqual(base[field] ?? null, values[field] ?? null)) {
      (changes as Record<string, unknown>)[field] = cloneDeep(values[field] ?? null);
    }
  }
  if (PLACEMENT_FIELDS.some((field) => field in changes)) {
    for (const field of PLACEMENT_FIELDS) {
      (changes as Record<string, unknown>)[field] = cloneDeep(values[field] ?? null);
    }
  }
  return changes;
}

/**
 * Merge a draft onto a document that changed underneath it. Fields only the other side
 * changed are adopted; fields both sides changed to different values are conflicts and keep
 * the draft's value.
 */
export function mergeAssetDraftWithDocument(
  base: AssetDraftValues,
  values: AssetDraftValues,
  current: AssetDraftValues
): { values: AssetDraftValues; conflicts: (keyof AssetDraftValues)[] } {
  const ownChanges = getChangedAssetFields(base, values);
  const merged = { ...cloneDeep(current), ...cloneDeep(ownChanges) };
  const conflicts = (Object.keys(ownChanges) as (keyof AssetDraftValues)[]).filter(
    (field) =>
      !isEqual(base[field] ?? null, current[field] ?? null) &&
      !isEqual(ownChanges[field] ?? null, current[field] ?? null)
  );
  return { values: merged, conflicts };
}

/** Validation message for a draft, or null when it can be saved. */
export function validateAssetDraftValues(values: AssetDraftValues): string | null {
  if (!values.name?.trim()) return "Name is required";
  if (!Number.isFinite(values.uncertaintyMeters) || values.uncertaintyMeters < 0) {
    return "Radius must be a number of meters, zero or more";
  }
  if (values.location !== null && !isPlacedLocation(values.location)) {
    return "Coordinates must be finite";
  }
  if ((values.location === null) !== (values.placement === null)) {
    return "Location and placement context must be set together";
  }
  return null;
}
