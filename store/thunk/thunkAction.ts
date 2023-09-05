import {
  deleteActionByUuid,
  deleteActionsFromDbByUuid,
  setActions,
  setActionsFromDb,
  upsertAction,
  upsertActionFromDb,
  upsertActionsFromDb,
} from "store/action";
import appCreateAsyncThunk from "./thunkUtil";
import { generateUniqueName } from "utils/names/unique-name";
import { v4 as uuidv4 } from "uuid";
import _ from "lodash";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { isModified } from "utils/component-helpers";
import { thunkGetElevation } from "./thunkElevation";
import { setStations, setStationsFromDb, upsertStation } from "store/station";
import { setPois, setPoisFromDb, upsertPoi } from "store/poi";
import * as httpClient_action from "http-client/action";
import * as httpClient_station from "http-client/station";
import * as httpClient_poi from "http-client/poi";

export const thunkCreateAction = appCreateAsyncThunk<{
  actionParentUuid: ActionParentUuid;
  actionOrderUuids: string[];
  setActionOrderUuids: (actionOrderUuids: string[]) => void;
  actionTemplate?: ActionTemplate;
}>(
  "actionCreate",
  async (
    { actionParentUuid, actionOrderUuids, setActionOrderUuids, actionTemplate },
    { dispatch, getState }
  ) => {
    const randomName = generateUniqueName({
      dictName: "starTrek",
      existingNames: getState().action.actions.map((a: Action) => a.name),
    });

    let blankAction: Action = {
      ...actionParentUuid,
      missionId: getState().mission.mission?.id,
      uuid: uuidv4(),
      name: randomName,
      description: "",
      icon: "26cf-fe0f", //default pickaxe icon
      location: null,
      elevation: null,
      status: "Candidate",
      enabled: true,
      type: "other",
      durationLower: 5,
      durationUpper: 6,
      stmUuidRefs: null,
      equipmentItemsUsage: null,
      geographicUnitsUsage: null,
      crewAssigned: [],
      mass: null,
      priority: null,
      updatedAt: null,
      createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    };

    if (actionTemplate) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { templateName, uuid, ...rest } = actionTemplate;
      blankAction = { ...blankAction, ...rest };
    }

    //upsert action
    dispatch(upsertAction(blankAction));

    //upsert action order to the parent. new action goes on the end.
    const actionOrder = _.cloneDeep(actionOrderUuids);
    actionOrder.push(blankAction.uuid);
    setActionOrderUuids(actionOrder);
  }
);

/**
 * Duplicates an action and then calls {@link upsertAction} reducer
 * @Returns the new action UUID created
 */
export const thunkDuplicateAction = appCreateAsyncThunk<
  {
    action: Action;
    stationUuid?: string;
    poiUuid?: string;
    promotingFromPoi?: boolean;
    handleActionOrderProcessing?: boolean;
  },
  string,
  false
