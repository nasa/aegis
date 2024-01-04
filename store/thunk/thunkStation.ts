import appCreateAsyncThunk from "./thunkUtil";
import {
  upsertStation,
  setStationCalculatedFields as setStationCalculatedFields,
  setStationEditMode,
  setSelectedStationUuid,
  setStationsFromDb,
  deleteStationByUuid,
  upsertStationFromDb,
} from "store/station";
import {
  calculateAscentAndDescent,
  getDistanceBetweenTwoCoordinates,
  getTotalDistance,
  calcPathDurationMins,
} from "utils/geoMath";
import { thunkGetElevation } from "./thunkElevation";
import _ from "lodash";
import { thunkFullUpdateTraverse, thunkUpdateTraversesAroundStation } from "./thunkTraverse";
import { generateUniqueName } from "utils/names/unique-name";
import { v4 as uuidv4 } from "uuid";
import { setRightPanelOpen } from "store/interface";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { deleteActionsByUuid, setActionsFromDb, upsertActions } from "store/action";
import * as httpClient_station from "http-client/station";
import * as httpClient_action from "http-client/action";
import { updateMapDirective } from "store/map";
import { thunkCancelMarkerMapDirective } from "./thunkMap";
import { thunkDuplicateActions, thunkSaveActions } from "./thunkAction";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { isModified } from "utils/component-helpers";
import { saveNewStation } from "store/cross-slice";
import { mergeEquipmentItems } from "utils/store";

export const thunkUpdateStationLatLngField = appCreateAsyncThunk<{
  stationUuid: string;
  type: "lat" | "lng";
  value: number;
}>("updateStationLatLngField", async ({ stationUuid, type, value }, { getState, dispatch }) => {
  const stationLocation: AEGISPoint = _.cloneDeep(
    getState().station.stations.find((s) => s.uuid === stationUuid)?.location
  );
  if (type === "lat") {
    stationLocation.lat = value;
  } else {
    stationLocation.lng = value;
  }
  await dispatch(thunkUpdateStationLocation({ location: stationLocation, stationUuid }));
});

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
  if (!elevation || elevation.payload === false) {
    //no elevation data, update just station location
    dispatch(upsertStation({ ...station, location }));
  } else {
    //upsert station location and elevation
    dispatch(upsertStation({ ...station, location, elevation: elevation.payload as number }));
  }

  //update walkback path, elevation, and snap to new location
  await dispatch(thunkFullUpdateWalkback({ path: station.walkbackPath, stationUuid }));

  //update any eva traverses connected to this station
  await dispatch(thunkUpdateTraversesAroundStation({ stationUuid, saveToDb: true }));

  //update any traverses of EVAs that use this station as an egress or ingress point
  await dispatch(thunkUpdateEVAsUsingStationForEgressIngress({ stationUuid }));
});

/**
 * Only updates walkback path and distances
 * This is used on polyline edit drag
 */
