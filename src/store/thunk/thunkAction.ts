import {
  deleteActionsByUuid,
  deleteActionsFromDbByUuid,
  upsertAction,
  upsertActionByField,
  upsertActions,
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
import { upsertStation } from "store/station";
import { upsertPoi } from "store/poi";
import * as httpClient_action from "http-client/action";
import { generateBlankAction } from "store/storeUtils/action";

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
      missionId: getState().mission.mission?.id,
      uuid: actionUuid,
      name: randomName,
      stmAction: getState().mission.mission?.actionSystemVersion === 2,
    });

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

    return actionUuid;
  }
);

/**
 * Duplicates an actions and then calls {@link upsertAction} reducer
 * @param actions array of actions to duplicate
 * @param stationUuid the station the duplicated action belongs to
 * @param poiUuid the poi the duplicated action belongs to
 * @param promotingFromPoi whether or not this action is duplicated because it's being promoted from a poi to a station
 * @Returns the new action UUID created
 */
export const thunkDuplicateActions = appCreateAsyncThunk<{
  actions: Action[];
  stationUuid?: string;
  poiUuid?: string;
  promotingFromPoi?: boolean;
}>(
  "actionsDuplicate",
  async ({ actions, stationUuid, poiUuid, promotingFromPoi }, { dispatch, getState }) => {
    if (!actions || actions.length === 0) return;
    const stationActions = getState().action.actions.filter(
      (storeAction: Action) => storeAction.stationUuid === stationUuid
    );
    const poiActions = getState().action.actions.filter(
      (storeAction: Action) => storeAction.poiUuid === poiUuid
    );

    const newActions: Action[] = _.cloneDeep(actions);
    //set values for the duplicated action
    for (let i = 0; i < newActions.length; i++) {
      const newAction = newActions[i];
      const newActionUuid = uuidv4();
      newAction.uuid = newActionUuid;
      newAction.createdAt = roundDateToSecond(getAccurateNow()).toISOString();
      newAction.updatedAt = null;
      newAction.stationUuid = stationUuid;
      newAction.poiUuid = poiUuid;

      //set name
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
      }

      //set parent info
      if (promotingFromPoi) {
        newAction.parentActionUuid = actions[i].uuid;
        newAction.parentCopyDate = roundDateToSecond(getAccurateNow()).toISOString();
      } else {
        newAction.parentActionUuid = actions[i].parentActionUuid;
        newAction.parentCopyDate = actions[i].parentCopyDate;
      }
    }

    // append new action to the end of the station's action order
    if (stationUuid) {
      const station = getState().station.stations.find((s) => s.uuid === stationUuid);
      let actionOrderUuids = _.cloneDeep(station.actionOrderUuids);
      if (!actionOrderUuids) actionOrderUuids = [];
      actionOrderUuids = actionOrderUuids.concat(newActions.map((a) => a.uuid));
      dispatch(upsertStation({ ...station, actionOrderUuids }, true));
    } else if (poiUuid) {
      // append new action to the end of the poi's action order
      const poi = getState().poi.pois.find((p) => p.uuid === poiUuid);
      let actionOrderUuids = _.cloneDeep(poi.actionOrderUuids);
      if (!actionOrderUuids) actionOrderUuids = [];
      actionOrderUuids = actionOrderUuids.concat(newActions.map((a) => a.uuid));
      dispatch(upsertPoi({ ...poi, actionOrderUuids }, true));
    }

    //upsert new actions
    dispatch(upsertActions(newActions));
  }
);

/**
 * Saves changed/added/deleted actions to the store, fromDB store, and the database
 */
export const thunkSaveActions = appCreateAsyncThunk<{
  actions: Action[];
  actionsFromDb: Action[];
}>("actionSave", async ({ actions, actionsFromDb }, { dispatch, getState }) => {
  const isRexRunning: boolean = getState().rex.rexes.find((rex) => rex.isRunning)?.isRunning;
  //upsert any changed or new Actions to db
  const changedActions: Action[] = [];
  for (const action of actions) {
    if (isModified([action], [actionsFromDb.find((a) => a.uuid === action.uuid)])) {
      changedActions.push({
        ...action,
        updatedAt: roundDateToSecond(new Date()).toISOString(),
      });
    }
  }
  if (changedActions.length > 0) {
    //action changed. upsert to db
    const actionUpsertResponse = await httpClient_action.upsertActions(
      changedActions,
      isRexRunning
    );
    if (actionUpsertResponse.status === "success") {
      //upsert to both stores
      dispatch(upsertActions(actionUpsertResponse.data, true));
      dispatch(upsertActionsFromDb(actionUpsertResponse.data));
    }
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
    await httpClient_action.deleteActions(deletedActionUuids, isRexRunning);
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
  if (!elevation || elevation.payload === false) {
    //gracefully reject?
    dispatch(upsertAction({ ...action, location, elevation: null }));
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
    const highlight: ActionHighlight = { uuid: action.uuid, highlight: false };
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

/**
 * Deletes an action from a station or poi and also from the store (but not from db)
 */
export const thunkDeleteActionFromStore = appCreateAsyncThunk<{
  uuid: string;
}>("deleteActionFromStore", async ({ uuid }, { dispatch, getState }) => {
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
  dispatch(deleteActionsByUuid([uuid]));
});

/**
 * Deletes an array of actions from the database, and from both copies in the store
 */
export const thunkDeleteActionFromDbAndStore = appCreateAsyncThunk<{
  uuids: string[];
}>("deleteActionFromDbAndStore", async ({ uuids }, { dispatch, getState }) => {
  if (uuids.length > 0) {
    //delete from db
    const actionDeleteResponse: WrappedResponse<number> = await httpClient_action.deleteActions(
      uuids,
      getState().rex.rexes.find((rex) => rex.isRunning)?.isRunning
    );
    if (actionDeleteResponse.status !== "success") {
      throw new Error("Error deleting actions " + actionDeleteResponse.message);
    }
    // delete actions from the store and fromdb
    dispatch(deleteActionsByUuid(uuids));
    dispatch(deleteActionsFromDbByUuid(uuids));
  }
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
