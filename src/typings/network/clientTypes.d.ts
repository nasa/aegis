type GridUpsertRequest = {
  grid: MissionGrid;
  missionId: number;
  upsertFullGrid: boolean;
};

type GridDeleteRequest = {
  missionId: number;
};

type LayerUpsertRequest = {
  missionId: number;
  layers: Layer[];
};

type LayerDeleteRequest = {
  missionId: number;
  layerUuids: string[];
};

type MissionDeleteRequest = {
  missionIds: number[];
};

/**
 * Top-level mission fields that may be set through the fields-update endpoint.
 * Deliberately limited to GIS/setup metadata (projection, DEM, lander, naming) so
 * external tooling cannot clobber collaborative entity collections (pois/stations/evas/…).
 */

type MissionFields = Pick<
  Mission,
  | "name"
  | "description"
  | "landerLocation"
  | "landerElevationMeters"
  | "planetRadius"
  | "initialZoom"
  | "demFilePath"
  | "absoluteSlopeFilePath"
  | "demResolution"
  | "projIsCustom"
  | "projEpsg"
  | "projProj4String"
  | "projBoundsMinX"
  | "projBoundsMinY"
  | "projBoundsMaxX"
  | "projBoundsMaxY"
  | "projOriginX"
  | "projOriginY"
  | "projResZoomLevel"
  | "projResUnitsPerPixel"
  | "actionSystemVersion"
  | "usingLGRSCoordinates"
  | "gridRenderMode"
>;
type MissionFieldsUpdate = Partial<MissionFields>;

/**
 * Update a subset of top-level mission fields on the server-side Automerge doc
 * (POST /api/v1/missionAutomerge/fields). Used by external (non-browser) tooling —
 * e.g. the data-conversion pipeline that registers a mission's projection/DEM/lander
 * metadata over HTTP. The route uses standard mission edit authorization and rejects
 * changed landerLocation values once affected mission assets exist. `fields` is a partial
 * set of the explicitly supported mission fields.
 */
type MissionFieldsUpdateRequest = {
  missionId: number;
  fields: MissionFieldsUpdate;
};

type PresetUpsertRequest = {
  missionId: number;
  socketId: string;
  presets: Preset[];
};

type PresetDeleteRequest = {
  missionId: number;
  socketId: string;
  presetUuids: string[];
};

type STMUpsertRequest = {
  missionId: number;
  stmObjects: STMLevel1[] | STMLevel2[] | STMLevel3[];
  stmType: "Level1" | "Level2" | "Level3";
};

type STMDeleteRequest = {
  missionId: number;
  stmType: "Level1" | "Level2" | "Level3" | "ALL";
  uuids: string[];
};

type STMRuleUpsertRequest = {
  missionId: number;
  socketId: string;
  stmRules: STMRule[];
};
type STMRuleDeleteRequest = {
  missionId: number;
  socketId: string;
  stmRuleUuids: string[];
};

type SublayerUpsertRequest = {
  missionId: number;
  sublayers: Sublayer[];
};

type SublayerDeleteRequest = {
  missionId: number;
  sublayerUuids: string[];
};

type UserUpsertRequest = {
  users: AppUser[];
};

type UserDeleteRequest = {
  userIds: number[];
};

type FolderUpsertRequest = {
  missionId: number;
  socketId?: string;
  folders: Folder[];
};

type FolderDeleteRequest = {
  missionId: number;
  socketId?: string;
  folderUuids: string[];
};

type EnvironmentConfigData = {
  key: string;
  /** Fields directly from the database row (or `null` when no row exists yet). */
  config: {
    /** Override value stored in the database. `null` means no override is set. */
    value: string | null;
    description: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  /** Default value sourced from the deployment environment (e.g. from `process.env`). */
  defaultValue: string | null;
  /** The value actually in use: `config.value` if set, otherwise `defaultValue`. */
  effectiveValue: string | null;
  /** True when a non-empty override value is stored in the database. */
  isOverridden: boolean;
};

type AutomergeUpsertRequest = {
  automergeDocListings?: AutomergeDocListing[];
};

type AutomergeDeleteRequest = {
  missionIds: number[];
};
