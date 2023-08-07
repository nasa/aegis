import appCreateAsyncThunk from "./thunkUtil";
import { setMission } from "store/mission";
import { v4 as uuidv4 } from "uuid";

type PrintableListItem = {
  parentType: "Station" | "POI" | "Template";
  parentName: string;
  actionName: string;
};

export const thunkUpdateGeoUnit = appCreateAsyncThunk<{ geographicUnit: GeographicUnit }>(
  "updateGeoUnit",
  async ({ geographicUnit }, { dispatch, getState }) => {
    const itemIndex = getState().mission.mission.geographicUnits?.findIndex(
      (item) => item.uuid === geographicUnit.uuid
    );
    const newGeographicUnits = [...getState().mission.mission.geographicUnits];
    newGeographicUnits[itemIndex] = geographicUnit;
    dispatch(setMission({ ...getState().mission.mission, geographicUnits: newGeographicUnits }));
  }
);

export const thunkDeleteGeoUnit = appCreateAsyncThunk<{ geographicUnitUuid: string }>(
  "deleteGeoUnit",
  async ({ geographicUnitUuid }, { dispatch, getState }) => {
    // find all of the actions using this equipment item
    const actionsUsingGeographicUnit = getState().action.actions.filter((action) =>
      action.geographicUnitsUsage?.some((uuid) => uuid === geographicUnitUuid)
    );
    const templatesUsingGeographicUnit = getState().mission.mission.actionTemplates.filter(
      (template) => template.geographicUnitsUsage?.some((uuid) => uuid === geographicUnitUuid)
    );

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

        return {
          parentType,
          parentName,
          actionName: action.name,
        };
      });
      printableList.push(...actionsList);
    }
    if (templatesUsingGeographicUnit.length > 0) {
      const templateList: PrintableListItem[] = templatesUsingGeographicUnit.map((template) => {
        return {
          parentType: "Template",
          parentName: "Action",
          actionName: template.templateName,
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

    const newGeographicUnits = getState().mission.mission.geographicUnits?.filter(
      (item) => item.uuid !== geographicUnitUuid
    );
    dispatch(setMission({ ...getState().mission.mission, geographicUnits: newGeographicUnits }));
  }
);

export const thunkCreateGeoUnit = appCreateAsyncThunk<void>(
  "createGeoUnit",
  async (_, { dispatch, getState }) => {
    const blankItem: GeographicUnit = {
      uuid: uuidv4(),
      name: "(Geographic Unit Name)",
    };

    const geographicUnits = getState().mission.mission.geographicUnits || [];
    const newGeographicUnits = [...geographicUnits, blankItem];
    dispatch(setMission({ ...getState().mission.mission, geographicUnits: newGeographicUnits }));
  }
);
