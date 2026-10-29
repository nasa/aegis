import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { setAllSliceStores } from "store/crossActions";

export const initialState: TerrainProfilesState = { profiles: {}, previews: {} };
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

/** Build entries for current geometry, preserving profiles that are already loaded. */
export function buildTerrainProfiles(
  mission: Mission,
  previous: TerrainProfiles = {}
): TerrainProfiles {
  const entries: TerrainProfiles = {};
  const add = (uuid: string, path: AEGISPoint[], distances: number[]) => {
    if (
      !mission.demFilePath ||
      !path ||
      path.length < 2 ||
      !distances ||
      distances.length !== path.length - 1
    )
      return;
    const fingerprint = terrainFingerprint(mission, path, distances);
    entries[uuid] =
      previous[uuid]?.fingerprint === fingerprint
        ? previous[uuid]
        : {
            fingerprint,
            path: JSON.parse(JSON.stringify(path)),
            distances: [...distances],
            status: "idle",
            profile: null,
            error: null,
          };
  };
  for (const traverse of Object.values(mission.traverses ?? {}))
    add(traverse.uuid, traverse.path, traverse.pathSegmentDistances);
  for (const station of Object.values(mission.stations ?? {}))
    add(station.uuid, station.walkbackPath, station.walkbackPathSegmentDistances);
  return entries;
}

export const terrainProfilesSlice = createSlice({
  name: "terrainProfiles",
  initialState,
  reducers: {
    reconcileTerrainProfiles(state, { payload: entries }: PayloadAction<TerrainProfiles>) {
      const changed = new Set<string>();
      for (const uuid of Object.keys(state.profiles))
        if (!entries[uuid]) delete state.profiles[uuid];
      for (const [uuid, entry] of Object.entries(entries)) {
        if (state.profiles[uuid]?.fingerprint === entry.fingerprint) continue;
        state.profiles[uuid] = entry;
        changed.add(uuid);
      }
      // A preview ends once the committed geometry catches up with it or moves past it.
      for (const [uuid, preview] of Object.entries(state.previews)) {
        const committed = state.profiles[uuid];
        if (committed?.fingerprint === preview.fingerprint) {
          if (committed.status !== "ready" && preview.status === "ready") {
            committed.profile = preview.profile;
            committed.status = "ready";
            committed.error = null;
          }
          delete state.previews[uuid];
        } else if (!committed || changed.has(uuid)) {
          delete state.previews[uuid];
        }
      }
    },
    terrainProfileReceived(
      state,
      {
        payload,
      }: PayloadAction<{
        uuid: string;
        fingerprint: string;
        profile: TerrainProfile | null;
        error: string | null;
        retryable: boolean;
      }>
    ) {
      const entry = state.profiles[payload.uuid];
      if (entry?.fingerprint !== payload.fingerprint) return;
      entry.profile = payload.profile;
      entry.error = payload.error;
      entry.retryable = payload.retryable;
      entry.status = payload.error ? "error" : "ready";
    },
    setTerrainPreview(
      state,
      { payload }: PayloadAction<{ uuid: string; entry: TerrainProfileEntry }>
    ) {
      state.previews[payload.uuid] = payload.entry;
    },
    clearTerrainPreview(state, { payload }: PayloadAction<{ uuid: string }>) {
      delete state.previews[payload.uuid];
    },
    obliterateState: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(setAllSliceStores, (_state, { payload }) => payload.terrainProfiles);
  },
});
export const {
  reconcileTerrainProfiles,
  terrainProfileReceived,
  setTerrainPreview,
  clearTerrainPreview,
  obliterateState,
} = terrainProfilesSlice.actions;
