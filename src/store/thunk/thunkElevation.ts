import { insertElevationPending, removeElevationPending } from "store/interface";
import appCreateAsyncThunk from "./thunkUtil";
import { getElevationProfile, getElevationSinglePoint } from "http-client/elevation";
import { getMissionDocHandle } from "client/automergeDocHandles";
import { ElevationClientError } from "http-client/elevation";

export type ElevationThunkError = {
  message: string;
  code?: ElevationErrorCode;
  retryAfterMs?: number;
  aborted?: boolean;
};

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
    streamId?: string;
    generation?: number;
    signal?: AbortSignal;
    trackGlobalPending?: boolean;
  },
  number | number[][],
  ElevationThunkError | false
>(
  "getElevation",
  async (
    { path, pathSegmentDistances, uuid, streamId, generation, signal, trackGlobalPending = true },
    { dispatch, rejectWithValue, requestId }
  ) => {
    //get elevation for a single point or a path
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return rejectWithValue(false);
    const mission = missionDocHandle.doc();
    if (!mission.demFilePath) {
      throw new Error("No DEM file path found");
    }

    if (trackGlobalPending) dispatch(insertElevationPending({ uuid, requestId }));

    try {
      let newElevationProfile: WrappedResponse<number[][] | number>;
      if (path.length === 1) {
        newElevationProfile = await getElevationSinglePoint(
          mission.id,
          mission.demFilePath,
          path[0],
          mission.planetRadius,
          { signal }
        );
      } else {
        const elevationResolutionMeters = mission.demResolution || 10;
        newElevationProfile = await getElevationProfile(
          mission.id,
          mission.demFilePath,
          path,
          pathSegmentDistances,
          elevationResolutionMeters,
          mission.planetRadius,
          { signal, streamId, generation }
        );
      }

      if (newElevationProfile.status !== "success") {
        throw new Error("API elevation returned failure");
      }
      return newElevationProfile.data;
    } catch (error) {
      if (error instanceof ElevationClientError) {
        return rejectWithValue({
          message: error.message,
          code: error.code,
          retryAfterMs: error.retryAfterMs,
        });
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        return rejectWithValue({ message: "Elevation request aborted", aborted: true });
      }
      throw error;
    } finally {
      if (trackGlobalPending) dispatch(removeElevationPending({ uuid, requestId }));
    }
  }
);
