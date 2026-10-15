import { applyDeleteActionDefinitionItem } from "operations/apply/apply-mission-actionDefinition";

type ActionDefPrintableListItem = {
  parentType: string;
  parentName: string;
};

/**
 * Delete an action definition item (verb, noun, or adjective). Refuses to delete and returns an
 * in-use message if any STM action, STM rule, or action template still references it.
 *
 * @returns an in-use message if the item is in use, otherwise `undefined`.
 */
export function opDeleteActionDefinitionItem(
  missionDocHandle: DocHandle<Mission>,
  { type, uuid }: { type: ActionDefinitionType; uuid: string }
): string | undefined {
  if (!missionDocHandle) return undefined;
  const mission = missionDocHandle.doc();
  if (!mission) return undefined;

  // Step 1: Check if definition is in use; gather dependency info and return a message if so.
  // find all of the actions using this definition
  const actionsUsingActionDef = Object.values(mission.actions ?? {}).filter(
    (action) =>
      action.stmAction &&
      (action.actionDefinition?.verbUuid === uuid ||
        action.actionDefinition?.nounUuid === uuid ||
        action.actionDefinition?.adjectiveUuid === uuid)
  );
  const rulesUsingActionDef = Object.values(mission.stmRules ?? {}).filter(
    (rule) =>
      rule.verbUuids.includes(uuid) ||
      rule.nounUuids.includes(uuid) ||
      rule.adjectiveUuids.includes(uuid)
  );
  const templatesUsingActionDef = Object.values(mission.actionTemplates ?? {}).filter(
    (template) =>
      template.actionDefinition?.verbUuid === uuid ||
      template.actionDefinition?.nounUuid === uuid ||
      template.actionDefinition?.adjectiveUuid === uuid
  );
  const printableList: ActionDefPrintableListItem[] = [];
  for (const action of actionsUsingActionDef) {
    if (action.traverseUuid) {
      printableList.push({
        parentType: "Action in Traverse",
        parentName: mission.traverses?.[action.traverseUuid]?.name,
      });
    } else if (action.stationUuid) {
      printableList.push({
        parentType: "Action in Station",
        parentName: mission.stations?.[action.stationUuid]?.name,
      });
    } else if (action.poiUuid) {
      printableList.push({
        parentType: "Action in POI",
        parentName: mission.pois?.[action.poiUuid]?.name,
      });
    }
  }
  for (const rule of rulesUsingActionDef) {
    const level3 = mission.stmLevel3s?.[rule.stmUuid];
    const level2 = mission.stmLevel2s?.[level3?.level2Uuid];
    const level1 = mission.stmLevel1s?.[level2?.level1Uuid];
    printableList.push({
      parentType: "Rule in STM Item",
      parentName: `${level1?.numbering}${level2?.numbering}${level3?.numbering}`,
    });
  }
  for (const template of templatesUsingActionDef) {
    printableList.push({ parentType: "Action Template", parentName: template.name });
  }

  if (printableList.length > 0) {
    return (
      `This action definition is being used by one or more actions. Please remove it from the following before deleting.\n\n` +
      printableList.map((item) => `${item.parentType}: ${item.parentName}\n`).join("")
    );
  }

  // Step 2: Definition is not in use — delete it from the Automerge doc.
  missionDocHandle.change((m: Mission) => applyDeleteActionDefinitionItem(m, { type, uuid }));

  return undefined;
}
