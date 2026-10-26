/** Newton `WorkStatus` plus the AEGIS-only `submitting` state. */
type TraversePathStatus =
  "submitting" | "pending" | "in_progress" | "succeeded" | "failed" | "cancelled";

/** Newton `MapInfo` entry, trimmed to the fields the UI reads. */
type TraversePathMapInfo = {
  planet: string;
  type: "slope" | "obstacle" | "elevation" | string;
  name: string;
  resolution?: number[];
  description?: string;
};

/** Newton error object or an AEGIS-side message. */
type TraversePathError = {
  code?: string;
  message: string;
  details?: unknown;
};

type TraversePathLineString = {
  type: "LineString";
  /** `[lng, lat]` pairs. */
  coordinates: number[][];
};

/** One `traverse_path_db` row as returned by `GET /api/v1/traversePath`. */
type TraversePathRow = {
  uuid: string;
  missionId: number;
  traverseRefUuid: string;
  createdFromTraverseUuid: string;
  startPoint: AEGISPoint;
  endPoint: AEGISPoint;
  method: string | null;
  paramsKey: string;
  requestHash: string | null;
  status: TraversePathStatus;
  path: TraversePathLineString | null;
  mapInfo: TraversePathMapInfo[] | null;
  runtimeMs: number | null;
  error: TraversePathError | null;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Where traverse path options come from on the client. */
type TraversePathSource = "off" | "mock" | "api";

/** A traverse whose path options the client is tracking. */
type TraversePathTarget = {
  traverseUuid: string;
  refUuid: string;
  start: AEGISPoint | undefined;
  end: AEGISPoint | undefined;
};

/** A succeeded row converted for display. */
type TraversePathCandidate = {
  row: TraversePathRow;
  path: AEGISPoint[];
  distanceMeters: number;
};

/** Rows for one traverse, split by whether they match its current endpoints. */
type TraversePathRowsForTraverse = {
  applying: TraversePathRow[];
  staleCount: number;
};

type TraversePathsContextValue = {
  source: TraversePathSource;
  /** Traverses of the selected EVA, with their current endpoints. */
  targets: TraversePathTarget[];
  rowsByRefUuid: Record<string, TraversePathRow[]>;
  fetchError: string | null;
  isPolling: boolean;
  highlightedPathUuid: string | null;
  setHighlightedPathUuid: (uuid: string | null) => void;
};

/** A recorded Newton result replayed by the in-browser mock. */
type TraversePathMockFixtureEntry = {
  /** Mock parameter set this result belongs to (`default`, `slope10`). */
  paramSet: string;
  label: string | null;
  start: AEGISPoint;
  end: AEGISPoint;
  requestHash: string | null;
  status: TraversePathStatus;
  method: string | null;
  runtimeMs: number | null;
  path: TraversePathLineString | null;
  mapInfo: TraversePathMapInfo[] | null;
  error: TraversePathError | null;
};

type TraversePathMockFixture = {
  missionId: number;
  source: string;
  capturedAt: string;
  entries: TraversePathMockFixtureEntry[];
};
