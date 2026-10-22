/** Transient Redux data, separate from persisted mission entities. */
type TerrainProfileEntry = {
  fingerprint: string;
  path: AEGISPoint[];
  distances: number[];
  status: "idle" | "loading" | "ready" | "error";
  profile: TerrainProfile | null;
  error: string | null;
};
type TerrainProfiles = Record<string, TerrainProfileEntry>;
type TerrainProfilesState = {
  activeMissionId: number | null;
  missions: Record<number, { profiles: TerrainProfiles; previews: TerrainProfiles }>;
};