>(
  "actionDuplicate",
  async (
    { action, stationUuid, poiUuid, promotingFromPoi, handleActionOrderProcessing = true },
    { dispatch, getState }
  ) => {
    if (!action) return;
    const newActionUuid = uuidv4();
    const newAction: Action = _.cloneDeep(action);
    newAction.uuid = newActionUuid;
    newAction.createdAt = roundDateToSecond(getAccurateNow()).toISOString();
    newAction.updatedAt = null;
    newAction.stationUuid = stationUuid;
    newAction.poiUuid = poiUuid;

    //set new duplicated name in the scope of the station or poi
    if (stationUuid) {
      const stationActions = getState().action.actions.filter(
        (storeAction: Action) => storeAction.stationUuid === stationUuid
      );
      newAction.name = makeUniqueStringCopy(
        newAction.name,
        stationActions.map((a) => a.name)
      );

      // append new action to the end of the station's action order
      if (handleActionOrderProcessing) {
        const station = getState().station.stations.find((s) => s.uuid === stationUuid);
        let actionOrderUuids = _.cloneDeep(station.actionOrderUuids);
        if (!actionOrderUuids) actionOrderUuids = [];
        actionOrderUuids.push(newActionUuid);
        dispatch(upsertStation({ ...station, actionOrderUuids }, true));
      }
    } else if (poiUuid) {
      const poiActions = getState().action.actions.filter(
        (storeAction: Action) => storeAction.poiUuid === poiUuid
      );
      newAction.name = makeUniqueStringCopy(
        newAction.name,
        poiActions.map((a) => a.name)
      );

      // append new action to the end of the poi's action order
      if (handleActionOrderProcessing) {
        const poi = getState().poi.pois.find((p) => p.uuid === poiUuid);
        let actionOrderUuids = _.cloneDeep(poi.actionOrderUuids);
        if (!actionOrderUuids) actionOrderUuids = [];
        actionOrderUuids.push(newActionUuid);
        dispatch(upsertPoi({ ...poi, actionOrderUuids }, true));
      }
    }

    if (promotingFromPoi) {
      newAction.parentActionUuid = action.uuid;
      newAction.parentCopyDate = roundDateToSecond(getAccurateNow()).toISOString();
    } else {
      newAction.parentActionUuid = action.parentActionUuid;
      newAction.parentCopyDate = action.parentCopyDate;
    }

    dispatch(upsertAction(newAction));
    return newActionUuid;
  }
);

/**
 * Saves changed/added/deleted actions to the store, fromDB store, and the database
 */
export const thunkSaveActions = appCreateAsyncThunk<{
  actions: Action[];
  actionsFromDb: Action[];
  stationUuid?: string;
  poiUuid?: string;
}>(
  "actionSave",
  async (
    { actions, actionsFromDb, stationUuid = null, poiUuid = null },
    { dispatch, getState }
  ) => {
    //upsert any changed or new Actions to db
    for (const action of actions) {
      if (isModified([action], [actionsFromDb.find((a) => a.uuid === action.uuid)])) {
        //action changed. upsert to db
        const actionUpsertResponse = await httpClient_action.upsertAction({
          ...action,
          updatedAt: roundDateToSecond(new Date()).toISOString(),
        });
        if (actionUpsertResponse.status === "success") {
          //upsert to both stores
          dispatch(upsertAction(actionUpsertResponse.data, true));
          dispatch(upsertActionFromDb(actionUpsertResponse.data));
        }
      }
    }

    // filter out deleted actions using local state
    const deletedActions: Action[] = actionsFromDb.filter((actionDb) => {
      const found = actions.some((a) => {
        return a.uuid === actionDb.uuid;
      });
      return !found;
    });
    // take array of deleted actions and delete them in the db
    for (const deletedAction of deletedActions) {
      await httpClient_action.deleteAction(deletedAction.uuid);
    }

    // clear the store copy of the db and reload
    dispatch(deleteActionsFromDbByUuid(actionsFromDb.map((a) => a.uuid)));

    const actionData = await httpClient_action.getActions({
      missionId: getState().mission.mission?.id,
      stationUuid: stationUuid,
      poiUuid: poiUuid,
    });
    if (actionData.data?.length > 0) {
      dispatch(upsertActionsFromDb(actionData.data));
    }
  }
);

export const thunkUpdateActionLocation = appCreateAsyncThunk<{
  location: AEGISPoint;
  actionUuid: string;
}>("updateActionLocation", async ({ location, actionUuid }, { dispatch, getState }) => {
  const elevation = await dispatch(
    thunkGetElevation({
      path: [location],
      pathSegmentDistances: [0],
      uuid: actionUuid,
    })
  );

  const action = getState().action.actions.find((s) => s.uuid === actionUuid);
  if (elevation.payload === false) {
    //gracefully reject?
  } else {
    //upsert location and elevation
    dispatch(upsertAction({ ...action, location, elevation: elevation.payload as number }));
  }
});

