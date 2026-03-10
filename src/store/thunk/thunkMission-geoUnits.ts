import appCreateAsyncThunk from "./thunkUtil";
import { getAccurateNow } from "utils/formatting";
import { getAutomergeDocHandles } from "client/automergeDocHandles";
import { makeReadableActionDefinition } from "utils/export";

type PrintableListItem = {
  parentType: "Station" | "POI" | "Template";
  parentName: string;
  actionName: string;
};

// Keep this as a thunk because we need access to the rest of redux state
// to determine if this geo unit is used and can be deleted.
export const thunkDeleteGeoUnit = appCreateAsyncThunk<{ geographicUnitUuid: string }>(
  "deleteGeoUnit",
  async ({ geographicUnitUuid }, { getState }) => {
    const missionDocHandle = getAutomergeDocHandles().mission;
    const mission = missionDocHandle.doc();

    // find all of the actions and actionTemplates using this geographic unit
    const actionsUsingGeographicUnit = getState().action.actions.filter((action) =>
      action.geographicUnitsUsage?.some((uuid) => uuid === geographicUnitUuid)
    );
    const actionTemplates = mission.actionTemplates;
    const templatesUsingGeographicUnit = actionTemplates
      ? Object.values(actionTemplates).filter((template) =>
          template.geographicUnitsUsage?.some((uuid) => uuid === geographicUnitUuid)
        )
      : [];

    const printableList: PrintableListItem[] = [];
    if (actionsUsingGeographicUnit.length > 0) {
      // compile a list of the actions using this equipment item including their parent poi or station names
      const actionsList: PrintableListItem[] = actionsUsingGeographicUnit.map((action) => {
        const parentType = action.poiUuid ? "POI" : "Station";
        let parentName = "";
        if (parentType === "POI") {
          const parentPoi = getState().poi.pois.find((poi) => poi.uuid === action.poiUuid);
          parentName = parentPoi?.name || "";
        } else {
          const parentStation = getState().station.stations.find(
            (station) => station.uuid === action.stationUuid
          );
          parentName = parentStation?.name || "";
        }

        let actionName = action.name;
        if (action.stmAction) {
          const readableActionDef = makeReadableActionDefinition({
            action,
            actionDefinitions: mission.actionDefinitions,
          });
          actionName = readableActionDef.displayString;
        }

        return {
          parentType,
          parentName,
          actionName,
        };
      });
      printableList.push(...actionsList);
    }
    if (templatesUsingGeographicUnit?.length && templatesUsingGeographicUnit.length > 0) {
      const templateList: PrintableListItem[] = templatesUsingGeographicUnit.map((template) => {
        return {
          parentType: "Template",
          parentName: "Action",
          actionName: template.templateName || "",
        };
      });
      printableList.push(...templateList);
    }

    if (printableList.length > 0) {
      alert(
        "This geographic unit is being used by one or more actions. Please remove it from the following actions before deleting.\n\n" +
          printableList.map(
            (item) => `${item.parentType}: ${item.parentName} - ${item.actionName}\n`
          )
      );
      return;
    }

    //this item is not being used. All good to delete it
    missionDocHandle.change((m: Mission) => {
      if (m.geographicUnits[geographicUnitUuid]) {
        delete m.geographicUnits[geographicUnitUuid];
        m.updatedAt = getAccurateNow().getTime();
      }
    });
  }
);
