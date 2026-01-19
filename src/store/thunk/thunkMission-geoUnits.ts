import cloneDeep from "lodash/cloneDeep";
import appCreateAsyncThunk from "./thunkUtil";
import { upsertMission, upsertMissionByField } from "store/mission";
import { v4 as uuidv4 } from "uuid";
import { makeReadableActionDefinition } from "utils/export";

type PrintableListItem = {
  parentType: "Station" | "POI" | "Template";
  parentName: string;
  actionName: string;
};

export const thunkUpdateGeoUnit = appCreateAsyncThunk<{
  uuid: string;
  fieldName: "name" | "abbr";
  value: string;
}>("updateGeoUnit", async ({ uuid, fieldName, value }, { dispatch, getState }) => {
  const geographicUnits = getState().mission.mission.geographicUnits;
  const currentItem = geographicUnits?.[uuid];
  if (currentItem) {
    const newGeographicUnits = cloneDeep(geographicUnits);
    newGeographicUnits[uuid][fieldName] = value;
    dispatch(upsertMissionByField("geographicUnits", newGeographicUnits));
  }
});

export const thunkDeleteGeoUnit = appCreateAsyncThunk<{ geographicUnitUuid: string }>(
  "deleteGeoUnit",
  async ({ geographicUnitUuid }, { dispatch, getState }) => {
    // find all of the actions and actionTemplates using this geographic unit
    const actionsUsingGeographicUnit = getState().action.actions.filter((action) =>
      action.geographicUnitsUsage?.some((uuid) => uuid === geographicUnitUuid)
    );
    const actionTemplates = getState().mission.mission.actionTemplates;
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
            actionDefinitions: getState().mission.mission.actionDefinitions,
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

    // Nothing is using this geoUnit. Delete it
    const geographicUnits = getState().mission.mission.geographicUnits;
    const newGeographicUnits = cloneDeep(geographicUnits);
    delete newGeographicUnits[geographicUnitUuid];
    dispatch(upsertMission({ ...getState().mission.mission, geographicUnits: newGeographicUnits }));
  }
);

export const thunkCreateGeoUnit = appCreateAsyncThunk<void, string>(
  "createGeoUnit",
  async (_, { dispatch, getState }) => {
    const newGeoUuid = uuidv4();
    const blankItem = {
      name: "(Geographic Unit Name)",
    };

    const geographicUnits = getState().mission.mission.geographicUnits || {};
    const newGeographicUnits = {
      ...geographicUnits,
      [newGeoUuid]: blankItem,
    };
    dispatch(upsertMissionByField("geographicUnits", newGeographicUnits));

    return newGeoUuid;
  }
);
