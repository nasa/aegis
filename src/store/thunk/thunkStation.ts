import appCreateAsyncThunk from "./thunkUtil";
import {
  upsertStations,
  upsertStationsFromDb,
  setStationEditMode,
  setSelectedStationUuid,
  deleteStationsByUuid,
  deleteStationsFromDbByUuid,
  setStationCircleUIStates,
  resetAllStationCirclesUIStates,
  upsertStationByField,
  selectStation,
} from "store/station";
import { getDistanceBetweenTwoCoordinates, getTotalDistance } from "utils/mapping/geoMath";
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
  thunkDeleteActionsFromDbAndStore,
  thunkDuplicateActions,
  thunkSaveActions,
} from "./thunkAction";
import { getAccurateNow } from "utils/formatting";
import { thunkSetRightPanelIsOpenIfAuto } from "./thunkInterface";
import { generateBlankStation } from "store/storeUtils/station";
import { thunkAddRemoveFolderItem } from "./thunkFolder";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";

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
  if (elevation.meta.requestStatus === "rejected") {
    //no elevation data, update just station location
    dispatch(upsertStationByField(station.uuid, "location", location, false));
  } else {
    //upsert station location and elevation
    dispatch(upsertStations([{ ...station, location, elevation: elevation.payload as number }]));
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
    upsertStations([
      {
        ...station,
        walkbackPath: path,
        walkbackPathSegmentDistances: pathSegmentDistances,
        walkbackPathSegmentElevations: null,
      },
    ])
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
  if (elevationResponse.meta.requestStatus === "fulfilled") {
    newElevationProfile = elevationResponse.payload as number[][];
  }

  //save walkback
  dispatch(
    upsertStations([
      {
        ...station,
        walkbackPath: newPath,
        walkbackPathSegmentDistances: pathSegmentDistances,
        walkbackPathSegmentElevations: newElevationProfile,
      },
    ])
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
  if (elevationResponse.meta.requestStatus === "fulfilled") {
    newElevationProfile = elevationResponse.payload as number[][];
  }

  //update store
  dispatch(
    upsertStations([
      {
        ...station,
        walkbackPath: newPath,
        walkbackPathSegmentDistances: newPathSegmentDistances,
        walkbackPathSegmentElevations: newElevationProfile,
      },
    ])
  );
});

