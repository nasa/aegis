import { insertElevationPending, removeElevationPending } from "store/interface";
import appCreateAsyncThunk from "./thunkUtil";
import { getElevationProfile, getElevationSinglePoint } from "http-client/elevation";

/**
 * Gets elevation fom API endpoint
 * also dispatches the elevationPending status for the uuid
 *
 * Returns the new elevation (single point, or path array)
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
  //get elevation for a single point or a path
  const mission: Mission = getState().mission.mission;

  dispatch(insertElevationPending(uuid));
  const radius = parseFloat(mission.config.msv.radius.minor);
  const measureJson = mission.config.tools.find((tool) => tool.name === "Measure")?.variables;
  const demFilepath: string = measureJson["dem"];

  // generate new elevation profile via api
  let newElevationProfile: WrappedResponse<number[][] | number>;
  if (path.length === 1) {
    newElevationProfile = await getElevationSinglePoint(mission.id, demFilepath, path[0], radius);
  } else {
    const elevationResolutionMeters = measureJson["resolution"];
    newElevationProfile = await getElevationProfile(
      mission.id,
      demFilepath,
      path,
      pathSegmentDistances,
      elevationResolutionMeters || 10, // resolution in meters, default 10
      radius
    );
  }
  dispatch(removeElevationPending(uuid));

  if (newElevationProfile.status === "failure") {
    throw new Error("API elevation returned failure");
  }

  return newElevationProfile.data;
});
