import { makeReadableActionDefinition } from "utils/export";

export type PrintableListItem = {
  parentType: "Station" | "POI" | "Template";
  parentName: string;
  actionName: string;
};

/**
 * Returns a list of all actions and action templates that reference the given
 * geographic unit uuid. An empty array means the item is safe to delete.
 */
export function getGeoUnitUsages(
  mission: Mission,
  geographicUnitUuid: string
): PrintableListItem[] {
  const printableList: PrintableListItem[] = [];

  const actionsUsingGeographicUnit = Object.values(mission?.actions ?? {}).filter((action) =>
    action.geographicUnitsUsage?.some((uuid) => uuid === geographicUnitUuid)
  );

  if (actionsUsingGeographicUnit.length > 0) {
    const actionsList: PrintableListItem[] = actionsUsingGeographicUnit.map((action) => {
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
          mission,
        });
        actionName = readableActionDef.displayString;
      }
      return { parentType, parentName, actionName };
    });
    printableList.push(...actionsList);
  }

  const actionTemplates = mission.actionTemplates;
  const templatesUsingGeographicUnit = actionTemplates
    ? Object.values(actionTemplates).filter((template) =>
        template.geographicUnitsUsage?.some((uuid) => uuid === geographicUnitUuid)
      )
    : [];

  if (templatesUsingGeographicUnit.length > 0) {
    const templateList: PrintableListItem[] = templatesUsingGeographicUnit.map((template) => ({
      parentType: "Template",
      parentName: "Action",
      actionName: template.templateName || "",
    }));
    printableList.push(...templateList);
  }

  return printableList;
}