export const thunkGetHighlightedActions = appCreateAsyncThunk<
  { actionUuids: string[]; stmUuid: string },
  ActionHighlight[],
  undefined
>("actionGetHighlightedActions", async ({ actionUuids, stmUuid }, { getState }) => {
  const actions = getState().action.actions.filter((a) => actionUuids.includes(a.uuid));
  const actionHighlights = [];
  for (const action of actions) {
    const highlight = { uuid: action.uuid, highlight: false };
    if (action.stmUuidRefs && stmUuid) {
      for (const actionSTMUuid of action.stmUuidRefs) {
        if (actionSTMUuid === stmUuid) {
          highlight.highlight = true;
        }
      }
    }
    actionHighlights.push(highlight);
  }
  return actionHighlights;
});

export const thunkDeleteAction = appCreateAsyncThunk<{
  uuid: string;
}>("deleteAction", async ({ uuid }, { dispatch, getState }) => {
  // look for the action in stations and remove it from the station's action order
  getState().station.stations.forEach((station) => {
    const actionOrderUuids = _.cloneDeep(station.actionOrderUuids);
    if (actionOrderUuids) {
      const actionIndex = actionOrderUuids.findIndex((actionUuid) => actionUuid === uuid);
      if (actionIndex >= 0) {
        // delete the action from the station
        actionOrderUuids.splice(actionIndex, 1);
        dispatch(upsertStation({ ...station, actionOrderUuids }, false));
      }
    }
  });

  // look for the action in pois and remove it from the poi's action order
  getState().poi.pois.forEach((poi) => {
    const actionOrderUuids = _.cloneDeep(poi.actionOrderUuids);
    if (actionOrderUuids) {
      const actionIndex = actionOrderUuids.findIndex((actionUuid) => actionUuid === uuid);
      if (actionIndex >= 0) {
        // delete the action from the poi
        actionOrderUuids.splice(actionIndex, 1);
        dispatch(upsertPoi({ ...poi, actionOrderUuids }, false));
      }
    }
  });

  // delete the action from the store
  dispatch(deleteActionByUuid(uuid));
});

/**
 * Audits and rectonciles the actionOrderUuids in stations and pois with the actions table
 */
