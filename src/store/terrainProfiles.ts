import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export const initialState: TerrainProfilesState = { activeMissionId: null, missions: {} };
export const terrainFingerprint = (
  mission: Pick<Mission, "id" | "demFilePath" | "demResolution">,
  path: AEGISPoint[],
  distances: number[]
): string =>
  JSON.stringify([
    mission.id,
    mission.demFilePath,
    mission.demResolution,
    path.map((point) => [point.lat, point.lng]),
    distances,
  ]);

export const terrainProfilesSlice = createSlice({
  name: "terrainProfiles",
  initialState,
  reducers: {
    reconcileTerrainProfiles(
      state,
      { payload }: PayloadAction<{ missionId: number; entries: TerrainProfiles }>
    ) {
      state.activeMissionId = payload.missionId;
      const mission = (state.missions[payload.missionId] ??= { profiles: {}, previews: {} });
      const changed = new Set<string>();
      for (const uuid of Object.keys(mission.profiles))
        if (!payload.entries[uuid]) delete mission.profiles[uuid];
      for (const [uuid, entry] of Object.entries(payload.entries)) {
        if (mission.profiles[uuid]?.fingerprint === entry.fingerprint) continue;
        mission.profiles[uuid] = entry;
        changed.add(uuid);
      }
      // A preview ends once the committed geometry catches up with it or moves past it.
      for (const [uuid, preview] of Object.entries(mission.previews)) {
        const committed = mission.profiles[uuid];
        if (committed?.fingerprint === preview.fingerprint) {
          if (committed.status !== "ready" && preview.status === "ready") {
            committed.profile = preview.profile;
            committed.status = "ready";
            committed.error = null;
          }
          delete mission.previews[uuid];
        } else if (!committed || changed.has(uuid)) {
          delete mission.previews[uuid];
        }
      }
    },
    terrainProfileReceived(
      state,
      {
        payload,
      }: PayloadAction<{
        missionId: number;
        uuid: string;
        fingerprint: string;
        profile: TerrainProfile | null;
        error: string | null;
      }>
    ) {
      const entry = state.missions[payload.missionId]?.profiles[payload.uuid];
      if (entry?.fingerprint !== payload.fingerprint) return;
      entry.profile = payload.profile;
      entry.error = payload.error;
      entry.status = payload.error ? "error" : "ready";
    },
    setTerrainPreview(
      state,
      { payload }: PayloadAction<{ missionId: number; uuid: string; entry: TerrainProfileEntry }>
    ) {
      const mission = (state.missions[payload.missionId] ??= { profiles: {}, previews: {} });
      mission.previews[payload.uuid] = payload.entry;
    },
    clearTerrainPreview(state, { payload }: PayloadAction<{ missionId: number; uuid: string }>) {
      const mission = state.missions[payload.missionId];
      if (mission) delete mission.previews[payload.uuid];
    },
    removeMissionTerrain(state, { payload }: PayloadAction<number>) {
      delete state.missions[payload];
      if (state.activeMissionId === payload) state.activeMissionId = null;
    },
  },
});
export const {
  reconcileTerrainProfiles,
  terrainProfileReceived,
  setTerrainPreview,
  clearTerrainPreview,
  removeMissionTerrain,
} = terrainProfilesSlice.actions;
