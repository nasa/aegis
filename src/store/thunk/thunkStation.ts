import appCreateAsyncThunk from "./thunkUtil";
import {
  upsertStation,
  setStationEditMode,
  setSelectedStationUuid,
  setStationsFromDb,
  deleteStationByUuid,
  upsertStationFromDb,
  setStationCircleUIStates,
  resetAllStationCirclesUIStates,
} from "store/station";
import { getDistanceBetweenTwoCoordinates, getTotalDistance } from "utils/geoMath";
import { thunkGetElevation } from "./thunkElevation";
import isEqual from "lodash/isEqual";
import cloneDeep from "lodash/cloneDeep";
import { thunkFullUpdateTraverse, thunkUpdateTraversesAroundStation } from "./thunkTraverse";
import { generateUniqueName } from "utils/names/unique-name";
import { v4 as uuidv4 } from "uuid";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { deleteActionsByUuid, upsertActions } from "store/action";
import * as httpClient_station from "http-client/station";
import { updateMapDirective } from "store/map";
import { thunkCancelMarkerMapDirective } from "./thunkMap";
import {
  thunkDeleteActionFromDbAndStore,
  thunkDuplicateActions,
  thunkSaveActions,
} from "./thunkAction";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { isModified } from "utils/component-helpers";
import { thunkSaveNewStation } from "./crossThunk";
import { thunkSetRightPanelIsOpenIfAuto } from "./thunkInterface";
import { generateBlankStation } from "store/storeUtils/station";

export const thunkUpdateStationLatLngField = appCreateAsyncThunk<{
  stationUuid: string;
  type: "lat" | "lng";
  value: number;
}>("updateStationLatLngField", async ({ stationUuid, type, value }, { getState, dispatch }) => {
  const stationLocation: AEGISPoint = cloneDeep(
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
    newPath = cloneDeep(path);
  }

  const station = getState().station.stations.find((s) => s.uuid === stationUuid);
  const landerLocation = getState().mission.mission.landerLocation;
  //set starting station
  if (station && !isEqual(newPath.at(0), station.location)) {
    newPath[0] = station.location;
  }
  //set ending lander
  if (landerLocation && !isEqual(newPath.at(-1), landerLocation)) {
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

  // full update traverses (including name) around this station in any eva using this station
  dispatch(thunkUpdateTraversesAroundStation({ stationUuid: station.uuid, saveToDb: true }));

  // upsert the changed Station to the DB via internal API call
  const stationUpsertResponse = await httpClient_station.upsertStations([
    {
      ...station,
      updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
    },
  ]);

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
  dispatch(resetAllStationCirclesUIStates({ stationUuid: station.uuid }));
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
    dispatch(thunkSetRightPanelIsOpenIfAuto(false));
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
  dispatch(resetAllStationCirclesUIStates({ stationUuid: station.uuid }));

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
    const actionUuidsToDelete: string[] = stationActions.map((a) => a.uuid);
    if (actionUuidsToDelete.length > 0) {
      await dispatch(thunkDeleteActionFromDbAndStore({ uuids: actionUuidsToDelete }));
    }

    // delete the Station from the DB via internal API call
    const deleteResponse: WrappedResponse<number> = await httpClient_station.deleteStations([
      station.uuid,
    ]);
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
  dispatch(thunkSetRightPanelIsOpenIfAuto(false));
});

export const thunkCreateStation = appCreateAsyncThunk<void>(
  "stationCreate",
  async (_, { dispatch, getState }) => {
    const randomName = generateUniqueName({
      dictName: "lotr",
      existingNames: getState().station.stations.map((item) => item.name),
    });

    // build circle controls
    const blankMapCircleControls: MapCircleControls = {};
    getState().mission.mission?.circleDefinitions?.forEach((landerRadius) => {
      blankMapCircleControls[landerRadius.uuid] = {
        name: landerRadius.name,
        uuid: landerRadius.uuid,
        visible: false,
        style: {
          opacity: 1,
          contrast: 1,
          brightness: 1,
          saturation: 1,
          blendMode: "normal",
          color: "#FFFFFF",
          weight: 1,
          fillColor: "none",
          fillOpacity: 0,
        },
      };
    });

    const blankStation = generateBlankStation({
      missionId: getState().mission.mission?.id,
      name: randomName,
      mapCircleControls: blankMapCircleControls,
    });
    dispatch(thunkSaveNewStation({ station: blankStation }));

    // create preset circles ui states entry
    const circleUIStates: CircleUIStates = {};

    if (getState().mission.mission.circleDefinitions) {
      for (const circleDefinition of getState().mission.mission.circleDefinitions) {
        circleUIStates[circleDefinition.uuid] = {
          name: circleDefinition.name,
          slidersSelected: false,
        };
      }
    }

    dispatch(
      setStationCircleUIStates({
        stationUuid: blankStation.uuid,
        circleUIStates: circleUIStates,
      })
    );
  }
);

export const thunkDuplicateStation = appCreateAsyncThunk<{ stationUuid: String }, Station, false>(
  "stationDuplicate",
  async ({ stationUuid }, { dispatch, getState }) => {
    if (!stationUuid) return;
    const station = getState().station.stations.find((s) => s.uuid === stationUuid);
    //duplicate station
    const newStation: Station = cloneDeep(station);
    newStation.uuid = uuidv4();
    newStation.updatedAt = null;
    newStation.createdAt = roundDateToSecond(getAccurateNow()).toISOString();
    newStation.name = makeUniqueStringCopy(
      station.name,
      getState().station.stations.map((s) => s.name)
    );
    newStation.actionOrderUuids = [];
    dispatch(thunkSaveNewStation({ station: newStation }));

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

    //duplicate station circles ui state
    const newStationCircleUIStates: CircleUIStates = cloneDeep(
      getState().station.stationCirclesUIStates[station.uuid]
    );
    dispatch(
      setStationCircleUIStates({
        stationUuid: newStation.uuid,
        circleUIStates: newStationCircleUIStates,
      })
    );

    return newStation;
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
