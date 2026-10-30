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
  color: string | null;
  /** Shared map visibility of this asset. */
  visible: boolean;
  /** Null until the asset is placed. Set together with `placement`. */
  location: AEGISPoint | null;
  elevation: number | null;
  /** Uncertainty radius in meters; zero draws no ring. */
  uncertaintyMeters: number;
  notes: string | null;
  /** Context captured when the location was last set. Null exactly when `location` is null. */
  placement: AssetPlacementContext | null;
  createdAt: number;
  updatedAt: number;
}

/** Snapshot taken at the instant an asset's location was set. */
interface AssetPlacementContext {
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

/** The asset fields edited in the black editor. */
type AssetDraftValues = Pick<
  Asset,
  "name" | "icon" | "color" | "location" | "elevation" | "uncertaintyMeters" | "notes" | "placement"
>;

/** An open Add/Edit Asset draft, held in Redux until Save. */
interface AssetDraft {
  uuid: string;
  isNew: boolean;
  missionId: number | null;
  values: AssetDraftValues;
  /** Document values when the draft opened; null for a new asset. */
  base: AssetDraftValues | null;
  /** True while an elevation fetch for `values.location` is in flight. */
  elevationPending: boolean;
  /** Recoverable message shown in the editor, e.g. a conflicting change underneath the draft. */
  message: string | null;
}

/** Result of capturing placement context; `ambiguous` when more than one REX is running. */
type AssetPlacementCapture = { placement: AssetPlacementContext; ambiguous: boolean };

/** A placed, visible asset as drawn on a map (the draft's values while it is being edited). */
type AssetMapItem = Pick<Asset, "uuid" | "name" | "color" | "uncertaintyMeters"> & {
  icon: string;
  location: AEGISPoint;
};

/** Why an asset is hidden on the map by a shared flag, if it is. */
type AssetHiddenReason = "asset" | "folder" | null;

interface AssetState {
  selectedAssetUuid: string | null;
  draft: AssetDraft | null;
  /** Incremented to ask the floating widget to restore and show its Assets tab. */
  assetsTabRequestId: number;
}
