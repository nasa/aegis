import {
  deleteActionsByUuid,
  deleteActionsFromDbByUuid,
  upsertActions,
  upsertActionByField,
  upsertActionsFromDb,
} from "store/action";
import appCreateAsyncThunk from "./thunkUtil";
import { generateUniqueName } from "utils/names/unique-name";
import { v4 as uuidv4 } from "uuid";
import cloneDeep from "lodash/cloneDeep";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { getAccurateNow } from "utils/formatting";
import { isModified } from "utils/component-helpers";
import { thunkGetElevation } from "./thunkElevation";
import { upsertStationByField, upsertStationsFromDb } from "store/station";
import { upsertPoiByField, upsertPoisFromDb } from "store/poi";
import * as httpClient_action from "http-client/action";
import * as httpClient_station from "http-client/station";
import * as httpClient_poi from "http-client/poi";
import * as httpClient_traverse from "http-client/traverse";
import { generateBlankAction } from "store/storeUtils/action";
import { upsertTraverseByField, upsertTraversesFromDb } from "store/traverse";

export const thunkCreateAction = appCreateAsyncThunk<
  {
    actionParentUuid: ActionParentUuid;
    actionOrderUuids: string[];
    setActionOrderUuids: (actionOrderUuids: string[]) => void;
    actionTemplate?: ActionTemplate;
  },
  string
>(
  "actionCreate",
  async (
    { actionParentUuid, actionOrderUuids, setActionOrderUuids, actionTemplate },
    { dispatch, getState }
  ) => {
    const actionUuid = uuidv4();
    const randomName = generateUniqueName({
      dictName: "starTrek",
      existingNames: getState().action.actions.map((a: Action) => a.name),
    });

    let blankAction = generateBlankAction({
      ...actionParentUuid,
      missionId: getState().mission.mission.id,
      uuid: actionUuid,
      name: randomName,
      stmAction: getState().mission.mission.actionSystemVersion === 2,
    });

    if (actionTemplate) {
      // strip out the fields we don't want to copy into the new action
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { templateName, createdAt, updatedAt, ...rest } = actionTemplate;
      blankAction = { ...blankAction, ...rest };
    }

    //upsert action
    dispatch(upsertActions([blankAction]));

    //upsert action order to the parent. new action goes on the end.
    const actionOrder = cloneDeep(actionOrderUuids || []);
    actionOrder.push(blankAction.uuid);
    setActionOrderUuids(actionOrder);

    return actionUuid;
  }
);

/**
 * Duplicates actions
 * @param actions array of actions to duplicate
 * @param preserveRefUuid whether or not to preserve the refUuid of the action. Used when creating an rex
 * @param saveToDb Whether or not to save the duplicated action to the db. Used when duplication is triggered from a station, poi, or traverse.
 *                 When actions are duplicated from the action panel, or from promoting to a poi, this is false
 * @param stationUuid the station the duplicated action belongs to
 * @param poiUuid the poi the duplicated action belongs to
 * @param traverseUuid the traverse the duplicated action belongs to
 * @param promotingFromPoi whether or not this action is duplicated because it's being promoted from a poi to a station
 * @Returns the new action UUID created
 */
