import appCreateAsyncThunk from "./thunkUtil";
import { v4 as uuidv4 } from "uuid";
import _ from "lodash";
import { upsertMissionByField } from "store/mission";

type ActionDefPrintableListItem = {
  parentType: "Action in Station" | "Rule in STM Item" | "Action Template";
  parentName: string;
};

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
  const actionsUsingActionDef = getState().action.actions.filter(
    (action) =>
      action.stmAction &&
      (action.actionDefinition.verbUuid === uuid ||
        action.actionDefinition.nounUuid === uuid ||
        action.actionDefinition.adjectiveUuid === uuid)
  );
  const rulesUsingActionDef = getState().stm.rules.filter(
    (rule) =>
      rule.verbUuids.includes(uuid) ||
      rule.nounUuids.includes(uuid) ||
      rule.adjectiveUuids.includes(uuid)
  );
  const templatesUsingActionDef = getState().mission.mission.actionTemplates.filter(
    (template) =>
      template.actionDefinition?.verbUuid === uuid ||
      template.actionDefinition?.nounUuid === uuid ||
      template.actionDefinition?.adjectiveUuid === uuid
  );
  const printableList: ActionDefPrintableListItem[] = [];
  if (actionsUsingActionDef?.length > 0) {
    const actionsList: ActionDefPrintableListItem[] = actionsUsingActionDef.map((action) => {
      const parentName = getState().station.stations.find(
        (station) => station.uuid === action.stationUuid
      )?.name;
      return {
        parentType: "Action in Station",
        parentName,
      };
    });
    printableList.push(...actionsList);
  }
  if (rulesUsingActionDef?.length > 0) {
    const rulesList: ActionDefPrintableListItem[] = rulesUsingActionDef.map((rule) => {
      const level3 = getState().stm.level3s.find((level) => level.uuid === rule.stmUuid);
      const level2 = getState().stm.level2s.find((level) => level.uuid === level3?.level2Uuid);
      const level1 = getState().stm.level1s.find((level) => level.uuid === level2?.level1Uuid);
      const level3Numbering = `${level1?.numbering}${level2?.numbering}${level3?.numbering}`;
      return {
        parentType: "Rule in STM Item",
        parentName: level3Numbering,
      };
    });
    printableList.push(...rulesList);
  }
  if (templatesUsingActionDef?.length > 0) {
    const templatesList: ActionDefPrintableListItem[] = templatesUsingActionDef.map((template) => {
      return {
        parentType: "Action Template",
        parentName: template.name,
      };
    });
    printableList.push(...templatesList);
  }

  if (printableList.length > 0) {
    let alertMessage = `This action definition is being used by one or more actions in a Station, STM rule, or Action template. Please remove it from the following before deleting.\n\n`;
    printableList.forEach((item) => {
      alertMessage += `${item.parentType}: ${item.parentName}\n`;
    });
    alert(alertMessage);
    return;
  }

  const actionDefinitions = getState().mission.mission.actionDefinitions;
  const newActionDefinitionItemList = {
    ...actionDefinitions,
    [type]: actionDefinitions[type].filter((item) => item.uuid !== uuid),
  };

  dispatch(upsertMissionByField("actionDefinitions", newActionDefinitionItemList));
});
