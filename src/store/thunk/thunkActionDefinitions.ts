import appCreateAsyncThunk from "./thunkUtil";
import { v4 as uuidv4 } from "uuid";
import _ from "lodash";
import { upsertMissionByField } from "store/mission";

export const thunkCreateActionDefItem = appCreateAsyncThunk<
  { type: ActionDefinitionType },
  string,
  null
>("createActionDefinitionItem", async ({ type }, { dispatch, getState }) => {
  const blankItem: ActionDefinitionItem = {
    uuid: uuidv4(),
    name: `(${_.capitalize(type.slice(0, -1))} Name)`,
    abbr: "abbr",
  };

  const actionDefinitions = getState().mission.mission.actionDefinitions;
  const newActionDefinitions = {
    ...actionDefinitions,
    [type]: [...actionDefinitions[type], blankItem],
  };

  dispatch(upsertMissionByField("actionDefinitions", newActionDefinitions));

  return blankItem.uuid;
});

export const thunkUpdateActionDefItem = appCreateAsyncThunk<
  { type: ActionDefinitionType; uuid: string; fieldName: "name" | "abbr"; value: string },
  void,
  null
>(
  "updateActionDefinitionItem",
  async ({ type, uuid, fieldName, value }, { dispatch, getState }) => {
    const actionDefinitions = getState().mission.mission.actionDefinitions;
    const newActionDefinitionItemList = {
      ...actionDefinitions,
      [type]: actionDefinitions[type].map((item) =>
        item.uuid === uuid ? { ...item, [fieldName]: value } : item
      ),
    };

    dispatch(upsertMissionByField("actionDefinitions", newActionDefinitionItemList));
  }
);

export const thunkDeleteActionDefItem = appCreateAsyncThunk<
  { type: ActionDefinitionType; uuid: string },
  void,
  null
>("deleteActionDefinitionItem", async ({ type, uuid }, { dispatch, getState }) => {
  // check if the action definition is used in any action
  const actions = getState().action.actions;
  let deleteable = true;
  for (const action of actions) {
    if (
      action.stmAction &&
      (action.actionDefinition.verbUuid === uuid ||
        action.actionDefinition.nounUuid === uuid ||
        action.actionDefinition.adjectiveUuid === uuid)
    ) {
      deleteable = false;
      break;
    }
  }

  if (!deleteable) {
    alert("This action definition is used in an action and cannot be deleted.");
    return;
  }

  const actionDefinitions = getState().mission.mission.actionDefinitions;
  const newActionDefinitionItemList = {
    ...actionDefinitions,
    [type]: actionDefinitions[type].filter((item) => item.uuid !== uuid),
  };

  dispatch(upsertMissionByField("actionDefinitions", newActionDefinitionItemList));
});
