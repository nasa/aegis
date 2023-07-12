import _ from "lodash";
import {
  setTraverseCalculatedFields,
  setTraverseEditMode,
  updateTraversePath,
  upsertTraverse,
  upsertTraverseFromDb,
} from "store/traverse";
import { calculateAscentAndDescent, getTotalDistance, calcPathDurationMins } from "utils/geoMath";
import appCreateAsyncThunk from "./thunkUtil";
import { thunkGetElevation } from "./thunkElevation";
import { upsertTraverse as traverseToDB } from "http-client/traverse";

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
      getTotalDistance([path[i - 1], path[i]], getState().mission.mission.planetRadius)
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
export const thunkFullUpdateTraverse = appCreateAsyncThunk<
  {
    path: AEGISPoint[];
    traverseUuid: string;
    rename?: boolean;
    evaSequence?: EvaSequenceItem[];
  },
  AEGISPoint[],
  false
>(
  "fullUpdateTraverse",
  async ({ path, traverseUuid, rename, evaSequence }, { dispatch, getState }) => {
    //make a copy
    const newPath =
      !path || path.length === 0
        ? [getState().mission.mission.landerLocation, getState().mission.mission.landerLocation]
        : _.cloneDeep(path);
    let newElevationProfile = null;

    // find the traverse and start/end stations to check endpoints
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
      newPath[0] = stationBefore.location;
    }
    //set ending station
    if (stationAfter.location && !_.isEqual(path.at(-1), stationAfter.location)) {
      newPath[newPath.length - 1] = stationAfter.location;
    }

    //calculate new path distances
    const pathSegmentDistances: number[] = [];
    for (let i = 1; i < newPath.length; i++) {
      pathSegmentDistances.push(
        getTotalDistance([newPath[i - 1], newPath[i]], getState().mission.mission.planetRadius)
      );
    }

    //get elevation traverse
    const elevationResponse = await dispatch(
      thunkGetElevation({
        path: newPath,
        pathSegmentDistances: pathSegmentDistances,
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
          pathSegmentDistances: pathSegmentDistances,
          pathSegmentElevations: newElevationProfile,
        })
      );
    } else {
      //save just traverse pathing info
      dispatch(
        updateTraversePath({
          uuid: traverseUuid,
          path: newPath,
          pathSegmentDistances: pathSegmentDistances,
          pathSegmentElevations: newElevationProfile,
        })
      );
    }

    return newPath;
  }
);

/**
 * Reset traverse to a single segment from start/end station locations
 */
export const thunkResetTraverse = appCreateAsyncThunk<{
  traverseUuid: string;
}>("resetTraverse", async ({ traverseUuid }, { dispatch, getState }) => {
  const selectedEva = getState().eva.evas.find(
    (eva) => eva.uuid === getState().eva.selectedEvaUuid
  );

  //reset path to a single segment with stations endpoints
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

  await dispatch(
    thunkFullUpdateTraverse({
      path: newPath,
      traverseUuid,
      rename: false,
      evaSequence: selectedEva.sequence,
    })
  );
});

/**
 * Update all traverses for an eva sequence
 * Reconnect ends, update names and elevations
 */
export const thunkUpdateAllTraversesForEVA = appCreateAsyncThunk<{
  evaSequence: EvaSequenceItem[];
}>("updateAllTraversesForEVA", async ({ evaSequence }, { dispatch, getState }) => {
  for (const sequenceItem of evaSequence) {
    if (sequenceItem.type === "traverse") {
      const thisTraverse = getState().traverse.traverses.find((t) => t.uuid === sequenceItem.uuid);
      const newTraversePath = [...thisTraverse.path];
      if (thisTraverse) {
        await dispatch(
          thunkFullUpdateTraverse({
            path: newTraversePath,
            traverseUuid: thisTraverse.uuid,
            rename: true,
            evaSequence: evaSequence,
          })
        );
        dispatch(setTraverseEditMode({ uuid: thisTraverse.uuid, editMode: false }));
      }
    }
  }
});

/** Update traverse names surrounding a given station in a given EVA */
export const thunkUpdateTraverseNamesForStationInEVA = appCreateAsyncThunk<{
  evaSequence: EvaSequenceItem[];
  stationUUID: string;
}>(
  "updateTraverseNamesForStationInEVA",
  async ({ evaSequence, stationUUID }, { dispatch, getState }) => {
    for (const [index, sequenceItem] of evaSequence.entries()) {
      if (sequenceItem.type === "traverse") {
        const stationUuidBefore = evaSequence[index - 1].uuid;
        const stationUuidAfter = evaSequence[index + 1].uuid;
        if (stationUUID === stationUuidBefore || stationUUID === stationUuidAfter) {
          const stationBefore = getState().station.stations.find(
            (s) => s.uuid === stationUuidBefore
          );
          const stationAfter = getState().station.stations.find((s) => s.uuid === stationUuidAfter);
          const selectedTraverse = getState().traverse.traverses.find(
            (t) => t.uuid === sequenceItem.uuid
          );
          const newTraverse = {
            ...selectedTraverse,
            name: `${stationBefore.name} to ${stationAfter.name}`,
          };
          await traverseToDB(newTraverse);
          dispatch(upsertTraverse(newTraverse));
          dispatch(upsertTraverseFromDb(newTraverse));
        }
      }
    }
  }
);

export const thunkCreateTraverseCalculatedFields = appCreateAsyncThunk<void>(
  "createTraverseCalculatedFields",
  async (_, { dispatch, getState }) => {
    const traverses = getState().traverse.traverses;
    const missionTraverseRate = getState().mission.mission?.traverseSpeed;
    const allCalculatedFields: TraverseCalculatedFields[] = [];

    for (const traverse of traverses) {
      const newReportItems: ReportItem[] = [];

      // find the eva this traverse is used in
      const eva = getState().eva.evas.find((eva) => {
        return eva.sequence.find((sequenceItem) => {
          return sequenceItem.uuid === traverse.uuid;
        });
      });

      let traverseRate = missionTraverseRate;
      if (eva?.traverseRate) {
        traverseRate = eva?.traverseRate;
      }
      if (traverse.traverseRate) {
        traverseRate = traverse.traverseRate;
      }

      // get duration minutes
      const durationMinutes = calcPathDurationMins(traverse.pathSegmentDistances, traverseRate);

      // get distance meters
      const distanceMeters = traverse.pathSegmentDistances?.reduce(
        (accumulator, currentVal) => accumulator + currentVal,
        0
      );

      // total ascended and descended
      const ascentDescent = calculateAscentAndDescent(traverse.pathSegmentElevations);

      // check if calculated duration is greater than predicted durationLower
      if (traverse.predictedDurationLower > durationMinutes) {
        newReportItems.push({
          message: "Calculated traverse duration is under predicted nominal traverse time",
          type: "info",
        } as ReportItem);
      }

      // check if calculated duration is greater than predicted durationUpper
      if (traverse.predictedDurationUpper < durationMinutes) {
        newReportItems.push({
          message: "Calculated traverse duration is over predicted maximum traverse time",
          type: "error",
        } as ReportItem);
      }

      const newCalculatedFields: TraverseCalculatedFields = {
        uuid: traverse.uuid,
        reportItems: newReportItems,
        durationMinutes,
        distanceMeters,
        ascentDescent,
      };
      allCalculatedFields.push(newCalculatedFields);
    }
    dispatch(setTraverseCalculatedFields({ calculatedFields: allCalculatedFields }));
  }
);
