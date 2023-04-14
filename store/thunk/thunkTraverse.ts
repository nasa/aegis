import _ from "lodash";
import { updateTraversePath, upsertTraverse } from "store/traverse";
import { getDistanceBetweenTwoCoordinates, getTotalDistance } from "utils/geoMath";
import appCreateAsyncThunk from "./thunkUtil";
import { thunkGetElevation } from "./thunkElevation";

/**
 * Only updates traverse path and distances
 * This is used on polyline edit drag,
 */
export const thunkUpdateTraversePath = appCreateAsyncThunk<{
  path: AEGISPoint[];
  traverseUuid: string;
}>("updateTraversePath", async ({ path, traverseUuid }, { dispatch, getState }) => {
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
  //save traverse
  dispatch(
    updateTraversePath({
      uuid: traverseUuid,
      path: path,
      pathSegmentDistances: pathSegmentDistances,
      pathSegmentElevations: null,
    })
  );
});

/**
 * Updates the traverse path, distances, elevation, and
 *  snaps ends to surrounding stations
 * This is used on polyline edit drag-end.
 *
 * Opitonal to specify if the traverse name should also be updated
 * Optional to specify a specific eva sequence to pull the to/from end points
 *    if none is specified, the current selected EVA is used
 *
 * Returns the path (could be updated if we had to snap endpoints)
 *  or false if the thunk rejects
 */
export const thunkFullUpdateTraversePath = appCreateAsyncThunk<
  {
    path: AEGISPoint[];
    traverseUuid: string;
    rename?: boolean;
    evaSequence?: EvaSequenceItem[];
  },
  AEGISPoint[],
  false
>(
  "fullUpdateTraversePath",
  async ({ path, traverseUuid, rename, evaSequence }, { dispatch, getState }) => {
    //calculate path distances
    const pathSegmentDistances: number[] = [];
    if (path && path.length > 0) {
      for (let i = 1; i < path.length; i++) {
        pathSegmentDistances.push(
          getTotalDistance(
            [path[i - 1], path[i]],
            parseFloat(getState().mission.mission.config.msv.radius.minor)
          )
        );
      }
    } else {
      path = [getState().mission.mission.landerLocation, getState().mission.mission.landerLocation];
      pathSegmentDistances.push(0);
    }

    //make a copy
    const newPath = _.cloneDeep(path);
    const newPathSegmentDistances = _.cloneDeep(pathSegmentDistances);
    let newElevationProfile = null;

    // find the traverse and start/end stations
    let selectedEvaSequence = evaSequence;
    if (!selectedEvaSequence) {
      selectedEvaSequence = getState().eva.evas.find(
        (eva) => eva.uuid === getState().eva.selectedEvaUuid
      ).sequence;
    }

    let stationBefore: Station;
    let stationAfter: Station;
    selectedEvaSequence.forEach((item, index) => {
      if (item.type === "traverse" && item.uuid === traverseUuid) {
        const stationUuidBefore = selectedEvaSequence[index - 1].uuid;
        const stationUuidAfter = selectedEvaSequence[index + 1].uuid;
        stationBefore = getState().station.stations.find((s) => s.uuid === stationUuidBefore);
        stationAfter = getState().station.stations.find((s) => s.uuid === stationUuidAfter);
      }
    });

    //set starting station
    if (stationBefore.location && !_.isEqual(path.at(0), stationBefore.location)) {
      const newDistance = getDistanceBetweenTwoCoordinates(
        stationBefore.location,
        path[1],
        parseFloat(getState().mission.mission.config.msv.radius.minor)
      );
      newPath[0] = stationBefore.location;
      newPathSegmentDistances[0] = newDistance;
    }

    //set ending station
    if (stationAfter.location && !_.isEqual(path.at(-1), stationAfter.location)) {
      const newDistance = getDistanceBetweenTwoCoordinates(
        path[path.length - 2],
        stationAfter.location,
        parseFloat(getState().mission.mission.config.msv.radius.minor)
      );
      newPath[newPath.length - 1] = stationAfter.location;
      newPathSegmentDistances[newPathSegmentDistances.length - 1] = newDistance;
    }

    //get elevation traverse
    const elevationResponse = await dispatch(
      thunkGetElevation({
        path: newPath,
        pathSegmentDistances: newPathSegmentDistances,
        uuid: traverseUuid,
      })
    );

    /**
     * The response from thunkGetElevation is a PayloadAction.
     *  get the value by using .payload which will be either the return value
     *  or false if the thunk was un-fullfilled.
     */
    if (elevationResponse.payload !== false) {
      //good response from the thunk, cast as our number type
      newElevationProfile = elevationResponse.payload as number[][];
    }

    if (rename) {
      const newTraverseName = stationBefore.name + " to " + stationAfter.name;
      const selectedTraverse = getState().traverse.traverses.find((t) => t.uuid === traverseUuid);
      dispatch(
        upsertTraverse({
          ...selectedTraverse,
          name: newTraverseName,
          path: newPath,
          pathSegmentDistances: newPathSegmentDistances,
          pathSegmentElevations: newElevationProfile,
        })
      );
    } else {
      //save just traverse pathing info
      dispatch(
        updateTraversePath({
          uuid: traverseUuid,
          path: newPath,
          pathSegmentDistances: newPathSegmentDistances,
          pathSegmentElevations: newElevationProfile,
        })
      );
    }

    return newPath;
  }
);

