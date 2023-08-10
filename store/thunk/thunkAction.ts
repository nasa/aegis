import {
  deleteActionsFromDbByUuid,
  upsertAction,
  upsertActionFromDb,
  upsertActionsFromDb,
} from "store/action";
import appCreateAsyncThunk from "./thunkUtil";
import { generateUniqueName } from "utils/names/unique-name";
import { v4 as uuidv4 } from "uuid";
import _ from "lodash";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { roundDateToSecond } from "utils/formatting";
import { isModified } from "utils/component-helpers";
import * as httpClient_action from "http-client/action";

export const thunkCreateAction = appCreateAsyncThunk<{
  actionParentUuid: ActionParentUuid;
  actionOrderUuids: string[];
  setActionOrderUuids: (actionOrderUuids: string[]) => void;
  actions: Action[];
  actionTemplate?: ActionTemplate;
}>(
  "actionCreate",
  async (
    { actionParentUuid, actionOrderUuids, setActionOrderUuids, actions, actionTemplate },
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
      status: "Candidate",
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
      createdAt: roundDateToSecond(new Date()).toISOString(),
    };

    if (actionTemplate) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { templateName, uuid, ...rest } = actionTemplate;
      blankAction = { ...blankAction, ...rest };
    }

    //upsert action
    dispatch(upsertAction(blankAction));

    //upsert action order. new action goes on the end.
    let actionOrder: string[];
    if (actionOrderUuids && actionOrderUuids.length > 0) {
      actionOrder = _.cloneDeep(actionOrderUuids);
    } else {
      //no order defined. build a new one based on whats already there
      actionOrder = [];
      for (const action of actions) {
        actionOrder.push(action.uuid);
      }
    }

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
    preserveParentUuid?: boolean;
  },
  string,
  false
>(
  "actionDuplicate",
  async ({ action, stationUuid, poiUuid, preserveParentUuid }, { dispatch, getState }) => {
    if (!action) return;
    const newActionUuid = uuidv4();
    const newAction: Action = _.cloneDeep(action);
    newAction.uuid = newActionUuid;
    newAction.createdAt = roundDateToSecond(new Date()).toISOString();
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
    } else if (poiUuid) {
      const poiActions = getState().action.actions.filter(
        (storeAction: Action) => storeAction.poiUuid === poiUuid
      );
      newAction.name = makeUniqueStringCopy(
        newAction.name,
        poiActions.map((a) => a.name)
      );
    }

    if (preserveParentUuid) {
      newAction.parentActionUuid = action.uuid;
      newAction.parentCopyDate = roundDateToSecond(new Date()).toISOString();
    } else {
      newAction.parentActionUuid = null;
      newAction.parentCopyDate = null;
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
      await httpClient_action.deleteAction(deletedAction.uuid, getState().mission.mission.id);
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
