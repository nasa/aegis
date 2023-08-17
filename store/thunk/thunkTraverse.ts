import _ from "lodash";
import {
  setTraverseCalculatedFields,
  setTraverseEditMode,
  upsertTraverse,
  upsertTraverseFromDb,
} from "store/traverse";
import { calculateAscentAndDescent, getTotalDistance, calcPathDurationMins } from "utils/geoMath";
import appCreateAsyncThunk from "./thunkUtil";
import { thunkGetElevation } from "./thunkElevation";
import * as httpClient_Traverse from "http-client/traverse";
import { roundDateToSecond } from "utils/formatting";

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
  const traverse = getState().traverse.traverses.find((t) => t.uuid === traverseUuid);
  dispatch(
    upsertTraverse({
      ...traverse,
      path: path,
      pathSegmentDistances: pathSegmentDistances,
      pathSegmentElevations: null,
    })
  );
});

/**
 * Updates the traverse path, distances, elevation, and
 *  snaps ends to surrounding stations
 * This is used on polyline edit drag-end among other areas
 *
 * Optional provide a custom new path to use instead of the traverse's current path.
 * Opitonal to specify if the traverse name should also be updated
 * Optional to specify a specific eva sequence to pull the to/from end points
 *    if none is specified, the current selected EVA is used
 *
 * Returns the path (could be updated if we had to snap endpoints)
 *  or false if the thunk rejects
 */
export const thunkFullUpdateTraverse = appCreateAsyncThunk<
  {
    traverseUuid: string;
    path?: AEGISPoint[];
    rename?: boolean;
    evaSequence?: EvaSequenceItem[];
    saveToDb?: boolean;
  },
  AEGISPoint[],
  false
>(
  "fullUpdateTraverse",
  async (
    { path, traverseUuid, rename = false, evaSequence, saveToDb = false },
    { dispatch, getState }
  ) => {
    const traverse = getState().traverse.traverses.find((t) => t.uuid === traverseUuid);

    //make a copy
    let newPath: AEGISPoint[];
    if (path && path.length > 0) {
      newPath = _.cloneDeep(path);
    } else {
      //use traverse path
      if (traverse.path && traverse.path.length > 0) {
        newPath = _.cloneDeep(traverse.path);
      } else {
        newPath = [
          getState().mission.mission.landerLocation,
          getState().mission.mission.landerLocation,
        ];
      }
    }
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
    if (stationBefore.location && !_.isEqual(newPath.at(0), stationBefore.location)) {
      newPath[0] = stationBefore.location;
    }
    //set ending station
    if (stationAfter.location && !_.isEqual(newPath.at(-1), stationAfter.location)) {
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

    const newTraverse: Traverse = {
      ...traverse,
      name: rename ? stationBefore.name + " to " + stationAfter.name : traverse.name,
      path: newPath,
      pathSegmentDistances: pathSegmentDistances,
      pathSegmentElevations: newElevationProfile,
      updatedAt: roundDateToSecond(new Date()).toISOString(),
    };
    if (saveToDb) {
      httpClient_Traverse.upsertTraverse(newTraverse);
      dispatch(setTraverseEditMode({ uuid: newTraverse.uuid, editMode: false }));
      dispatch(upsertTraverseFromDb(newTraverse));
    }
    //update the store
    dispatch(upsertTraverse(newTraverse, true));

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
 * Full update for traverses attached to a given station.
 * Save to DB.
 * Optional: only update for a single EVA, or if none is provided update all EVAs
 */
export const thunkUpdateTraversesAroundStation = appCreateAsyncThunk<{
  stationUuid: string;
  evaUuid?: string;
  saveToDb?: boolean;
}>(
  "updateTraversesAroundStation",
  async ({ stationUuid, evaUuid, saveToDb = false }, { dispatch, getState }) => {
    //get evas to update
    const evas = evaUuid
      ? [getState().eva.evas.find((e) => e.uuid === evaUuid)]
      : getState().eva.evas;
    for (const eva of evas) {
      for (let i = 0; i < eva.sequence.length; i++) {
        if (eva.sequence[i].uuid === stationUuid) {
          //get traverse before
          if (i > 0) {
            const traverseBefore = getState().traverse.traverses.find(
              (t) => t.uuid === eva.sequence[i - 1].uuid
            );
            //update traverse in store
            await dispatch(
              thunkFullUpdateTraverse({
                traverseUuid: traverseBefore.uuid,
                rename: true,
                evaSequence: eva.sequence,
                saveToDb,
              })
            );
          }
          //get traverse after
          if (i < eva.sequence.length - 1) {
            const traverseAfter = getState().traverse.traverses.find(
              (t) => t.uuid === eva.sequence[i + 1].uuid
            );
            //update traverse in store
            await dispatch(
              thunkFullUpdateTraverse({
                traverseUuid: traverseAfter.uuid,
                rename: true,
                evaSequence: eva.sequence,
                saveToDb,
              })
            );
          }
          break;
        }
      }
    }
  }
);

/**
 * Update traverse names surrounding a given station in a given EVA
 * Saves to store, fromDb store, and database
 **/
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
            updatedAt: roundDateToSecond(new Date()).toISOString(),
          };
          await httpClient_Traverse.upsertTraverse(newTraverse);
          dispatch(upsertTraverse(newTraverse, true));
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
