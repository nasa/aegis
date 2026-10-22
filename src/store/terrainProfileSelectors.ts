import store from "store";

/** Read the active mission's profiles at the export event boundary. */
export function getTerrainProfiles(): TerrainProfiles {
  const state = store.getState().terrainProfiles;
  const mission = state.missions[state.activeMissionId];
  return mission ? { ...mission.profiles, ...mission.previews } : {};
}
