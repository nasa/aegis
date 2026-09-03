import { makeReadableActionDefinition } from "utils/export";

import type { PrintableListItem } from "./geoUnitUsages";

/**
 * Returns a list of all actions and action templates that reference any of the given
 * mission priority uuids. An empty array means the priority is safe to delete.
 */
export function getMissionPriorityUsages(
  mission: Mission,
  missionPriorityUuids: Set<string>
): PrintableListItem[] {
  const printableList: PrintableListItem[] = [];

  const actionsUsingMissionPriority = Object.values(mission?.actions ?? {}).filter(
    (action) => action.missionPriorityUuid && missionPriorityUuids.has(action.missionPriorityUuid)
  );

  if (actionsUsingMissionPriority.length > 0) {
    const actionsList: PrintableListItem[] = actionsUsingMissionPriority.map((action) => {
      const parentType = action.poiUuid ? "POI" : "Station";
      let parentName = "";
      if (parentType === "POI") {
        parentName = mission.pois?.[action.poiUuid]?.name || "";
      } else {
        parentName = mission.stations?.[action.stationUuid]?.name || "";
      }
      let actionName = action.name;
      if (action.stmAction) {
        const readableActionDef = makeReadableActionDefinition({ action, mission });
        actionName = readableActionDef.displayString;
      }
      return { parentType, parentName, actionName };
    });
    printableList.push(...actionsList);
  }

  const templatesUsingMissionPriority = Object.values(mission?.actionTemplates ?? {}).filter(
    (template) =>
      template.missionPriorityUuid && missionPriorityUuids.has(template.missionPriorityUuid)
  );

  if (templatesUsingMissionPriority.length > 0) {
    const templateList: PrintableListItem[] = templatesUsingMissionPriority.map((template) => ({
      parentType: "Template",
      parentName: "Action",
      actionName: template.templateName || "",
    }));
    printableList.push(...templateList);
  }

  return printableList;
}
