import appCreateAsyncThunk from "./thunkUtil";
import { thunkFetchAbsoluteSlope } from "./thunkAbsoluteSlope";
import { thunkFetchElevation } from "./thunkElevation";

type PathProfiles = {
  elevations: number[][] | null;
  absoluteSlopes: (number | null)[][] | null;
};

export const thunkFetchPathProfiles = appCreateAsyncThunk<
  { path: AEGISPoint[]; pathSegmentDistances: number[]; uuid: string },
  PathProfiles,
  false
>("getPathProfiles", async (args, { dispatch }) => {
  const [elevationResponse, slopeResponse] = await Promise.all([
    dispatch(thunkFetchElevation(args)),
    dispatch(
      thunkFetchAbsoluteSlope({
        path: args.path,
        pathSegmentDistances: args.pathSegmentDistances,
      })
    ),
  ]);

  return {
    elevations:
      elevationResponse.meta.requestStatus === "fulfilled"
        ? (elevationResponse.payload as number[][])
        : null,
    absoluteSlopes:
      slopeResponse.meta.requestStatus === "fulfilled"
        ? (slopeResponse.payload as (number | null)[][] | null)
        : null,
  };
});
