import _ from "lodash";
import {
  setTraverseCalculatedFields,
  setTraverseEditMode,
  upsertTraverses,
  upsertTraversesFromDb,
} from "store/traverse";
import { calculateAscentAndDescent, getTotalDistance, calcPathDurationMins } from "utils/geoMath";
import appCreateAsyncThunk from "./thunkUtil";
import { thunkGetElevation } from "./thunkElevation";
import * as httpClient_Traverse from "http-client/traverse";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";

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
    upsertTraverses([
      {
        ...traverse,
        path: path,
        pathSegmentDistances: pathSegmentDistances,
        pathSegmentElevations: null,
      },
    ])
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
    // any rex running?
    const rexRunning: boolean = getState().rex.rexes.find((rex) => rex.rexRunning)?.rexRunning;

    const eva = getState().eva.evas.find((eva) => {
      return eva.sequence.find((sequenceItem) => {
        return sequenceItem.uuid === traverseUuid;
      });
    });

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

    // find the traverse and start/end stations to check endpoints
    let selectedEvaSequence = evaSequence;
    if (!selectedEvaSequence) {
      selectedEvaSequence = eva?.sequence;
    }

    let locationBefore: AEGISPoint;
    let locationAfter: AEGISPoint;
    let nameBefore: string;
    let nameAfter: string;
    selectedEvaSequence?.forEach((item, index) => {
      if (item.type === "traverse" && item.uuid === traverseUuid) {
        // if this is the first item in the sequence, use the egressLocation as the before location
        if (index === 0) {
          if (eva.egressLocationUuid === "lander") {
            locationBefore = getState().mission.mission.landerLocation;
            nameBefore = "Lander";
          } else {
            const stationUuidBefore = eva.egressLocationUuid;
            const stationBefore = getState().station.stations.find(
              (s) => s.uuid === stationUuidBefore
            );
            locationBefore = stationBefore.location;
            nameBefore = stationBefore.name;
          }
        } else {
          const stationUuidBefore = selectedEvaSequence[index - 1].uuid;
          const stationBefore = getState().station.stations.find(
            (s) => s.uuid === stationUuidBefore
          );
          locationBefore = stationBefore.location;
          nameBefore = stationBefore.name;
        }

        // if this is the last item in the sequence, use ingressLocation as the after location
        if (index === selectedEvaSequence.length - 1) {
          if (eva.ingressLocationUuid === "lander") {
            locationAfter = getState().mission.mission.landerLocation;
            nameAfter = "Lander";
          } else {
            const stationUuidAfter = eva.ingressLocationUuid;
            const stationAfter = getState().station.stations.find(
              (s) => s.uuid === stationUuidAfter
            );
            locationAfter = stationAfter.location;
            nameAfter = stationAfter.name;
          }
        } else {
          const stationUuidAfter = selectedEvaSequence[index + 1].uuid;
          const stationAfter = getState().station.stations.find((s) => s.uuid === stationUuidAfter);
          locationAfter = stationAfter.location;
          nameAfter = stationAfter.name;
        }
      }
    });

    //set starting location
    if (locationBefore && !_.isEqual(newPath.at(0), locationBefore)) {
      newPath[0] = locationBefore;
    }
    //set ending location
    if (locationAfter && !_.isEqual(newPath.at(-1), locationAfter)) {
      newPath[newPath.length - 1] = locationAfter;
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
    let newElevationProfile = null;
    if (elevationResponse && elevationResponse.payload !== false) {
      //good response from the thunk, cast as our number type
      newElevationProfile = elevationResponse.payload as number[][];
    }

    const newTraverse: Traverse = {
      ...traverse,
      name: rename ? nameBefore + " to " + nameAfter : traverse.name,
      path: newPath,
      pathSegmentDistances: pathSegmentDistances,
      pathSegmentElevations: newElevationProfile,
      updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
    };
    if (saveToDb) {
      httpClient_Traverse.upsertTraverses([newTraverse], rexRunning);
      dispatch(setTraverseEditMode({ uuid: newTraverse.uuid, editMode: false }));
      dispatch(upsertTraversesFromDb([newTraverse]));
    }
    //update the store
    dispatch(upsertTraverses([newTraverse], true));

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

  let fromStationLoc: AEGISPoint;
  let toStationLoc: AEGISPoint;

  const sequenceIndex = selectedEva.sequence.findIndex(
    (sequenceItem) => sequenceItem.uuid === traverseUuid
  );
  if (sequenceIndex === 0) {
    //first traverse in sequence. get egress location.
    if (selectedEva.egressLocationUuid === "lander") {
      fromStationLoc = getState().mission.mission.landerLocation;
    } else {
      fromStationLoc = getState().station.stations.find(
        (s) => s.uuid === selectedEva.egressLocationUuid
      )?.location;
    }
  } else {
    fromStationLoc = getState().station.stations.find(
      (station) => station.uuid === selectedEva.sequence[sequenceIndex - 1].uuid
    )?.location;
  }
  if (sequenceIndex === selectedEva.sequence.length - 1) {
    //last traverse in sequence. get ingress location
    if (selectedEva.ingressLocationUuid === "lander") {
      toStationLoc = getState().mission.mission.landerLocation;
    } else {
      toStationLoc = getState().station.stations.find(
        (s) => s.uuid === selectedEva.ingressLocationUuid
      )?.location;
    }
  } else {
    toStationLoc = getState().station.stations.find(
      (station) => station.uuid === selectedEva.sequence[sequenceIndex + 1].uuid
    )?.location;
  }
  const newPath = [fromStationLoc, toStationLoc];

  await dispatch(
    thunkFullUpdateTraverse({
      path: newPath,
      traverseUuid,
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
          //get traverse after
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
          break;
        }
      }
    }
  }
);

export const thunkCreateTraverseCalculatedFields = appCreateAsyncThunk<void>(
  "createTraverseCalculatedFields",
  async (_, { dispatch, getState }) => {
    const traverses = getState().traverse.traverses;
    const missionTraverseRate = getState().mission.mission?.traverseRate;
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

export const thunkCycleTraverseRexToNextStatus = appCreateAsyncThunk<{ traverseUuid: string }>(
  "cycleTraverseRexToNextStatus",
  async ({ traverseUuid }, { dispatch, getState }) => {
    const traverse = getState().traverse.traverses.find((s) => s.uuid === traverseUuid);
    // any rex running?
    const rexRunning: boolean = getState().rex.rexes.find((rex) => rex.rexRunning)?.rexRunning;

    let lastStatus: RexStatus = "pending";
    if (traverse.rexStatus) {
      lastStatus = traverse.rexStatus;
    }

    // cycle the status to the next one
    let rexStatus: RexStatus;
    if (!lastStatus) {
      rexStatus = "in-progress";
    } else if (lastStatus === "in-progress") {
      rexStatus = "complete";
    } else if (lastStatus === "complete") {
      rexStatus = "skipped";
    } else if (lastStatus === "skipped") {
      rexStatus = "pending";
    } else if (lastStatus === "pending") {
      rexStatus = "in-progress";
    }

    dispatch(upsertTraverses([{ ...traverse, rexStatus }], true));
    dispatch(upsertTraversesFromDb([{ ...traverse, rexStatus }]));

    // update the station in the database
    httpClient_Traverse.upsertTraverses([{ ...traverse, rexStatus }], rexRunning);
  }
);