export const thunkAuditActions = appCreateAsyncThunk<void>(
  "auditActions",
  async (__, { dispatch, getState }) => {
    // new stores to hold the updated values to be persisted at the end of all the audits
    const newStations = _.cloneDeep(getState().station.stations);
    const newPois = _.cloneDeep(getState().poi.pois);
    const newActions = _.cloneDeep(getState().action.actions);

    /**
     * ActionOrderUuid Audit #1
     * Audit actionOrderUuid values and append any action uuids that are not in the actionOrderUuids
     * but listed the station or poi as their stationUuid or poiUuid
     * This is needed because actionOrderUuids was not mandatory in the database until recently
     */
    for (const action of newActions) {
      if (action.stationUuid) {
        const station = newStations.find((station) => station.uuid === action.stationUuid);
        if (station) {
          const actionOrderUuids = station.actionOrderUuids || [];
          if (!actionOrderUuids.some((actionOrderUuid) => actionOrderUuid === action.uuid)) {
            console.log(`Adding action ${action.name} to station ${station.name}`);
            newStations.forEach((newStation) => {
              if (newStation.uuid === station.uuid) {
                newStation.actionOrderUuids = [...actionOrderUuids, action.uuid];
              }
            });
          }
        }
      } else if (action.poiUuid) {
        const poi = newPois.find((poi) => poi.uuid === action.poiUuid);
        if (poi) {
          const actionOrderUuids = poi.actionOrderUuids || [];
          if (!actionOrderUuids.some((actionOrderUuid) => actionOrderUuid === action.uuid)) {
            console.log(`Adding action ${action.name} to poi ${poi.name}`);
            newPois.forEach((newPoi) => {
              if (newPoi.uuid === poi.uuid) {
                newPoi.actionOrderUuids = [...actionOrderUuids, action.uuid];
              }
            });
          }
        }
      }
    }

    /**
     * ActionOrderUuid Audit #2
     * Ensure that each action's stationUuid or poiUuid is correct based on the list in station or poi actionOrderUuids
     * This is needed because the JETT3 mission contains a bunch of actions that are referenced in multiple stations and pois actionOrderUuids lists
     */
    for (const station of newStations) {
      const newActionOrderUuids = _.cloneDeep(station.actionOrderUuids);
      station.actionOrderUuids.forEach((actionOrderUuid, orderIdIndex) => {
        const action = newActions.find((action) => action.uuid === actionOrderUuid);
        if (action) {
          if (action.stationUuid !== station.uuid) {
            // duplicate this action and make its stationUuid match the station. Also update actionOrderUuids to use the new action uuid instead of the old one
            const oldStationName = newStations.find((s) => s.uuid === action.stationUuid)?.name;
            console.log(
              `Duplicating action ${action.name} that was associated with ${oldStationName} to associate with station ${station.name}`
            );

            // duplicate the action manually
            const newActionUuid = uuidv4();
            const newAction = _.cloneDeep(action);
            newAction.uuid = newActionUuid;
            newAction.stationUuid = station.uuid;
            newActions.push(newAction);

            newActionOrderUuids.splice(orderIdIndex, 1, newActionUuid);
            newStations.forEach((newStation) => {
              if (newStation.uuid === station.uuid) {
                newStation.actionOrderUuids = newActionOrderUuids;
              }
            });
          }
        }
      });
    }
    for (const poi of newPois) {
      const newActionOrderUuids = _.cloneDeep(poi.actionOrderUuids);
      poi.actionOrderUuids.forEach(async (actionOrderUuid, orderIdIndex) => {
        const action = newActions.find((action) => action.uuid === actionOrderUuid);
        if (action) {
          if (action.poiUuid !== poi.uuid) {
            // duplicate this action and make its poiUuid match the poi. Also update actionOrderUuids to use the new action uuid instead of the old one
            const oldPoiName = newPois.find((p) => p.uuid === action.poiUuid)?.name;
            console.log(
              `Duplicating action ${action.name} that was associated with ${oldPoiName} to associate with poi ${poi.name}`
            );

            // duplicate the action manually
            const newActionUuid = uuidv4();
            const newAction = _.cloneDeep(action);
            newAction.uuid = newActionUuid;
            newAction.poiUuid = poi.uuid;
            newActions.push(newAction);

            newActionOrderUuids.splice(orderIdIndex, 1, newActionUuid);
            newPois.forEach((newPoi) => {
              if (newPoi.uuid === poi.uuid) {
                newPoi.actionOrderUuids = newActionOrderUuids;
              }
            });
          }
        }
      });
    }

    /**
     * ActionOrderUuid Audit #3
     * Audit actionOrderUuid values and remove any that don't exist in the actions table for this mission
     * This fixes the remnants of the bug #424 that was leaving action uuids in the actionOrderUuids list after the action was deleted
     */
    for (const station of newStations) {
      const stationActions = newActions.filter((action) => action.stationUuid === station.uuid);
      const actionOrderUuids = station.actionOrderUuids || [];
      const newActionOrderUuids = _.cloneDeep(actionOrderUuids);
      // check for actions in newActionOrderUuids that are not in stationActions and remove them
      actionOrderUuids.forEach((actionOrderUuid) => {
        if (!stationActions.some((action) => action.uuid === actionOrderUuid)) {
          newActionOrderUuids.splice(newActionOrderUuids.indexOf(actionOrderUuid), 1);
        }
      });
      if (!_.isEqual(newActionOrderUuids, actionOrderUuids)) {
        console.log(
          `updating station actionOrderUuids for station ${station.name} because actionOrderUuids contained non-existent actions`
        );
        newStations.forEach((newStation) => {
          if (newStation.uuid === station.uuid) {
            newStation.actionOrderUuids = newActionOrderUuids;
          }
        });
      }
    }
    for (const poi of newPois) {
      const poiActions = newActions.filter((action) => action.poiUuid === poi.uuid);
      const actionOrderUuids = poi.actionOrderUuids || [];
      const newActionOrderUuids = _.cloneDeep(actionOrderUuids);
      // check for actions in newActionOrderUuids that are not in poiActions and remove them
      actionOrderUuids.forEach((actionOrderUuid) => {
        if (!poiActions.some((action) => action.uuid === actionOrderUuid)) {
          newActionOrderUuids.splice(newActionOrderUuids.indexOf(actionOrderUuid), 1);
        }
      });
      if (!_.isEqual(newActionOrderUuids, actionOrderUuids)) {
        console.log(
          `updating poi actionOrderUuids for poi ${poi.name} because actionOrderUuids contained non-existent actions`
        );
        newPois.forEach((newPoi) => {
          if (newPoi.uuid === poi.uuid) {
            newPoi.actionOrderUuids = newActionOrderUuids;
          }
        });
      }
    }

    /**
     * ActionOrderUuid Audit #4
     * Audit the actions table for this mission and remove any actions that are not in the station or poi actionOrderUuids
     * Generally added to make sure there are no orphans in the database. None have been found.
     */
    const actionsToDelete = _.cloneDeep(newActions);
    for (const station of newStations) {
      const actionOrderUuids = station.actionOrderUuids || [];
      actionOrderUuids.forEach((actionOrderUuid) => {
        const action = actionsToDelete.find((action) => action.uuid === actionOrderUuid);
        if (action) {
          actionsToDelete.splice(actionsToDelete.indexOf(action), 1);
        }
      });
    }
    for (const thisPoi of newPois) {
      const actionOrderUuids = thisPoi.actionOrderUuids || [];
      actionOrderUuids.forEach((actionOrderUuid) => {
        const action = actionsToDelete.find((action) => action.uuid === actionOrderUuid);
        if (action) {
          actionsToDelete.splice(actionsToDelete.indexOf(action), 1);
        }
      });
    }
    if (actionsToDelete.length > 0) {
      console.log("deleting actions that are not in any station or poi actionOrderUuids");
      actionsToDelete.forEach((action) => {
        console.log("deleting action " + action.name);
        newActions.forEach((newAction) => {
          if (newAction.uuid === action.uuid) {
            newActions.splice(newActions.indexOf(newAction), 1);
          }
        });
      });
    }

    // update the store and db with the new values
    if (!_.isEqual(newStations, getState().station.stations)) {
      newStations.forEach((station) => {
        if (
          !_.isEqual(
            station,
            getState().station.stations.find((s) => s.uuid === station.uuid)
          )
        ) {
          httpClient_station.upsertStation(station);
        }
      });
      dispatch(setStations(newStations));
      dispatch(setStationsFromDb(newStations));
    }
    if (!_.isEqual(newPois, getState().poi.pois)) {
      newPois.forEach((poi) => {
        if (
          !_.isEqual(
            poi,
            getState().poi.pois.find((p) => p.uuid === poi.uuid)
          )
        ) {
          httpClient_poi.upsertPOI(poi);
        }
      });
      dispatch(setPois(newPois));
      dispatch(setPoisFromDb(newPois));
    }
    if (!_.isEqual(newActions, getState().action.actions)) {
      newActions.forEach((action) => {
        if (
          !_.isEqual(
            action,
            getState().action.actions.find((a) => a.uuid === action.uuid)
          )
        )
          httpClient_action.upsertAction(action);
      });
      dispatch(setActions(newActions));
      dispatch(setActionsFromDb(newActions));
    }
  }
);
