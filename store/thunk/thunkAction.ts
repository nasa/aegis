import { upsertAction } from "store/action";
import appCreateAsyncThunk from "./thunkUtil";
import { generateUniqueName } from "utils/unique-name";
import { v4 as uuidv4 } from "uuid";
import _ from "lodash";
import { makeUniqueStringCopy } from "utils/duplicate";

export const thunkCreateAction = appCreateAsyncThunk<{
  actionParentUuid: ActionParentUuid;
  actionOrderUuids: string[];
  setActionOrderUuids: (actionOrderUuids: string[]) => void;
  setEditMode: (newEditMode: boolean) => void;
  actions: Action[];
}>(
  "actionCreate",
  async (
    { actionParentUuid, actionOrderUuids, setActionOrderUuids, setEditMode, actions },
    { dispatch, getState }
  ) => {
    const randomName = generateUniqueName({
      dictName: "starTrek",
      existingNames: getState().action.actions.map((a: Action) => a.name),
    });

    const blankAction: Action = {
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
      inventoryItems: null,
      priorityOverride: null,
    };

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

    setEditMode(true);
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
    } else {
      newAction.parentActionUuid = null;
    }
    dispatch(upsertAction(newAction));
    return newActionUuid;
  }
);
