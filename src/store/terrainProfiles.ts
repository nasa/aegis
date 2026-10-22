import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export const initialState: TerrainProfilesState = { activeMissionId: null, missions: {} };
export const terrainFingerprint = (
  mission: Pick<Mission, "id" | "demFilePath" | "demResolution">,
  path: AEGISPoint[],
  distances: number[]
): string =>
  JSON.stringify([mission.id, mission.demFilePath, mission.demResolution, path, distances]);

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
      for (const uuid of Object.keys(mission.profiles)) {
        if (!payload.entries[uuid]) {
          delete mission.profiles[uuid];
          delete mission.previews[uuid];
        }
      }
      for (const uuid of Object.keys(mission.previews))
        if (!payload.entries[uuid]) delete mission.previews[uuid];
      for (const [uuid, entry] of Object.entries(payload.entries)) {
        if (mission.profiles[uuid]?.fingerprint !== entry.fingerprint)
          mission.profiles[uuid] = entry;
      }
    },
    terrainProfileLoading(
      state,
      { payload }: PayloadAction<{ missionId: number; uuid: string; fingerprint: string }>
    ) {
      const entry = state.missions[payload.missionId]?.profiles[payload.uuid];
      if (entry?.fingerprint === payload.fingerprint) {
        entry.status = "loading";
        entry.error = null;
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
  terrainProfileLoading,
  terrainProfileReceived,
  setTerrainPreview,
  clearTerrainPreview,
  removeMissionTerrain,
} = terrainProfilesSlice.actions;