export const thunkUpdateWalkbackPath = appCreateAsyncThunk<{
  path: AEGISPoint[];
  stationUuid: string;
}>("updateWalkbackPath", async ({ path, stationUuid }, { dispatch, getState }) => {
  //calculate path distances
  const pathSegmentDistances: number[] = [];
  for (let i = 1; i < path.length; i++) {
    pathSegmentDistances.push(
      getTotalDistance([path[i - 1], path[i]], getState().mission.mission.planetRadius)
    );
  }
  //save walkback
  const station = getState().station.stations.find((s) => s.uuid === stationUuid);
  dispatch(
    upsertStation({
      ...station,
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
export const thunkFullUpdateWalkback = appCreateAsyncThunk<
  {
    path: AEGISPoint[];
    stationUuid: string;
  },
  AEGISPoint[],
  false
>("fullUpdateWalkback", async ({ path, stationUuid }, { dispatch, getState }) => {
  //calculate path distances
  let newPath: AEGISPoint[];
  if (!path || path.length === 0) {
    newPath = [
      getState().mission.mission.landerLocation,
      getState().mission.mission.landerLocation,
    ];
  } else {
    newPath = _.cloneDeep(path);
  }

  const station = getState().station.stations.find((s) => s.uuid === stationUuid);
  const landerLocation = getState().mission.mission.landerLocation;
  //set starting station
  if (station && !_.isEqual(newPath.at(0), station.location)) {
    newPath[0] = station.location;
  }
  //set ending lander
  if (landerLocation && !_.isEqual(newPath.at(-1), landerLocation)) {
    newPath[newPath.length - 1] = landerLocation;
  }

  //calculate new path distances
  const pathSegmentDistances: number[] = [];
  for (let i = 1; i < newPath.length; i++) {
    pathSegmentDistances.push(
      getTotalDistance([newPath[i - 1], newPath[i]], getState().mission.mission.planetRadius)
    );
  }

  //get elevation traverse
  let newElevationProfile = null;
  const elevationResponse = await dispatch(
    thunkGetElevation({
      path: newPath,
      pathSegmentDistances: pathSegmentDistances,
      uuid: stationUuid,
    })
  );
  if (elevationResponse && elevationResponse.payload !== false) {
    newElevationProfile = elevationResponse.payload as number[][];
  }

  //save walkback
  dispatch(
    upsertStation({
      ...station,
      walkbackPath: newPath,
      walkbackPathSegmentDistances: pathSegmentDistances,
      walkbackPathSegmentElevations: newElevationProfile,
    })
  );

  return newPath;
});

/**
 * Reset the start and end points of walkback to station and lander
 * Updates path, distance, elevation
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
      getState().mission.mission.planetRadius
    ),
  ];

  //get elevation
  let newElevationProfile = null;
  const elevationResponse = await dispatch(
    thunkGetElevation({
      path: newPath,
      pathSegmentDistances: newPathSegmentDistances,
      uuid: stationUuid,
    })
  );
  if (elevationResponse && elevationResponse.payload !== false) {
    newElevationProfile = elevationResponse.payload as number[][];
  }

  //update store
  dispatch(
    upsertStation({
      ...station,
      walkbackPath: newPath,
      walkbackPathSegmentDistances: newPathSegmentDistances,
      walkbackPathSegmentElevations: newElevationProfile,
    })
  );
});

/**
 * Create reports for all stations
 */
export const thunkCreateStationCalculatedFields = appCreateAsyncThunk<void>(
  "createStationCalculatedFields",
  async (_, { dispatch, getState }) => {
    const stations = getState().station.stations;
    const allCalculatedFields: StationCalculatedFields[] = [];
    const missionTraverseRate = getState().mission.mission?.traverseRate;
    for (const station of stations) {
      //get station actions
      const stationActions = getState().action.actions.filter(
        (storeAction) => storeAction.stationUuid === station.uuid && storeAction.enabled
      );

      //calculate total station time
      let totalDurationLower = 0;
      let totalDurationUpper = 0;
      let totalEv1DurationLower = 0;
      let totalEv1DurationUpper = 0;
      let totalEv2DurationLower = 0;
      let totalEv2DurationUpper = 0;
      let totalUnassignedDurationLower = 0;
      let totalUnassignedDurationUpper = 0;
      let totalDwellTimeLower = 0;
      let totalDwellTimeUpper = 0;
      let totalCompletedEv1TimeLower = 0;
      let totalCompletedEv1TimeUpper = 0;
      let totalCompletedEv2TimeLower = 0;
      let totalCompletedEv2TimeUpper = 0;
      let totalCompletedDwellTimeLower = 0;
      let totalCompletedDwellTimeUpper = 0;

      let actionCount = 0;
      let totalEquipmentItems: EquipmentItemUsage[] = [];
      stationActions.forEach((action) => {
        totalDurationLower += action.durationLower;
        totalDurationUpper += action.durationUpper;
        if (action.crewAssigned?.includes("EV1")) {
          totalEv1DurationLower += action.durationLower;
          totalEv1DurationUpper += action.durationUpper;
          if (action.rexStatus === "complete") {
            totalCompletedEv1TimeLower += action.durationLower;
            totalCompletedEv1TimeUpper += action.durationUpper;
          }
        }
        if (action.crewAssigned?.includes("EV2")) {
          totalEv2DurationLower += action.durationLower;
          totalEv2DurationUpper += action.durationUpper;
          if (action.rexStatus === "complete") {
            totalCompletedEv2TimeLower += action.durationLower;
            totalCompletedEv2TimeUpper += action.durationUpper;
          }
        }
        if (!action.crewAssigned || action.crewAssigned.length === 0) {
          totalUnassignedDurationLower += action.durationLower;
          totalUnassignedDurationUpper += action.durationUpper;
        }
        totalDwellTimeLower =
          totalEv1DurationLower > totalEv2DurationLower
            ? totalEv1DurationLower
            : totalEv2DurationLower;

        if (action.rexStatus === "complete") {
          totalCompletedDwellTimeLower =
            totalCompletedEv1TimeLower > totalCompletedEv2TimeLower
              ? totalCompletedEv1TimeLower
              : totalCompletedEv2TimeLower;
        }

        totalDwellTimeUpper =
          totalEv1DurationUpper > totalEv2DurationUpper
            ? totalEv1DurationUpper
            : totalEv2DurationUpper;

        if (action.rexStatus === "complete") {
          totalCompletedDwellTimeUpper =
            totalCompletedEv1TimeUpper > totalCompletedEv2TimeUpper
              ? totalCompletedEv1TimeUpper
              : totalCompletedEv2TimeUpper;
        }

        totalEquipmentItems = mergeEquipmentItems(action.equipmentItemsUsage, totalEquipmentItems);
        actionCount++;
      });

      //generate station report messages
      if (!station) return;
      const newReportItems: ReportItem[] = [];

      // check if station has no actions
      if (stationActions.length === 0) {
        newReportItems.push({
          message: "Station has no actions",
          type: "warning",
        } as ReportItem);
      }

      // check if station has no location
      if (!station.location) {
        newReportItems.push({
          message: "Station location not yet set",
          type: "warning",
        } as ReportItem);
      }

      // check if station durationLower is greater than totalDurationLower
      if (station.durationLower < totalDwellTimeLower) {
        newReportItems.push({
          message:
            "Estimated nominal dwell time is less than calculated maximum dwell time from actions",
          type: "error",
        } as ReportItem);
      }

      // check if station durationUpper is greater than totalDurationUpper
      if (station.durationUpper < totalDwellTimeUpper) {
        newReportItems.push({
          message:
            "Estimated maximum dwell time is less than calculated maximum dwell time from actions",
          type: "error",
        } as ReportItem);
      }
      // check if station has any unassigned action time
      if (totalUnassignedDurationLower > 0 || totalUnassignedDurationUpper > 0) {
        newReportItems.push({
          message: "Station has actions with no crew assigned. Dwell time calculation is incorrect",
          type: "error",
        } as ReportItem);
      }
      // check if station has no associated POIs
      if (!station.poiUuids || station.poiUuids.length === 0) {
        newReportItems.push({
          message: "Station has no associated POIs",
          type: "info",
        } as ReportItem);
      }

      // get walback duration minutes
      const walkbackDurationMinutes = calcPathDurationMins(
        station.walkbackPathSegmentDistances,
        missionTraverseRate
      );

      // get walkback distance meters
      const walkbackDistanceMeters = station.walkbackPathSegmentDistances?.reduce(
        (accumulator, currentVal) => accumulator + currentVal,
        0
      );

      // total ascended and descended
      const walkbackAscentDescent = calculateAscentAndDescent(
        station.walkbackPathSegmentElevations
      );

      const newCalculatedFields: StationCalculatedFields = {
        uuid: station.uuid,
        reportItems: newReportItems,
        totalActionTime: {
          durationLower: totalDurationLower,
          durationUpper: totalDurationUpper,
        },
        totalEv1Time: {
          durationLower: totalEv1DurationLower,
          durationUpper: totalEv1DurationUpper,
        },
        totalCompletedEv1Time: {
          durationLower: totalCompletedEv1TimeLower,
          durationUpper: totalCompletedEv1TimeUpper,
        },
        totalEv2Time: {
          durationLower: totalEv2DurationLower,
          durationUpper: totalEv2DurationUpper,
        },
        totalCompletedEv2Time: {
          durationLower: totalCompletedEv2TimeLower,
          durationUpper: totalCompletedEv2TimeUpper,
        },
        totalUnassignedTime: {
          durationLower: totalUnassignedDurationLower,
          durationUpper: totalUnassignedDurationUpper,
        },
        totalDwellTime: {
          durationLower: totalDwellTimeLower,
          durationUpper: totalDwellTimeUpper,
        },
        totalCompletedDwellTime: {
          durationLower: totalCompletedDwellTimeLower,
          durationUpper: totalCompletedDwellTimeUpper,
        },
        actionCount,
        walkbackDurationMinutes,
        walkbackDistanceMeters,
        walkbackAscentDescent,
        equipmentItems: totalEquipmentItems,
      };
      allCalculatedFields.push(newCalculatedFields);
    }
    dispatch(setStationCalculatedFields({ calculatedFields: allCalculatedFields }));
  }
);

export const thunkSaveStation = appCreateAsyncThunk<{
  station: Station;
}>("stationSave", async ({ station }, { dispatch, getState }) => {
  if (!station) return;
  const stationActions = getState().action.actions.filter(
    (action) => action.stationUuid === station.uuid
  );
  const stationActionsFromDb = getState().action.actionsFromDb.filter(
    (action) => action.stationUuid === station.uuid
  );
  // any rex running?
  const rexRunning: boolean = getState().rex.rexes.find((rex) => rex.rexRunning)?.rexRunning;

  // full update traverses (including name) around this station in any eva using this station
  dispatch(thunkUpdateTraversesAroundStation({ stationUuid: station.uuid, saveToDb: true }));

  // upsert the changed Station to the DB via internal API call
  const stationUpsertResponse = await httpClient_station.upsertStations(
    [
      {
        ...station,
        updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
      },
    ],
    rexRunning
  );

  if (stationUpsertResponse.status === "success") {
    // upsert the changed Station (with new updated date) to the store
    dispatch(upsertStation(stationUpsertResponse.data[0], true));
    // update the Statiofromdb copy in store
    dispatch(upsertStationFromDb(stationUpsertResponse.data[0]));
  } else {
    throw new Error("Error upserting Station: " + stationUpsertResponse.message);
  }

  // find out if the actions in this station have been modified and need to be persisted
  const actionsModified = isModified(stationActions, stationActionsFromDb);
  if (actionsModified) {
    dispatch(
      thunkSaveActions({
        actions: stationActions,
        actionsFromDb: stationActionsFromDb,
      })
    );
  }

  // if the walkback is in edit mode, cancel it out
  const stationMapDirective =
    getState().map.mapDirective?.uuid === station.uuid ? getState().map.mapDirective : null;

  if (stationMapDirective?.mapAction === "editPolyline") {
    // handle walkback edit state
    dispatch(
      updateMapDirective({
        ...stationMapDirective,
        mapAction: "saveEditPolyline",
      })
    );
  }

  dispatch(thunkCancelMarkerMapDirective({ uuid: station.uuid }));
  dispatch(setStationEditMode({ stationUuid: station.uuid, editMode: false }));
});

export const thunkStationCancel = appCreateAsyncThunk<{
  station: Station;
}>("stationCancel", async ({ station }, { dispatch, getState }) => {
  const stationFromDb = getState().station.stationsFromDb.find(
    (stationDb) => stationDb.uuid === station.uuid
  );
  const stationActions = getState().action.actions.filter(
    (action) => action.stationUuid === station.uuid
  );
  const stationActionsFromDb = getState().action.actionsFromDb.filter(
    (action) => action.stationUuid === station.uuid
  );

  // find out if this station is already on the map
  if (stationFromDb) {
    //station is already saved once to the db,
    // replace it with the one from the db (undoing any changes)
    dispatch(upsertStation(stationFromDb, true));

    //check if location was changed. if so, revert back traverses
    if (station.location !== stationFromDb.location) {
      // Update traverses surrounding this station
      dispatch(thunkUpdateTraversesAroundStation({ stationUuid: station.uuid, saveToDb: true }));
    }

    dispatch(upsertActions(stationActionsFromDb, true));
    //delete newly added actions that user doesn't want to save
    const addedActionsToDelete: Action[] = stationActions.filter(
      // only delete actions that don't exist in the db
      (action) => stationActionsFromDb.findIndex((actionDb) => actionDb.uuid === action.uuid) === -1
    );
    dispatch(deleteActionsByUuid(addedActionsToDelete.map((a) => a.uuid)));
  } else {
    // station hasn't been saved to the db. delete the station and actions from the store
    dispatch(deleteStationByUuid(station.uuid));
    dispatch(setSelectedStationUuid(null));
    dispatch(deleteActionsByUuid(stationActions.map((a) => a.uuid)));
    dispatch(setRightPanelOpen(false));
  }

  // if the walkback is in edit mode, save the walkback
  const stationMapDirective =
    getState().map.mapDirective?.uuid === station.uuid ? getState().map.mapDirective : null;

  if (stationMapDirective?.mapAction === "editPolyline") {
    // handle walkback edit state
    dispatch(
      updateMapDirective({
        ...stationMapDirective,
        mapAction: "cancelEditPolyline",
      })
    );
  }
  dispatch(thunkCancelMarkerMapDirective({ uuid: station.uuid }));
  dispatch(setStationEditMode({ stationUuid: station.uuid, editMode: false }));

  //update any traverses of EVAs that use this station as an egress or ingress point
  await dispatch(thunkUpdateEVAsUsingStationForEgressIngress({ stationUuid: station.uuid }));
});

export const thunkDeleteStation = appCreateAsyncThunk<{
  station: Station;
}>("stationDelete", async ({ station }, { dispatch, getState }) => {
  if (!station) return;
  const stationFromDb = getState().station.stationsFromDb.find(
    (stationDb) => stationDb.uuid === station.uuid
  );
  const stationActions = getState().action.actions.filter(
    (action) => action.stationUuid === station.uuid
  );
  // any rex running?
  const rexRunning: boolean = getState().rex.rexes.find((rex) => rex.rexRunning)?.rexRunning;

  const evasUsingThisStation: Eva[] = [];
  getState().eva.evas.forEach((eva) => {
    eva.sequence.forEach((sequenceItem) => {
      if (sequenceItem.uuid === station?.uuid) {
        evasUsingThisStation.push(eva);
      }
    });
  });
  if (evasUsingThisStation.length > 0) {
    alert("Cannot delete a station that is being used by an EVA");
    return;
  }

  const evasUsingThisStationForEgressIngress: Eva[] = getState().eva.evas.filter((eva) => {
    return eva.egressLocationUuid === station.uuid || eva.ingressLocationUuid === station.uuid;
  });
  if (evasUsingThisStationForEgressIngress.length > 0) {
    alert("Cannot delete a station that is being used by an EVA as an egress or ingress location");
    return;
  }

  // if the selected station is in stationsFromDb then delete it from the db
  if (stationFromDb) {
    // delete actions from the db via internal api call
    const actionuuidsToDelete: string[] = stationActions.map((a) => a.uuid);
    if (actionuuidsToDelete.length > 0) {
      const actionDeleteResponse: WrappedResponse<number> = await httpClient_action.deleteActions(
        actionuuidsToDelete,
        rexRunning
      );
      if (actionDeleteResponse.status !== "success") {
        throw new Error("Error deleting actions for station " + actionDeleteResponse.message);
      }
      // delete actions from the store
      dispatch(deleteActionsByUuid(actionuuidsToDelete));
      // update store copy of the db with a fresh copy of actions for this mission from the db
      const actionData = await httpClient_action.getActions({
        missionId: getState().mission.mission?.id,
      });
      if (actionData.data) {
        dispatch(setActionsFromDb(actionData.data));
      }
    }

    // delete the Station from the DB via internal API call
    const deleteResponse: WrappedResponse<number> = await httpClient_station.deleteStations(
      [station.uuid],
      rexRunning
    );
    if (deleteResponse.status === "success") {
      // remove the corresponding Station from the store
      dispatch(deleteStationByUuid(station.uuid));
      dispatch(setSelectedStationUuid(null));

      // get fresh copy of Stations from DB
      const stationData = await httpClient_station.getStations(getState().mission.mission?.id);
      if (stationData.data) {
        dispatch(setStationsFromDb(stationData.data));
      }
    } else {
      console.error("Error deleting Station: " + deleteResponse.message);
    }
  } else {
    // if the selected station is not in stationsFromDb then delete it from the store
    dispatch(deleteStationByUuid(station.uuid));
    dispatch(setSelectedStationUuid(null));
    dispatch(deleteActionsByUuid(stationActions.map((a) => a.uuid)));
  }
  dispatch(thunkCancelMarkerMapDirective({ uuid: station.uuid }));
  dispatch(setStationEditMode({ stationUuid: station.uuid, editMode: false }));
  // close right panel
  dispatch(setRightPanelOpen(false));
});

export const thunkCreateStation = appCreateAsyncThunk<void>(
  "stationCreate",
  async (_, { dispatch, getState }) => {
    const randomName = generateUniqueName({
      dictName: "lotr",
      existingNames: getState().station.stations.map((item) => item.name),
    });

    const blankStation: Station = {
      ownerId: null,
      missionId: getState().mission.mission?.id,
      uuid: uuidv4(),
      name: randomName,
      status: "Candidate",
      description: "",
      actionOrderUuids: [],
      radius: 5,
      location: null,
      elevation: null,
      durationLower: 10,
      durationUpper: 15,
      walkbackPath: null,
      walkbackPathSegmentDistances: null,
      walkbackPathSegmentElevations: null,
      icon: null,
      poiUuids: [],
      rexStatus: "pending",
      updatedAt: null,
      createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    };
    dispatch(saveNewStation(blankStation));
  }
);

export const thunkDuplicateStation = appCreateAsyncThunk<{ station: Station }, Station, false>(
  "stationDuplicate",
  async ({ station }, { dispatch, getState }) => {
    if (!station) return;
    //duplicate station
    const newStation: Station = _.cloneDeep(station);
    newStation.uuid = uuidv4();
    newStation.updatedAt = null;
    newStation.createdAt = roundDateToSecond(getAccurateNow()).toISOString();
    newStation.name = makeUniqueStringCopy(
      station.name,
      getState().station.stations.map((s) => s.name)
    );
    newStation.actionOrderUuids = [];
    dispatch(saveNewStation(newStation));

    //duplicate actions
    const stationActions = getState()
      .action.actions.filter((action) => action.stationUuid === station.uuid)
      .sort(
        (a, b) =>
          station.actionOrderUuids.findIndex((o) => o === a.uuid) -
          station.actionOrderUuids.findIndex((o) => o === b.uuid)
      );
    await dispatch(
      thunkDuplicateActions({
        actions: stationActions,
        stationUuid: newStation.uuid,
        promotingFromPoi: false,
      })
    );

    return newStation;
  }
);

export const thunkCycleStationRexToNextStatus = appCreateAsyncThunk<{ stationUuid: string }>(
  "cycleStationRexToNextStatus",
  async ({ stationUuid }, { dispatch, getState }) => {
    const station = getState().station.stations.find((s) => s.uuid === stationUuid);
    // any rex running?
    const rexRunning: boolean = getState().rex.rexes.find((rex) => rex.rexRunning)?.rexRunning;

    let lastStatus: RexStatus = "pending";
    if (station.rexStatus) {
      lastStatus = station.rexStatus;
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

    dispatch(upsertStation({ ...station, rexStatus }, true));
    dispatch(upsertStationFromDb({ ...station, rexStatus }));

    // update the station in the database
    httpClient_station.upsertStations([{ ...station, rexStatus }], rexRunning);
  }
);

export const thunkUpdateEVAsUsingStationForEgressIngress = appCreateAsyncThunk<{
  stationUuid: string;
}>("updateEVAsUsingStationForEgressIngress", async ({ stationUuid }, { dispatch, getState }) => {
  //update any traverses of EVAs that use this station as an egress or ingress point
  const evasUsingStationEgressIngress: Eva[] = getState().eva.evas.filter((eva) => {
    return eva.egressLocationUuid === stationUuid || eva.ingressLocationUuid === stationUuid;
  });
  //first/last sequence items of these evas
  const firstLastSequenceItems: EvaSequenceItem[] = [];
  evasUsingStationEgressIngress.forEach((eva) => {
    if (eva.sequence.length > 0) {
      firstLastSequenceItems.push(eva.sequence[0]);
      firstLastSequenceItems.push(eva.sequence[eva.sequence.length - 1]);
    }
  });

  //perform full updates of these traverses
  firstLastSequenceItems.forEach(async (traverse) => {
    await dispatch(thunkFullUpdateTraverse({ traverseUuid: traverse.uuid, saveToDb: true }));
  });
});

/**
 * Thunk used to verify stations in edit. This was created so that components do not
 * have to subscribe to the entire state and cause un-necessary re-renders.
 *
 * If another station is being edited, fire an alert and return false
 */
export const thunkVerifyNoStationsBeingEdited = appCreateAsyncThunk<void, boolean, false>(
  "verifyNoStationsBeingEdited",
  async (_, { getState }) => {
    const stationsEditing = getState().station.stationsEditing;

    if (stationsEditing.length > 0) {
      alert(
        "You are currently editing a station. Please save or cancel your changes before attempting to move the lander location."
      );
      return false;
    } else {
      return true;
    }
  }
);
