/** Transient Redux data, separate from persisted mission entities. */
type TerrainProfileEntry = {
  inputSignature: string;
  path: AEGISPoint[];
  distances: number[];
  /** "idle" is pending: queued or in flight. */
  status: "idle" | "ready" | "error";
  profile: TerrainProfile | null;
  error: string | null;
  retryable?: boolean;
};
type TerrainProfiles = Record<string, TerrainProfileEntry>;
type TerrainProfilesState = {
  profiles: TerrainProfiles;
  previews: TerrainProfiles;
};

/** Request-scoped database snapshot for a mission's committed profiles. */
type MissionTerrainProfileCache = {
  missionId: number;
  profiles: Map<string, { inputSignature: string; profile: TerrainProfile }>;
};