export const thunkDuplicateActions = appCreateAsyncThunk<{
  actions: Action[];
  preserveRefUuid: boolean;
  saveToDb: boolean;
  stationUuid?: string;
  poiUuid?: string;
  traverseUuid?: string;
  promotingFromPoi?: boolean;
}>(
  "actionsDuplicate",
  async (
    { actions, preserveRefUuid, saveToDb, stationUuid, traverseUuid, poiUuid, promotingFromPoi },
    { dispatch, getState }
  ) => {
    if (!actions || actions.length === 0) return;
    const stationActions = getState().action.actions.filter(
      (storeAction: Action) => storeAction.stationUuid === stationUuid
    );
    const poiActions = getState().action.actions.filter(
      (storeAction: Action) => storeAction.poiUuid === poiUuid
    );
    const traverseActions = getState().action.actions.filter(
      (storeAction: Action) => storeAction.traverseUuid === traverseUuid
    );

    const newActions: Action[] = cloneDeep(actions);
    //set values for the duplicated action
    for (let i = 0; i < newActions.length; i++) {
      const newAction = newActions[i];
      newAction.uuid = uuidv4();
      newAction.stationUuid = stationUuid;
      newAction.poiUuid = poiUuid;
      newAction.traverseUuid = traverseUuid;

      // preservingRefUuids only occurs when duplicating an EVA for a REX.
      if (!preserveRefUuid) {
        newAction.refUuid = uuidv4();
        const newDateString = getAccurateNow().toISOString();
        newAction.createdAt = newDateString;
        newAction.updatedAt = newDateString;
        // set name
        if (stationUuid) {
          newAction.name = makeUniqueStringCopy(
            newAction.name,
            stationActions.map((a) => a.name)
          );
        } else if (poiUuid) {
          newAction.name = makeUniqueStringCopy(
            newAction.name,
            poiActions.map((a) => a.name)
          );
        } else if (traverseUuid) {
          newAction.name = makeUniqueStringCopy(
            newAction.name,
            traverseActions.map((a) => a.name)
          );
        }
      }

      //set parent info
      if (promotingFromPoi) {
        newAction.parentActionUuid = actions[i].uuid;
        newAction.parentCopyDate = getAccurateNow().toISOString();
      } else {
        newAction.parentActionUuid = actions[i].parentActionUuid;
        newAction.parentCopyDate = actions[i].parentCopyDate;
      }
    }

    // append new actions to the end of the station's action order
    if (stationUuid) {
      const station = getState().station.stations.find((s) => s.uuid === stationUuid);
      let actionOrderUuids = cloneDeep(station.actionOrderUuids);
      if (!actionOrderUuids) actionOrderUuids = [];
      actionOrderUuids = actionOrderUuids.concat(newActions.map((a) => a.uuid));
      dispatch(upsertStationByField(stationUuid, "actionOrderUuids", actionOrderUuids, true));
      if (saveToDb) {
        dispatch(upsertStationsFromDb([{ ...station, actionOrderUuids }]));
        const upsertStationsResponse = await httpClient_station.upsertStations([
          { ...station, actionOrderUuids },
        ]);
        if (upsertStationsResponse.status !== "success") {
          throw new Error(
            "Error upserting stations in duplicate action " + upsertStationsResponse.message
          );
        }
      }
    } else if (poiUuid) {
      // append new action to the end of the poi's action order
      const poi = getState().poi.pois.find((p) => p.uuid === poiUuid);
      let actionOrderUuids = cloneDeep(poi.actionOrderUuids);
      if (!actionOrderUuids) actionOrderUuids = [];
      actionOrderUuids = actionOrderUuids.concat(newActions.map((a) => a.uuid));
      dispatch(upsertPoiByField(poiUuid, "actionOrderUuids", actionOrderUuids, true));
      if (saveToDb) {
        dispatch(upsertPoisFromDb([{ ...poi, actionOrderUuids }]));
        const upsertPoisResponse = await httpClient_poi.upsertPOIs([{ ...poi, actionOrderUuids }]);
        if (upsertPoisResponse.status !== "success") {
          throw new Error("Error upserting pois in duplicate action " + upsertPoisResponse.message);
        }
      }
    } else if (traverseUuid) {
      // append new action to the end of the traverse's action order
      const traverse = getState().traverse.traverses.find((t) => t.uuid === traverseUuid);
      let actionOrderUuids = cloneDeep(traverse.actionOrderUuids);
      if (!actionOrderUuids) actionOrderUuids = [];
      actionOrderUuids = actionOrderUuids.concat(newActions.map((a) => a.uuid));
      dispatch(upsertTraverseByField(traverseUuid, "actionOrderUuids", actionOrderUuids, true));
      if (saveToDb) {
        dispatch(upsertTraversesFromDb([{ ...traverse, actionOrderUuids }]));
        const upsertTraversesResponse = await httpClient_traverse.upsertTraverses([
          { ...traverse, actionOrderUuids },
        ]);
        if (upsertTraversesResponse.status !== "success") {
          throw new Error(
            "Error upserting traverses in duplicate action " + upsertTraversesResponse.message
          );
        }
      }
    }

    //upsert new actions and persist to db
    dispatch(upsertActions(newActions, true));
    if (saveToDb) {
      dispatch(upsertActionsFromDb(newActions));
      const upsertActionsResponse = await httpClient_action.upsertActions(newActions);
      if (upsertActionsResponse.status !== "success") {
        throw new Error("Error upserting actions " + upsertActionsResponse.message);
      }
    }
  }
);

/**
 * Saves changed/added/deleted actions to the store, fromDB store, and the database
 */
export const thunkSaveActions = appCreateAsyncThunk<{
  actions: Action[];
  actionsFromDb: Action[];
}>("actionSave", async ({ actions, actionsFromDb }, { dispatch }) => {
  //upsert any changed or new Actions to db
  const changedActions: Action[] = [];
  for (const action of actions) {
    if (isModified([action], [actionsFromDb.find((a) => a.uuid === action.uuid)])) {
      changedActions.push({
        ...action,
        updatedAt: getAccurateNow().toISOString(),
      });
    }
  }
  if (changedActions.length > 0) {
    //action changed. upsert to db
    const actionUpsertResponse = await httpClient_action.upsertActions(changedActions);
    if (actionUpsertResponse.status !== "success") {
      throw new Error("Error upserting actions " + actionUpsertResponse.message);
    }
    //upsert to both stores
    dispatch(upsertActions(changedActions, true));
    dispatch(upsertActionsFromDb(changedActions));
  }

  // filter out deleted actions using local state
  const deletedActions: Action[] = actionsFromDb.filter((actionDb) => {
    const found = actions.some((a) => {
      return a.uuid === actionDb.uuid;
    });
    return !found;
  });
  if (deletedActions.length > 0) {
    // take array of deleted actions and delete them in the db
    const deletedActionUuids = deletedActions.map((a) => a.uuid);
    const actionDeleteRes = await httpClient_action.deleteActions(deletedActionUuids);
    if (actionDeleteRes.status !== "success") {
      throw new Error("Error deleting actions " + actionDeleteRes.message);
    }
    dispatch(deleteActionsFromDbByUuid(deletedActionUuids));
  }
});

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
  if (elevation.meta.requestStatus === "rejected") {
    // elevation failed, upsert without it
    dispatch(upsertActions([{ ...action, location, elevation: null }]));
  } else {
    //upsert location and elevation
    dispatch(upsertActions([{ ...action, location, elevation: elevation.payload as number }]));
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
    const highlight: ActionHighlight = { uuid: action.uuid, highlight: false };
    if (action.stmPriorities && stmUuid) {
      for (const actionSTMUuid of Object.keys(action.stmPriorities)) {
        if (actionSTMUuid === stmUuid) {
          highlight.highlight = true;
        }
      }
    }
    actionHighlights.push(highlight);
  }
  return actionHighlights;
});

