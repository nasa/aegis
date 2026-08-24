import { insertElevationPending, removeElevationPending } from "store/interface";
import appCreateAsyncThunk from "./thunkUtil";
import { getElevationProfile, getElevationSinglePoint } from "http-client/terrainProfile";
import { getMissionDocHandle } from "client/automergeDocHandles";

/**
 * Gets elevation fom API endpoint
 * also dispatches the elevationPending status for the uuid
 *
 * @Returns the new elevation (single point, or path array)
 *  returns false and throws error if the API errored
 */
export const thunkFetchElevation = appCreateAsyncThunk<
  {
    path: AEGISPoint[];
    pathSegmentDistances: number[];
    uuid: string;
  },
  number | number[][],
  false
>("getElevation", async ({ path, pathSegmentDistances, uuid }, { dispatch, rejectWithValue }) => {
  //get elevation for a single point or a path
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return rejectWithValue(false);
  const mission = missionDocHandle.doc();
  if (!mission.demFilePath) {
    throw new Error("No DEM file path found");
  }

  dispatch(insertElevationPending(uuid));

  // generate new elevation profile via api
  let newElevationProfile: WrappedResponse<number[][] | number>;
  if (path.length === 1) {
    newElevationProfile = await getElevationSinglePoint({
      missionId: mission.id,
      point: path[0],
    });
  } else {
    newElevationProfile = await getElevationProfile({
      missionId: mission.id,
      path,
      pathSegmentDistances,
    });
  }
  dispatch(removeElevationPending(uuid));

  if (newElevationProfile.status !== "success") {
    throw new Error("API elevation returned failure");
  }

  return newElevationProfile.data;
});
