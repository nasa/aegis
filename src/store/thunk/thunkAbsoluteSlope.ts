import { getMissionDocHandle } from "client/automergeDocHandles";
import { getAbsoluteSlopeProfile } from "http-client/absoluteSlope";

import appCreateAsyncThunk from "./thunkUtil";

export const thunkFetchAbsoluteSlope = appCreateAsyncThunk<
  { path: AEGISPoint[]; pathSegmentDistances: number[] },
  (number | null)[][] | null,
  false
>("getAbsoluteSlope", async ({ path, pathSegmentDistances }, { rejectWithValue }) => {
  const mission = getMissionDocHandle()?.doc();
  if (!mission) return rejectWithValue(false);
  if (!mission.absoluteSlopeFilePath) return null;

  const response = await getAbsoluteSlopeProfile(mission.id, path, pathSegmentDistances);
  if (response.status !== "success") throw new Error("API absolute slope returned failure");
  return response.data;
});
