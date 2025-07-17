import appCreateAsyncThunk from "./thunkUtil";
import { thunkGetElevation } from "./thunkElevation";
import { getTotalDistance } from "utils/geoMath";
import { removeMeasurement, setSelectedMeasurementUuid, upsertMeasurement } from "store/measure";
import { v4 as uuidv4 } from "uuid";
import { updateMapDirective } from "store/map";
import { thunkClearAllMapSelections } from "./crossThunk";
import { getAccurateNow } from "utils/formatting";

export const thunkUpdateMeasurementPath = appCreateAsyncThunk<
  {
    measurementUuid: string;
    path: AEGISPoint[];
  },
  void,
  false
>("updateMeasurementPath", async ({ path, measurementUuid }, { dispatch, getState }) => {
  const measurement = getState().measure.measurements.find((t) => t.uuid === measurementUuid);

  //calculate new path distances
  const pathSegmentDistances: number[] = [];
  for (let i = 1; i < path.length; i++) {
    pathSegmentDistances.push(
      getTotalDistance([path[i - 1], path[i]], getState().mission.mission.planetRadius)
    );
  }

  //get elevation of path
  const elevationResponse = await dispatch(
    thunkGetElevation({
      path,
      pathSegmentDistances: pathSegmentDistances,
      uuid: measurementUuid,
    })
  );

  /**
   * The response from thunkGetElevation is a PayloadAction.
   *  get the value by using .payload which will be either the return value
   *  or false if the thunk was un-fullfilled.
   */
  let newElevationProfile = null;
  if (elevationResponse && elevationResponse.payload !== false) {
    //good response from the thunk, cast as our number type
    newElevationProfile = elevationResponse.payload as number[][];
  }

  const newMeasurement: Measurement = {
    ...measurement,
    path,
    pathSegmentDistances: pathSegmentDistances,
    pathSegmentElevations: newElevationProfile,
  };

  //update the store
  dispatch(upsertMeasurement(newMeasurement));
});

export const thunkAddNewMeasurement = appCreateAsyncThunk<void>(
  "addNewMeasurement",
  async (__, { dispatch, getState }) => {
    const mission = getState().mission.mission;
    const measurementUuid = uuidv4();
    const path: AEGISPoint[] = getState().map.measureInitialCoords;
    const distance = getTotalDistance(path, mission.planetRadius);

    //get elevation traverse
    const elevationResponse = await dispatch(
      thunkGetElevation({
        path,
        pathSegmentDistances: [distance],
        uuid: measurementUuid,
      })
    );

    /**
     * The response from thunkGetElevation is a PayloadAction.
     *  get the value by using .payload which will be either the return value
     *  or false if the thunk was un-fullfilled.
     */
    let newElevationProfile = null;
    if (elevationResponse && elevationResponse.payload !== false) {
      //good response from the thunk, cast as our number type
      newElevationProfile = elevationResponse.payload as number[][];
    }

    // random rgb color
    const color = `rgb(${Math.floor(Math.random() * 255)}, ${Math.floor(
      Math.random() * 255
    )}, ${Math.floor(Math.random() * 255)})`;

    const newMeasurement: Measurement = {
      uuid: measurementUuid,
      createdAt: getAccurateNow().toISOString(),
      color,
      path,
      pathSegmentDistances: [distance],
      pathSegmentElevations: newElevationProfile,
    };
    dispatch(thunkClearAllMapSelections());
    dispatch(upsertMeasurement(newMeasurement));
    dispatch(setSelectedMeasurementUuid(measurementUuid));
  }
);

export const thunkRemoveMeasurement = appCreateAsyncThunk<
  {
    measurementUuid: string;
  },
  void,
  false
>("removeMeasurement", async ({ measurementUuid }, { dispatch, getState }) => {
  //if we are in the middle of editing, cancel the edit
  if (getState().map.mapDirective?.uuid === measurementUuid) {
    dispatch(
      updateMapDirective({
        uuid: measurementUuid,
        mapItemType: "measurement",
        mapAction: "saveEditPolyline",
      })
    );
  }

  dispatch(setSelectedMeasurementUuid(null));
  dispatch(removeMeasurement(measurementUuid));
});
