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

/** "application" shows on every page; "missions" shows only on the listed missions' pages. */
type NotificationBannerScope = "application" | "missions";
type NotificationBannerTextColor = "white" | "black";

/** Banner as returned by the admin REST endpoints. Dates are ISO strings in UTC. */
type NotificationBanner = {
  id: number;
  message: string;
  /** Manual on/off switch, applied on top of the time window. */
  enabled: boolean;
  /** null means no start limit. */
  startsAt: string | null;
  /** null means no end limit. */
  endsAt: string | null;
  scope: NotificationBannerScope;
  /** Missions the banner shows on when `scope` is "missions"; empty otherwise. */
  missionIds: number[];
  /** "#RRGGBB" */
  backgroundColor: string;
  textColor: NotificationBannerTextColor;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Fields the admin page sends on create and update. */
type NotificationBannerInput = Pick<
  NotificationBanner,
  | "message"
  | "enabled"
  | "startsAt"
  | "endsAt"
  | "scope"
  | "missionIds"
  | "backgroundColor"
  | "textColor"
>;

/** Banner as shown to end users. `updatedAt` identifies the version a user dismissed. */
type ActiveNotificationBanner = Pick<
  NotificationBanner,
  "id" | "message" | "endsAt" | "backgroundColor" | "textColor" | "updatedAt"
>;

/**
 * Admin banner editor state. Times are `datetime-local` values in the admin's time zone;
 * an empty string means no limit.
 */
type NotificationBannerFormValues = Omit<NotificationBannerInput, "startsAt" | "endsAt"> & {
  startsAtLocal: string;
  endsAtLocal: string;
};

type AutomergeUpsertRequest = {
  automergeDocListings?: AutomergeDocListing[];
};

type AutomergeDeleteRequest = {
  missionIds: number[];
};
