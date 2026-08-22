import { v4 as uuidv4 } from "uuid";

import { getMissionDocHandle } from "client/automergeDocHandles";
import {
  removeMeasurement,
  setSelectedMeasurementUuid,
  updateMeasurementGeometry,
  upsertMeasurement,
} from "store/measure";
import { updateMapDirective } from "store/map";
import { getAccurateNow } from "utils/formatting";
import { getSegmentBearing, getTotalDistance } from "utils/mapping/geoMath";
import {
  cancelMeasurementElevation,
  scheduleMeasurementElevation,
} from "./measurementElevationScheduler";
import appCreateAsyncThunk from "./thunkUtil";

const calculateGeometry = (path: AEGISPoint[], mission: Mission) => {
  const pathSegmentDistances: number[] = [];
  const pathSegmentBearings: number[] = [];
  for (let index = 1; index < path.length; index += 1) {
    pathSegmentDistances.push(
      getTotalDistance([path[index - 1], path[index]], mission.planetRadius)
    );
    pathSegmentBearings.push(
      getSegmentBearing(path[index - 1], path[index], mission.usingLGRSCoordinates)
    );
  }
  return { pathSegmentDistances, pathSegmentBearings };
};

export const thunkUpdateMeasurementPath = appCreateAsyncThunk<
  { measurementUuid: string; path: AEGISPoint[]; final?: boolean },
  void,
  false
>(
  "updateMeasurementPath",
  async ({ path, measurementUuid, final = false }, { dispatch, getState }) => {
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    if (
      !getState().measure.measurements.some((measurement) => measurement.uuid === measurementUuid)
    ) {
      return;
    }
    const geometry = calculateGeometry(path, missionDocHandle.doc());
    dispatch(updateMeasurementGeometry({ measurementUuid, path, ...geometry }));
    scheduleMeasurementElevation(
      dispatch,
      measurementUuid,
      path,
      geometry.pathSegmentDistances,
      final
    );
  }
);

export const thunkAddNewMeasurement = appCreateAsyncThunk<void>(
  "addNewMeasurement",
  async (__, { dispatch, getState }) => {
    if (getState().map.mapDirective) dispatch(updateMapDirective(null));
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    const mission = missionDocHandle.doc();
    const measurementUuid = uuidv4();
    let path: AEGISPoint[] = getState().map.measureInitialCoords;

    if (!path || path.length < 2) {
      const lander = mission.landerLocation;
      path =
        lander?.lat != null && lander?.lng != null
          ? [
              { lat: lander.lat, lng: lander.lng - 0.003 },
              { lat: lander.lat, lng: lander.lng + 0.003 },
            ]
          : [
              { lat: 0, lng: -0.003 },
              { lat: 0, lng: 0.003 },
            ];
    }

    const geometry = calculateGeometry(path, mission);
    const newMeasurement: Measurement = {
      uuid: measurementUuid,
      createdAt: getAccurateNow().toISOString(),
      color: `rgb(${Math.floor(Math.random() * 255)}, ${Math.floor(
        Math.random() * 255
      )}, ${Math.floor(Math.random() * 255)})`,
      path,
      pathSegmentDistances: geometry.pathSegmentDistances,
      pathSegmentElevations: null,
      pathSegmentBearings: geometry.pathSegmentBearings,
    };
    dispatch(upsertMeasurement(newMeasurement));
    dispatch(setSelectedMeasurementUuid(measurementUuid));
    scheduleMeasurementElevation(
      dispatch,
      measurementUuid,
      path,
      geometry.pathSegmentDistances,
      true
    );
  }
);

export const thunkRemoveMeasurement = appCreateAsyncThunk<{ measurementUuid: string }, void, false>(
  "removeMeasurement",
  async ({ measurementUuid }, { dispatch, getState }) => {
    cancelMeasurementElevation(measurementUuid);
    if (getState().map.mapDirective?.uuid === measurementUuid) dispatch(updateMapDirective(null));
    dispatch(setSelectedMeasurementUuid(null));
    dispatch(removeMeasurement(measurementUuid));
  }
);
