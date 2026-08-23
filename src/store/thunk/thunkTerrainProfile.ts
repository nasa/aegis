import { getMissionDocHandle } from "client/automergeDocHandles";
import { getTerrainProfile } from "http-client/terrainProfile";
import { insertElevationPending, removeElevationPending } from "store/interface";
import { normalizeTerrainProfile, type CompleteTerrainProfile } from "utils/terrainProfile";

import appCreateAsyncThunk from "./thunkUtil";

export const thunkFetchTerrainProfile = appCreateAsyncThunk<
  { path: AEGISPoint[]; pathSegmentDistances: number[]; uuid: string },
  CompleteTerrainProfile,
  false
>(
  "getTerrainProfile",
  async ({ path, pathSegmentDistances, uuid }, { dispatch, rejectWithValue }) => {
    const mission = getMissionDocHandle()?.doc();
    if (!mission?.demFilePath) return rejectWithValue(false);

    dispatch(insertElevationPending(uuid));
    try {
      const response = await getTerrainProfile(mission.id, path, pathSegmentDistances, uuid);
      if (response.status !== "success") throw new Error("API terrain profile returned failure");
      const profile = normalizeTerrainProfile(response.data, path, pathSegmentDistances);
      if (!profile) throw new Error("API terrain profile returned misaligned data");
      return profile;
    } finally {
      dispatch(removeElevationPending(uuid));
    }
  }
);
