import { makeReadableActionDefinition } from "utils/export";

export type PrintableListItem = {
  parentType: "Station" | "POI" | "Template";
  parentName: string;
  actionName: string;
};

/**
 * Returns a list of all actions and action templates that reference the given
 * equipment item uuid. An empty array means the item is safe to delete.
 */
export function getEquipmentItemUsages(
  mission: Mission,
  equipmentItemUuid: string
): PrintableListItem[] {
  const printableList: PrintableListItem[] = [];

  const actionsUsingEquipmentItem = Object.values(mission?.actions ?? {}).filter(
    (action) => action.equipmentItemsUsage?.[equipmentItemUuid] !== undefined
  );

  if (actionsUsingEquipmentItem.length > 0) {
    const actionsList: PrintableListItem[] = actionsUsingEquipmentItem.map((action) => {
      const parentType = action.poiUuid ? "POI" : "Station";
      let parentName = "";
      if (parentType === "POI") {
        parentName = mission.pois?.[action.poiUuid]?.name || "";
      } else {
        parentName = mission.stations?.[action.stationUuid]?.name || "";
      }
      let actionName = action.name;
      if (action.stmAction) {
        const readableActionDef = makeReadableActionDefinition({
          action,
          actionDefinitions: mission.actionDefinitions,
        });
        actionName = readableActionDef.displayString;
      }
      return { parentType, parentName, actionName };
    });
    printableList.push(...actionsList);
  }

  const actionTemplates = mission.actionTemplates;
  const templatesUsingEquipmentItem = actionTemplates
    ? Object.values(actionTemplates).filter(
        (template) => template.equipmentItemsUsage?.[equipmentItemUuid] !== undefined
      )
    : [];

  if (templatesUsingEquipmentItem.length > 0) {
    const templateList: PrintableListItem[] = templatesUsingEquipmentItem.map((template) => ({
      parentType: "Template",
      parentName: "Action",
      actionName: template.templateName || "(Unnamed Template)",
    }));
    printableList.push(...templateList);
  }

  return printableList;
}
