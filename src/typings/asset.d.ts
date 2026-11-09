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
  /** Radius fill and emoji background color; null renders transparent. */
  color: string | null;
  /** Shared map visibility of this asset. */
  visible: boolean;
  /** Null until the asset is placed. */
  location: AEGISPoint | null;
  elevation: number | null;
  /** Uncertainty radius in meters; zero draws no radius circle. */
  uncertaintyMeters: number;
  notes: string | null;
  /** Editable PET in seconds, initially captured from the running REX when adding the asset. */
  petSeconds: number | null;
  /** REX that supplied PET; null for a manually entered or absent PET. */
  rexUuid: string | null;
  createdAt: number;
  updatedAt: number;
}

/** The asset fields edited in the asset editor. */
type AssetEditValues = Pick<
  Asset,
  | "name"
  | "icon"
  | "color"
  | "location"
  | "elevation"
  | "uncertaintyMeters"
  | "notes"
  | "petSeconds"
  | "rexUuid"
>;

/** Unsaved Add or Edit session, including the map position preview. */
interface AssetInEdit {
  uuid: string;
  isNew: boolean;
  values: AssetEditValues;
  /** Baseline used to save only changed fields. Null for a new asset. */
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
