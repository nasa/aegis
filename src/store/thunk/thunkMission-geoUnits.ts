import { cloneDeep } from "lodash";
import appCreateAsyncThunk from "./thunkUtil";
import { upsertMission, upsertMissionByField } from "store/mission";
import { v4 as uuidv4 } from "uuid";

type PrintableListItem = {
  parentType: "Station" | "POI" | "Template";
  parentName: string;
  actionName: string;
};

export const thunkUpdateGeoUnit = appCreateAsyncThunk<{
  uuid: string;
  fieldName: keyof GeographicUnit;
  value: GeographicUnit[keyof GeographicUnit];
}>("updateGeoUnit", async ({ uuid, fieldName, value }, { dispatch, getState }) => {
  const newGeographicUnits = cloneDeep(getState().mission.mission.geographicUnits);
  const itemIndex = newGeographicUnits?.findIndex((item) => item.uuid === uuid);
  if (itemIndex >= 0) {
    newGeographicUnits[itemIndex][fieldName] = value;
    dispatch(upsertMissionByField("geographicUnits", newGeographicUnits));
  }
});

export const thunkDeleteGeoUnit = appCreateAsyncThunk<{ geographicUnitUuid: string }>(
  "deleteGeoUnit",
  async ({ geographicUnitUuid }, { dispatch, getState }) => {
    // find all of the actions using this equipment item
    const actionsUsingGeographicUnit = getState().action.actions.filter((action) =>
      action.geographicUnitsUsage?.some((uuid) => uuid === geographicUnitUuid)
    );
    const templatesUsingGeographicUnit = getState().mission.mission.actionTemplates?.filter(
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
    if (templatesUsingGeographicUnit?.length > 0) {
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
    dispatch(upsertMission({ ...getState().mission.mission, geographicUnits: newGeographicUnits }));
  }
);

export const thunkCreateGeoUnit = appCreateAsyncThunk<void, string>(
  "createGeoUnit",
  async (_, { dispatch, getState }) => {
    const newGeoUuid = uuidv4();
    const blankItem: GeographicUnit = {
      uuid: newGeoUuid,
      name: "(Geographic Unit Name)",
    };

    const geographicUnits = getState().mission.mission.geographicUnits || [];
    const newGeographicUnits = [...geographicUnits, blankItem];
    dispatch(upsertMissionByField("geographicUnits", newGeographicUnits));

    return newGeoUuid;
  }
);
