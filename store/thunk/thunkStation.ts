import appCreateAsyncThunk from "./thunkUtil";
import { updateWalkbackPath, upsertStation } from "store/station";
import { getDistanceBetweenTwoCoordinates, getTotalDistance } from "utils/geoMath";
import { thunkGetElevation } from "./thunkElevation";
import _ from "lodash";
import { thunkUpdateAllTraversesForEVASequence } from "./thunkTraverse";

export const thunkUpdateStationLocation = appCreateAsyncThunk<{
  location: AEGISPoint;
  stationUuid: string;
}>("updateStationLocation", async ({ location, stationUuid }, { dispatch, getState }) => {
  const elevation = await dispatch(
    thunkGetElevation({
      path: [location],
      pathSegmentDistances: [0],
      uuid: stationUuid,
    })
  );

  const station = getState().station.stations.find((s) => s.uuid === stationUuid);
  if (elevation.payload === false) {
    //gracefully reject?
  } else {
    //upsert location and elevation
    dispatch(upsertStation({ ...station, location, elevation: elevation.payload as number }));
  }

  //update walkback path, elevation, and snap to new location
  dispatch(thunkFullUpdateWalkbackPath({ path: station.walkbackPath, stationUuid }));

  //find all EVAs this station is in and update those traverses connecting to it
  for (const eva of getState().eva.evas) {
    if (eva.sequence.some((seqItem) => seqItem.uuid === stationUuid)) {
      await dispatch(thunkUpdateAllTraversesForEVASequence({ evaSequence: eva.sequence }));
    }
  }
});

/**
 * Only updates walkback path and distances
 * This is used on polyline edit drag,
 */
export const thunkUpdateWalkbackPath = appCreateAsyncThunk<{
  path: AEGISPoint[];
  stationUuid: string;
}>("updateWalkbackPath", async ({ path, stationUuid }, { dispatch, getState }) => {
  //calculate path distances
  const pathSegmentDistances: number[] = [];
  for (let i = 1; i < path.length; i++) {
    pathSegmentDistances.push(
      getTotalDistance(
        [path[i - 1], path[i]],
        parseFloat(getState().mission.mission.config.msv.radius.minor)
      )
    );
  }
  //save walkback
  dispatch(
    updateWalkbackPath({
      uuid: stationUuid,
      walkbackPath: path,
      walkbackPathSegmentDistances: pathSegmentDistances,
      walkbackPathSegmentElevations: null,
    })
  );
});

/**
 * Updates the walkback path, distances, elevation, and
 *  snaps ends to surrounding stations
 * This is used on polyline edit drag-end.
 *
 * Returns the path (could be updated if we had to snap endpoints)
 *  or false if the thunk rejects
 */
export const thunkFullUpdateWalkbackPath = appCreateAsyncThunk<
  {
    path: AEGISPoint[];
    stationUuid: string;
  },
  AEGISPoint[],
  false
>("fullUpdateWalkbackPath", async ({ path, stationUuid }, { dispatch, getState }) => {
  //calculate path distances
  const pathSegmentDistances: number[] = [];
  const radius = parseFloat(getState().mission.mission.config.msv.radius.minor);
  if (path && path.length > 0) {
    for (let i = 1; i < path.length; i++) {
      pathSegmentDistances.push(getTotalDistance([path[i - 1], path[i]], radius));
    }
  } else {
    const station = getState().station.stations.find((s) => s.uuid === stationUuid);
    path = [station.location, getState().mission.mission.landerLocation];
    pathSegmentDistances.push(getDistanceBetweenTwoCoordinates(path[0], path[1], radius));
  }

  //make a copy
  const newPath = _.cloneDeep(path);
  const newPathSegmentDistances = _.cloneDeep(pathSegmentDistances);
  let newElevationProfile = null;

  const station = getState().station.stations.find((s) => s.uuid === stationUuid);
  const landerLocation = getState().mission.mission.landerLocation;

  //set starting station
  if (station && !_.isEqual(path.at(0), station.location)) {
    const newDistance = getDistanceBetweenTwoCoordinates(
      station.location,
      path[1],
      parseFloat(getState().mission.mission.config.msv.radius.minor)
    );
    newPath[0] = station.location;
    newPathSegmentDistances[0] = newDistance;
  }

  //set ending lander
  if (landerLocation && !_.isEqual(path.at(-1), landerLocation)) {
    const newDistance = getDistanceBetweenTwoCoordinates(
      path[path.length - 2],
      landerLocation,
      parseFloat(getState().mission.mission.config.msv.radius.minor)
    );
    newPath[newPath.length - 1] = landerLocation;
    newPathSegmentDistances[newPathSegmentDistances.length - 1] = newDistance;
  }

  //get elevation traverse
  const elevationResponse = await dispatch(
    thunkGetElevation({
      path: newPath,
      pathSegmentDistances: newPathSegmentDistances,
      uuid: stationUuid,
    })
  );

  if (elevationResponse.payload !== false) {
    newElevationProfile = elevationResponse.payload as number[][];
  }

  //save walkback
  dispatch(
    updateWalkbackPath({
      uuid: stationUuid,
      walkbackPath: newPath,
      walkbackPathSegmentDistances: newPathSegmentDistances,
      walkbackPathSegmentElevations: newElevationProfile,
    })
  );

  return newPath;
});

/**
 * Reset the start and end points of walkback to station and lander
 */
export const thunkResetWalkback = appCreateAsyncThunk<{
  stationUuid: string;
}>("resetWalkback", async ({ stationUuid }, { dispatch, getState }) => {
  const station = getState().station.stations.find((station) => station.uuid === stationUuid);
  const landerLocation = getState().mission.mission.landerLocation;

  const newPath = [station.location, landerLocation];

  //get new distances
  const newPathSegmentDistances = [
    getDistanceBetweenTwoCoordinates(
      newPath[0],
      newPath[1],
      parseFloat(getState().mission.mission.config.msv.radius.minor)
    ),
  ];

  //get elevation
  let elevation = null;
  const elevationResponse = await dispatch(
    thunkGetElevation({
      path: newPath,
      pathSegmentDistances: newPathSegmentDistances,
      uuid: stationUuid,
    })
  );
  if (elevationResponse.payload !== false) {
    elevation = elevationResponse.payload as number[][];
  }

  //update store
  dispatch(
    upsertStation({
      ...station,
      walkbackPath: newPath,
      walkbackPathSegmentDistances: newPathSegmentDistances,
      walkbackPathSegmentElevations: elevation,
    })
  );
});