/**
 * Deletes an action from a station or poi and also from the store (but not from db)
 */
export const thunkDeleteActionFromStore = appCreateAsyncThunk<{
  uuid: string;
}>("deleteActionFromStore", async ({ uuid }, { dispatch, getState }) => {
  const action = getState().action.actions.find((a) => a.uuid === uuid);

  if (action.stationUuid) {
    // look for the action in stations and remove it from the station's action order
    const station = getState().station.stations.find((s) => s.uuid === action.stationUuid);
    const actionOrderUuids = cloneDeep(station.actionOrderUuids);
    if (actionOrderUuids) {
      const actionIndex = actionOrderUuids.findIndex((actionUuid) => actionUuid === uuid);
      if (actionIndex >= 0) {
        // delete the action from the station
        actionOrderUuids.splice(actionIndex, 1);
        dispatch(upsertStationByField(station.uuid, "actionOrderUuids", actionOrderUuids, false));
      }
    }
  }
  if (action.poiUuid) {
    // look for the action in pois and remove it from the poi's action order
    const poi = getState().poi.pois.find((p) => p.uuid === action.poiUuid);
    const actionOrderUuids = cloneDeep(poi.actionOrderUuids);
    if (actionOrderUuids) {
      const actionIndex = actionOrderUuids.findIndex((actionUuid) => actionUuid === uuid);
      if (actionIndex >= 0) {
        // delete the action from the poi
        actionOrderUuids.splice(actionIndex, 1);
        dispatch(upsertPoiByField(poi.uuid, "actionOrderUuids", actionOrderUuids, false));
      }
    }
  }
  if (action.traverseUuid) {
    // look for the action in traverses and remove it from the traverse's action order
    const traverse = getState().traverse.traverses.find((t) => t.uuid === action.traverseUuid);
    const actionOrderUuids = cloneDeep(traverse.actionOrderUuids);
    if (actionOrderUuids) {
      const actionIndex = actionOrderUuids.findIndex((actionUuid) => actionUuid === uuid);
      if (actionIndex >= 0) {
        // delete the action from the traverse
        actionOrderUuids.splice(actionIndex, 1);
        dispatch(upsertTraverseByField(traverse.uuid, "actionOrderUuids", actionOrderUuids, false));
      }
    }
  }

  // delete the action from the store
  dispatch(deleteActionsByUuid([uuid]));
});

/**
 * Deletes an array of actions from the database, and from both copies in the store
 * IMPORTANT: This does not update actionOrderUuids in the parent station/poi/traverse
 * This function apparently is only used when the parent object is deleted
 */
export const thunkDeleteActionsFromDbAndStore = appCreateAsyncThunk<{
  uuids: string[];
}>("deleteActionFromDbAndStore", async ({ uuids }, { dispatch, getState }) => {
  if (!uuids) return;

  //delete from db
  const uuidsInDb = uuids.filter((uuid) =>
    getState().action.actionsFromDb.some((a) => a.uuid === uuid)
  );
  const actionDeleteResponse: WrappedResponse<number> =
    await httpClient_action.deleteActions(uuidsInDb);
  if (actionDeleteResponse.status !== "success") {
    throw new Error("Error deleting actions " + actionDeleteResponse.message);
  }

  // delete actions from the store and fromdb
  dispatch(deleteActionsByUuid(uuids));
  dispatch(deleteActionsFromDbByUuid(uuids));
});

export const thunkUpsertActionDefinitionSelection = appCreateAsyncThunk<{
  actionUuid: string;
  type: ActionDefinitionType;
  typeUuid: string;
}>(
  "upsertActionDefinitionSelection",
  async ({ actionUuid, type, typeUuid }, { dispatch, getState }) => {
    const action = getState().action.actions.find((a) => a.uuid === actionUuid);
    let newActionDefinition = null;
    if (type === "verbs") {
      newActionDefinition = { ...action.actionDefinition, verbUuid: typeUuid };
    } else if (type === "nouns") {
      newActionDefinition = { ...action.actionDefinition, nounUuid: typeUuid };
    } else if (type === "adjectives") {
      newActionDefinition = { ...action.actionDefinition, adjectiveUuid: typeUuid };
    }
    dispatch(upsertActionByField(actionUuid, "actionDefinition", newActionDefinition));
  }
);
