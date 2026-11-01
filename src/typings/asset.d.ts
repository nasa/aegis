/**
 * A point asset tracked on the mission (e.g. a tool or instrument left on the surface).
 * Assets belong to the mission, not to an EVA or REX.
 */
interface Asset {
  uuid: string;
  /** Trimmed and nonblank; not required to be unique. */
  name: string;
  /** Emoji code point string from the emoji picker (e.g. "1F534"); null renders "2754" (❔). */
  icon: string | null;
  /** Radius ring color, also the disc behind the emoji; null uses the default ring color. */
  color: string | null;
  /** Shared map visibility of this asset. */
  visible: boolean;
  /** Null until the asset is placed. Set together with `placement`. */
  location: AEGISPoint | null;
  elevation: number | null;
  /** Uncertainty radius in meters; zero draws no ring or emoji disc. */
  uncertaintyMeters: number;
  notes: string | null;
  /** Placement recorded when the location was last set. Null exactly when `location` is null. */
  placement: AssetPlacement | null;
  createdAt: number;
  updatedAt: number;
}

/** The running REX, its EVA, and PET clock at the instant the asset's location was set. */
interface AssetPlacement {
  /** UTC epoch ms. */
  locationSetAt: number;
  runningRexUuid: string | null;
  runningRexName: string | null;
  runningEvaUuid: string | null;
  runningEvaName: string | null;
  petClock: AssetPetClockSnapshot | null;
}

/** Detached copy of a REX's PET clock fields. */
type AssetPetClockSnapshot = Pick<
  Rex,
  "petValueAtStartStop" | "petStartStopTimestamp" | "petRunning"
>;

/** The asset fields edited in the asset editor. */
type AssetEditValues = Pick<
  Asset,
  "name" | "icon" | "color" | "location" | "elevation" | "uncertaintyMeters" | "notes" | "placement"
>;

/** The asset being edited in the editor (added or changed), held in Redux until Save. */
interface AssetInEdit {
  uuid: string;
  isNew: boolean;
  values: AssetEditValues;
  /** Values when the edit opened; drives the Save dirty check. Null for a new asset. */
  base: AssetEditValues | null;
  /** True while an elevation fetch for `values.location` is in flight. */
  elevationPending: boolean;
}

/** A placed, visible asset as drawn on a map (the in-edit values while they are being edited). */
type AssetMapItem = Pick<Asset, "uuid" | "name" | "color" | "uncertaintyMeters"> & {
  icon: string;
  location: AEGISPoint;
};

/** Why an asset is hidden on the map by a shared flag, if it is. */
type AssetHiddenReason = "asset" | "folder" | null;

interface AssetState {
  selectedAssetUuid: string | null;
  expandedAssetUuid: string | null;
  inEdit: AssetInEdit | null;
  /** Incremented to ask the floating widget to restore and show its Assets tab. */
  assetsTabRequestId: number;
}
