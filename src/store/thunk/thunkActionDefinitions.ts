import appCreateAsyncThunk from "./thunkUtil";
import { getAccurateNow } from "utils/formatting";
import { getMissionDocHandle } from "client/automergeDocHandles";

type ActionDefPrintableListItem = {
  parentType: "Action in Station" | "Rule in STM Item" | "Action Template";
  parentName: string;
};

export const thunkDocDeleteActionDefItem = appCreateAsyncThunk<
  { type: ActionDefinitionType; uuid: string },
  void,
  null
>("deleteActionDefinitionItem", async ({ type, uuid }, { getState }) => {
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();

  // Step 1: Check if definition is in use; gather dependency info and alert if so.
  // find all of the actions using this definition
  const actionsUsingActionDef = Object.values(mission?.actions ?? {}).filter(
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
  const actionTemplates = mission.actionTemplates;
  const templatesUsingActionDef = actionTemplates
    ? Object.values(actionTemplates).filter(
        (template) =>
          template.actionDefinition?.verbUuid === uuid ||
          template.actionDefinition?.nounUuid === uuid ||
          template.actionDefinition?.adjectiveUuid === uuid
      )
    : [];
  const printableList: ActionDefPrintableListItem[] = [];
  if (actionsUsingActionDef?.length > 0) {
    const stations = getMissionDocHandle()?.doc()?.stations;
    const actionsList: ActionDefPrintableListItem[] = actionsUsingActionDef.map((action) => {
      const parentName = stations?.[action.stationUuid]?.name;
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

  // Step 2: Definition is not in use — delete it from the Automerge doc.
  missionDocHandle.change((m: Mission) => {
    if (m.actionDefinitions[type] && m.actionDefinitions[type][uuid]) {
      delete m.actionDefinitions[type][uuid];
      m.updatedAt = getAccurateNow().getTime();
    }
  });

  // No Step 3: this thunk has no UI side-effects of its own.
});
