import appCreateAsyncThunk from "./thunkUtil";
import { thunkFetchTerrainProfile } from "./thunkTerrainProfile";
import { getSegmentBearing, getTotalDistance } from "utils/mapping/geoMath";
import { removeMeasurement, setSelectedMeasurementUuid, upsertMeasurement } from "store/measure";
import { v4 as uuidv4 } from "uuid";
import { updateMapDirective } from "store/map";
import { getAccurateNow } from "utils/formatting";
import { getMissionDocHandle } from "client/automergeDocHandles";
import type { CompleteTerrainProfile } from "utils/terrainProfile";

const profileMatchesSegmentCount = (
  profile: unknown[][] | null,
  segmentCount: number
): profile is unknown[][] =>
  profile?.length === segmentCount && profile.every((segment) => segment.length >= 2);

export const thunkUpdateMeasurementPath = appCreateAsyncThunk<
  {
    measurementUuid: string;
    path: AEGISPoint[];
  },
  void,
  false
>("updateMeasurementPath", async ({ path, measurementUuid }, { dispatch, getState }) => {
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();

  const measurement = getState().measure.measurements.find((t) => t.uuid === measurementUuid);
  if (!measurement) return;

  //calculate new path distances
  const pathSegmentDistances: number[] = [];
  for (let i = 1; i < path.length; i++) {
    pathSegmentDistances.push(getTotalDistance([path[i - 1], path[i]], mission.planetRadius));
  }

  const pathSegmentBearings: number[] = [];
  for (let i = 1; i < path.length; i++) {
    pathSegmentBearings.push(getSegmentBearing(path[i - 1], path[i], mission.usingLGRSCoordinates));
  }

  const pendingElevations = profileMatchesSegmentCount(
    measurement.pathSegmentElevations,
    pathSegmentDistances.length
  )
    ? measurement.pathSegmentElevations
    : null;
  const pendingAbsoluteSlopes =
    pendingElevations &&
    profileMatchesSegmentCount(
      measurement.pathSegmentAbsoluteSlopes,
      pathSegmentDistances.length
    ) &&
    measurement.pathSegmentAbsoluteSlopes.every(
      (segment, index) => segment.length === pendingElevations[index].length
    )
      ? measurement.pathSegmentAbsoluteSlopes
      : null;

  dispatch(
    upsertMeasurement({
      ...measurement,
      path,
      pathSegmentDistances,
      pathSegmentElevations: pendingElevations,
      pathSegmentAbsoluteSlopes: pendingAbsoluteSlopes,
      pathSegmentBearings,
    })
  );

  const profileResponse = await dispatch(
    thunkFetchTerrainProfile({
      path,
      pathSegmentDistances,
      uuid: measurementUuid,
    })
  );

  if (profileResponse.meta.requestStatus !== "fulfilled") return;

  const currentMeasurement = getState().measure.measurements.find(
    (item) => item.uuid === measurementUuid
  );
  if (!currentMeasurement) return;

  const profile = profileResponse.payload as CompleteTerrainProfile;
  const currentSegmentCount = currentMeasurement.pathSegmentDistances.length;
  if (
    !profileMatchesSegmentCount(profile.elevationsMeters, currentSegmentCount) ||
    !profileMatchesSegmentCount(profile.terrainSlopesDegrees, currentSegmentCount)
  )
    return;

  const newMeasurement: Measurement = {
    ...currentMeasurement,
    pathSegmentElevations: profile.elevationsMeters,
    pathSegmentAbsoluteSlopes: profile.terrainSlopesDegrees,
  };

  //update the store
  dispatch(upsertMeasurement(newMeasurement));
});

export const thunkAddNewMeasurement = appCreateAsyncThunk<void>(
  "addNewMeasurement",
  async (__, { dispatch, getState }) => {
    // Tear down any in-progress edit first. Otherwise the newly-created
    // measurement swaps the source feature out from under a live OL Modify
    // interaction, which freezes the map. Path edits persist live during drag,
    // so clearing here loses nothing.
    if (getState().map.mapDirective) {
      dispatch(updateMapDirective(null));
    }

    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    const mission = missionDocHandle.doc();

    const measurementUuid = uuidv4();
    let path: AEGISPoint[] = getState().map.measureInitialCoords;

    // Fallback: if measureInitialCoords is empty or invalid, create a default path near the lander
    if (!path || path.length < 2) {
      const lander = mission.landerLocation;
      if (lander?.lat != null && lander?.lng != null) {
        // Create a short fallback line near the lander in geographic degrees.
        // This path is only reachable if measureInitialCoords was never set
        // (defensive dead code — MeasurementLines always populates it first).
        const offset = 0.003;
        path = [
          { lat: lander.lat, lng: lander.lng - offset },
          { lat: lander.lat, lng: lander.lng + offset },
        ];
      } else {
        // Last resort: use a default position
        path = [
          { lat: 0, lng: -0.003 },
          { lat: 0, lng: 0.003 },
        ];
      }
    }

    const distance = getTotalDistance(path, mission.planetRadius);

    const profileResponse = await dispatch(
      thunkFetchTerrainProfile({
        path,
        pathSegmentDistances: [distance],
        uuid: measurementUuid,
      })
    );
    const profile =
      profileResponse.meta.requestStatus === "fulfilled"
        ? (profileResponse.payload as CompleteTerrainProfile)
        : null;

    const pathSegmentBearings: number[] = [];
    for (let i = 1; i < path.length; i++) {
      const bearing = getSegmentBearing(path[i - 1], path[i], mission.usingLGRSCoordinates);
      pathSegmentBearings.push(bearing);
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
      pathSegmentElevations: profile?.elevationsMeters ?? null,
      pathSegmentAbsoluteSlopes: profile?.terrainSlopesDegrees ?? null,
      pathSegmentBearings,
    };
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