/**
 * Reset the start and end points of the traverse to the station locations
 * on either side of the traverse
 */
export const thunkResetTraverse = appCreateAsyncThunk<{
  traverseUuid: string;
}>("resetTraverse", async ({ traverseUuid }, { dispatch, getState }) => {
  const selectedEva = getState().eva.evas.find(
    (eva) => eva.uuid === getState().eva.selectedEvaUuid
  );
  const selectedTraverse = getState().traverse.traverses.find(
    (traverse) => traverse.uuid === traverseUuid
  );

  //reset path to stations endpoints
  const sequenceIndex = selectedEva.sequence.findIndex(
    (sequenceItem) => sequenceItem.uuid === getState().eva.selectedEvaSequenceItemUuid
  );
  if (sequenceIndex < 1) return;
  const fromStation = getState().station.stations.find(
    (station) => station.uuid === selectedEva.sequence[sequenceIndex - 1].uuid
  );
  const toStation = getState().station.stations.find(
    (station) => station.uuid === selectedEva.sequence[sequenceIndex + 1].uuid
  );
  const newPath = [fromStation.location, toStation.location];

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
      uuid: traverseUuid,
    })
  );
  if (elevationResponse.payload !== false) {
    elevation = elevationResponse.payload as number[][];
  }

  //update store
  dispatch(
    upsertTraverse({
      ...selectedTraverse,
      path: newPath,
      pathSegmentDistances: newPathSegmentDistances,
      pathSegmentElevations: elevation,
    })
  );
});

/**
 * Update all traverses for an eva sequence
 * Reconnect ends, update names and elevations
 */
export const thunkUpdateAllTraversesForEVASequence = appCreateAsyncThunk<{
  evaSequence: EvaSequenceItem[];
}>("updateAllTraversesForEVA", async ({ evaSequence }, { dispatch, getState }) => {
  for (const sequenceItem of evaSequence) {
    if (sequenceItem.type === "traverse") {
      const thisTraverse = getState().traverse.traverses.find((t) => t.uuid === sequenceItem.uuid);
      const newTraversePath = [...thisTraverse.path];
      if (thisTraverse) {
        dispatch(
          thunkFullUpdateTraversePath({
            path: newTraversePath,
            traverseUuid: thisTraverse.uuid,
            rename: true,
            evaSequence: evaSequence,
          })
        );
      }
    }
  }
});
