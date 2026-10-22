/** Transient Redux data, separate from persisted mission entities. */
type TerrainProfileEntry = {
  fingerprint: string;
  path: AEGISPoint[];
  distances: number[];
  /** "idle" is pending: queued or in flight. */
  status: "idle" | "ready" | "error";
  profile: TerrainProfile | null;
  error: string | null;
};
type TerrainProfiles = Record<string, TerrainProfileEntry>;
type TerrainProfilesState = {
  activeMissionId: number | null;
  missions: Record<number, { profiles: TerrainProfiles; previews: TerrainProfiles }>;
};
