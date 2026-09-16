import { getMissionDocHandle } from "client/automergeDocHandles";
import {
  getElevationProfile,
  getElevationSinglePoint,
  getTerrainProfile,
  normalizeTerrainProfile,
} from "http-client/terrainProfile";
import { insertElevationPending, removeElevationPending } from "store/interface";

import appCreateAsyncThunk from "./thunkUtil";

/** Fetch an elevation for either a single point or a multi-segment path. */
export const thunkFetchElevation = appCreateAsyncThunk<
  { path: AEGISPoint[]; pathSegmentDistances: number[]; uuid: string },
  number | number[][],
  false
>("getElevation", async ({ path, pathSegmentDistances, uuid }, { dispatch, rejectWithValue }) => {
  const mission = getMissionDocHandle()?.doc();
  if (!mission) return rejectWithValue(false);
  if (!mission.demFilePath) throw new Error("No DEM file path found");

  dispatch(insertElevationPending(uuid));
  try {
    const response =
      path.length === 1
        ? await getElevationSinglePoint({ missionId: mission.id, point: path[0] })
        : await getElevationProfile({ missionId: mission.id, path, pathSegmentDistances });
    if (response.status !== "success") throw new Error("API elevation returned failure");
    return response.data;
  } finally {
    dispatch(removeElevationPending(uuid));
  }
});

export const thunkFetchTerrainProfile = appCreateAsyncThunk<
  { path: AEGISPoint[]; pathSegmentDistances: number[]; uuid: string },
  TerrainProfile,
  false
>(
  "getTerrainProfile",
  async ({ path, pathSegmentDistances, uuid }, { dispatch, rejectWithValue }) => {
    const mission = getMissionDocHandle()?.doc();
    if (!mission?.demFilePath) return rejectWithValue(false);

    dispatch(insertElevationPending(uuid));
    try {
      const response = await getTerrainProfile({
        missionId: mission.id,
        path,
        pathSegmentDistances,
        entityKey: uuid,
      });
      if (response.status !== "success") throw new Error("API terrain profile returned failure");
      const profile = normalizeTerrainProfile(response.data, path, pathSegmentDistances);
      if (!profile) throw new Error("API terrain profile returned misaligned data");
      return profile;
    } finally {
      dispatch(removeElevationPending(uuid));
    }
  }
);
