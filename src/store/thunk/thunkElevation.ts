import { insertElevationPending, removeElevationPending } from "store/interface";
import appCreateAsyncThunk from "./thunkUtil";
import { getElevationProfile, getElevationSinglePoint } from "http-client/elevation";

/**
 * Gets elevation fom API endpoint
 * also dispatches the elevationPending status for the uuid
 *
 * @Returns the new elevation (single point, or path array)
 *  returns false and throws error if the API errored
 */
export const thunkGetElevation = appCreateAsyncThunk<
  {
    path: AEGISPoint[];
    pathSegmentDistances: number[];
    uuid: string;
  },
  number | number[][],
  false
>("getElevation", async ({ path, pathSegmentDistances, uuid }, { dispatch, getState }) => {
  if (!getState().mission.mission.demFilePath) {
    throw new Error("No DEM file path found");
  }
  //get elevation for a single point or a path
  const mission: Mission = getState().mission.mission;

  dispatch(insertElevationPending(uuid));

  // generate new elevation profile via api
  let newElevationProfile: WrappedResponse<number[][] | number>;
  if (path.length === 1) {
    newElevationProfile = await getElevationSinglePoint(
      mission.id,
      mission.demFilePath,
      path[0],
      mission.planetRadius
    );
  } else {
    const elevationResolutionMeters = mission.demResolution || 10; // resolution in meters, default 10
    newElevationProfile = await getElevationProfile(
      mission.id,
      mission.demFilePath,
      path,
      pathSegmentDistances,
      elevationResolutionMeters,
      mission.planetRadius
    );
  }
  dispatch(removeElevationPending(uuid));

  if (newElevationProfile.status !== "success") {
    throw new Error("API elevation returned failure");
  }

  return newElevationProfile.data;
});
