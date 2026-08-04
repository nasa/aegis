type GridUpsertRequest = {
  grids: MissionGrid[];
  missionId: number;
  upsertFullGrid: boolean;
};

type GridDeleteRequest = {
  gridUuid: string;
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
>;
type MissionFieldsUpdate = Partial<MissionFields>;

/**
 * Update a subset of top-level mission fields on the server-side Automerge doc
 * (POST /api/v1/missionAutomerge/fields). Used by external (non-browser) tooling —
 * e.g. the data-conversion pipeline that registers a mission's projection/DEM/lander
 * metadata over HTTP. The route requires the EMSS API token and rejects changed
 * landerLocation values once affected mission assets exist. `fields` is a partial Mission;
 * the route only applies an allow-listed set of keys.
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
  defaultUrl: string;
  urlOverride: string | null;
  effectiveUrl: string;
  isOverridden: boolean;
};

type AutomergeUpsertRequest = {
  automergeDocListings?: AutomergeDocListing[];
};

type AutomergeDeleteRequest = {
  missionIds: number[];
};