export const thunkSaveStation = appCreateAsyncThunk<{
  stationUuid: string;
}>("stationSave", async ({ stationUuid }, { dispatch, getState }) => {
  if (!stationUuid) return;
  const newStation = getState().station.stations.find((s) => s.uuid === stationUuid);
  const oldStation = getState().station.stationsFromDb.find((s) => s.uuid === stationUuid);

  const stationActions = getState().action.actions.filter(
    (action) => action.stationUuid === newStation.uuid
  );
  const stationActionsFromDb = getState().action.actionsFromDb.filter(
    (action) => action.stationUuid === newStation.uuid
  );

  // update traverse names around this station in any eva using this station
  // if the station location has changed, the traverse was already updated in thunkUpdateStationLocation
  if (!isEqual(newStation.name, oldStation?.name)) {
    await dispatch(
      thunkUpdateTraversesAroundStation({ stationUuid: newStation.uuid, saveToDb: true })
    );
  }

  // check if station has been modified. this may not be the case if the user only changed actions
  if (!isEqual(newStation, oldStation)) {
    // upsert the changed Station to the DB via internal API call
    const updatedStation = {
      ...newStation,
      updatedAt: getAccurateNow().toISOString(),
    };
    const stationUpsertResponse = await httpClient_station.upsertStations([updatedStation]);

    if (stationUpsertResponse.status !== "success") {
      throw new Error("Error upserting Station: " + stationUpsertResponse.message);
    }
    // upsert the changed Station (with new updated date) to the store
    dispatch(upsertStations([updatedStation], true));
    // update the StationFromDb copy in store
    dispatch(upsertStationsFromDb([updatedStation]));
  }

  // find out if the actions in this station have been modified and need to be persisted
  if (!isEqual(stationActions, stationActionsFromDb)) {
    dispatch(
      thunkSaveActions({
        actions: stationActions,
        actionsFromDb: stationActionsFromDb,
      })
    );
  }

  // if the walkback is in edit mode, cancel it out
  const stationMapDirective =
    getState().map.mapDirective?.uuid === newStation.uuid ? getState().map.mapDirective : null;
  if (stationMapDirective?.mapAction === "editPolyline") {
    // handle walkback edit state
    dispatch(
      updateMapDirective({
        ...stationMapDirective,
        mapAction: "saveEditPolyline",
      })
    );
  }

  dispatch(thunkCancelMarkerMapDirective({ uuid: newStation.uuid }));
  dispatch(setStationEditMode({ stationUuid: newStation.uuid, editMode: false }));
  dispatch(resetAllStationCirclesUIStates({ stationUuid: newStation.uuid }));
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
    dispatch(upsertStations([stationFromDb], true));

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
    dispatch(deleteStationsByUuid([station.uuid]));
    dispatch(setSelectedStationUuid(null));
    dispatch(deleteActionsByUuid(stationActions.map((a) => a.uuid)));
    dispatch(thunkSetRightPanelIsOpenIfAuto(false));
    dispatch(
      thunkAddRemoveFolderItem({
        itemUuid: station.uuid,
        folderUuid: null,
      })
    );
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

/**
 * Deletes stations and their actions from the store and db
 */
export const thunkDeleteStations = appCreateAsyncThunk<{
  stationUuids: string[];
  skipValidation?: boolean;
}>("stationsDelete", async ({ stationUuids, skipValidation = false }, { dispatch, getState }) => {
  if (!stationUuids || stationUuids.length === 0) return;

  // validate before doing anything
  // validation is skipped for rex evas so we do not need to worry about finding the as-planned eva name
  if (!skipValidation) {
    for (const eva of getState().eva.evas) {
      // check if this station is in the eva sequence
      if (eva.sequence.length > 0) {
        const sequenceItem = eva.sequence.find((sequenceItem) =>
          stationUuids.includes(sequenceItem.uuid)
        );
        if (sequenceItem) {
          const stationName = getState().station.stations.find(
            (station) => station.uuid === sequenceItem.uuid
          )?.name;
          alert(
            `Cannot delete a station that is being used by an EVA.
          \nStation not deleted.
          \nEVA ${eva.name} is using this station ${stationName}`
          );
          return;
        }
      }

      // check if this station is used as ingress/egress
      if (stationUuids.includes(eva.ingressLocationUuid)) {
        const stationName = getState().station.stations.find(
          (station) => station.uuid === eva.ingressLocationUuid
        )?.name;
        alert(
          `Cannot delete a station that is being used as an ingress location in an EVA.
        \nStation not deleted.
        \nEVA ${eva.name} is using this station ${stationName}`
        );
        return;
      }
      if (stationUuids.includes(eva.egressLocationUuid)) {
        const stationName = getState().station.stations.find(
          (station) => station.uuid === eva.egressLocationUuid
        )?.name;
        alert(
          `Cannot delete a station that is being used as an egress location in an EVA.\nEVA ${eva.name} is using this station ${stationName}`
        );
        return;
      }
    }
  }

  const stationActionUuidsToDelete: string[] = [];
  for (const stationUuid of stationUuids) {
    dispatch(thunkCancelMarkerMapDirective({ uuid: stationUuid })); // first cancel any map marker directives
    dispatch(setStationEditMode({ stationUuid: stationUuid, editMode: false })); // cancel station if it's in edit mode

    // update folders
    dispatch(
      thunkAddRemoveFolderItem({
        itemUuid: stationUuid,
        folderUuid: null,
      })
    );

    // gather all the actions to delete
    const stationActions = getState().action.actions.filter(
      (action) => action.stationUuid === stationUuid
    );
    stationActionUuidsToDelete.push(...stationActions.map((a) => a.uuid));
  }
  if (stationActionUuidsToDelete.length > 0) {
    // delete station's actions from store and db
    await dispatch(thunkDeleteActionsFromDbAndStore({ uuids: stationActionUuidsToDelete }));
  }
  // delete any stations that were in the db in one bulk http call
  const stationUuidsInDb = stationUuids.filter((uuid) =>
    getState()
      .station.stationsFromDb.map((s) => s.uuid)
      .includes(uuid)
  );
  if (stationUuidsInDb.length > 0) {
    const deleteRes: WrappedResponse<number> =
      await httpClient_station.deleteStations(stationUuidsInDb);
    if (deleteRes.status !== "success") {
      throw new Error("Error deleting Stations: " + deleteRes.message);
    }
  }
  // delete stations from both copies in the store
  dispatch(deleteStationsByUuid(stationUuids));
  dispatch(deleteStationsFromDbByUuid(stationUuids));
  dispatch(setSelectedStationUuid(null));
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
    const missionCircleDefinitions = getState().mission.mission?.circleDefinitions;
    if (missionCircleDefinitions) {
      Object.entries(missionCircleDefinitions)?.forEach(([uuid, landerRadius]) => {
        blankMapCircleControls[uuid] = {
          name: landerRadius.name,
          uuid: uuid,
          visible: false,
          style: defaultSublayerStyle,
        };
      });
    }

    const blankStation = generateBlankStation({
      missionId: getState().mission.mission?.id,
      name: randomName,
      mapCircleControls: blankMapCircleControls,
    });
    dispatch(upsertStations([blankStation], false));
    dispatch(selectStation({ uuid: blankStation.uuid }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));
    dispatch(setStationEditMode({ stationUuid: blankStation.uuid, editMode: true }));

    // create station circles ui states entry
    const circleUIStates: CircleUIStates = {};
    if (missionCircleDefinitions) {
      Object.entries(missionCircleDefinitions)?.forEach(([uuid, circleDefinition]) => {
        circleUIStates[uuid] = {
          name: circleDefinition.name,
          slidersSelected: false,
        };
      });
    }

    dispatch(
      setStationCircleUIStates({
        stationUuid: blankStation.uuid,
        circleUIStates: circleUIStates,
      })
    );
  }
);

/**
 * Duplicate a station and automatically save it to the DB
 */
export const thunkDuplicateStation = appCreateAsyncThunk<
  { stationUuid: String; preserveRefUuid: boolean },
  Station,
  false
>("stationDuplicate", async ({ stationUuid, preserveRefUuid }, { dispatch, getState }) => {
  if (!stationUuid) return;
  const station = getState().station.stations.find((s) => s.uuid === stationUuid);
  //duplicate station
  const newStation: Station = cloneDeep(station);
  newStation.uuid = uuidv4();
  // preservingRefUuids only occurs when duplicating an EVA for a REX.
  if (!preserveRefUuid) {
    newStation.refUuid = uuidv4();
    const newDateString = getAccurateNow().toISOString();
    newStation.updatedAt = newDateString;
    newStation.createdAt = newDateString;
    newStation.name = makeUniqueStringCopy(
      station.name,
      getState().station.stations.map((s) => s.name)
    );
  }
  newStation.actionOrderUuids = [];

  // upsert new station and persist to the db
  dispatch(upsertStations([newStation], true));
  dispatch(upsertStationsFromDb([newStation]));
  const upsertStationResponse = await httpClient_station.upsertStations([newStation]);
  if (upsertStationResponse.status !== "success") {
    throw new Error("Error upserting Station: " + upsertStationResponse.message);
  }

  if (!preserveRefUuid) {
    dispatch(selectStation({ uuid: newStation.uuid }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));
  }

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
      preserveRefUuid: preserveRefUuid,
      saveToDb: true,
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
});

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
