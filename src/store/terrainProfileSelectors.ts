import store from "store";

/** Read the active mission's committed profiles at the export event boundary. */
export function getTerrainProfiles(): TerrainProfiles {
  const state = store.getState().terrainProfiles;
  return state.missions[state.activeMissionId]?.profiles ?? {};
}
