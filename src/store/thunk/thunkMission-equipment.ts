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

export const thunkUpdateEquipment = appCreateAsyncThunk<{
  uuid: string;
  fieldName: "name" | "quantity" | "singleUse";
  value: string | number | boolean;
}>("updateEquipment", async ({ uuid, fieldName, value }, { dispatch, getState }) => {
  const equipmentItems = getState().mission.mission.equipmentItems;
  const currentItem = equipmentItems?.[uuid];
  if (currentItem) {
    const newEquipmentItems = cloneDeep(equipmentItems);
    (newEquipmentItems[uuid] as { [key in typeof fieldName]: typeof value })[fieldName] = value;
    dispatch(upsertMissionByField("equipmentItems", newEquipmentItems));
  }
});

export const thunkDeleteEquipment = appCreateAsyncThunk<{ equipmentItemUuid: string }>(
  "deleteEquipment",
  async ({ equipmentItemUuid }, { dispatch, getState }) => {
    // find all of the things that could be using this equipment item
    const actionsUsingEquipmentItem = getState().action.actions.filter(
      (action) => action.equipmentItemsUsage?.[equipmentItemUuid] !== undefined
    );
    const actionTemplates = getState().mission.mission.actionTemplates;
    const templatesUsingEquipmentItem = actionTemplates
      ? Object.values(actionTemplates).filter(
          (template) => template.equipmentItemsUsage?.[equipmentItemUuid] !== undefined
        )
      : [];

    const printableList: PrintableListItem[] = [];
    if (actionsUsingEquipmentItem.length > 0) {
      // compile a list of the actions using this equipment item including their parent poi or station names
      const actionsList: PrintableListItem[] = actionsUsingEquipmentItem.map((action) => {
        console.log(action);
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
    if (templatesUsingEquipmentItem?.length > 0) {
      const templateList: PrintableListItem[] = templatesUsingEquipmentItem.map((template) => {
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
        "This equipment item is being used by one or more actions. Please remove it from the following actions before deleting.\n\n" +
          printableList.map(
            (item) => `${item.parentType}: ${item.parentName} - ${item.actionName}\n`
          )
      );
      return;
    }

    //this item is not being used. All good to delete it
    const equipmentItems = getState().mission.mission.equipmentItems;
    const newEquipmentItems = cloneDeep(equipmentItems);
    delete newEquipmentItems[equipmentItemUuid];
    dispatch(upsertMission({ ...getState().mission.mission, equipmentItems: newEquipmentItems }));
  }
);

export const thunkCreateEquipment = appCreateAsyncThunk<void, string>(
  "createEquipment",
  async (_, { dispatch, getState }) => {
    const equipmentUuid = uuidv4();

    const blankEquipmentItem: EquipmentItem = {
      name: "(Equipment Name)",
      quantity: 1,
      singleUse: false,
    };

    const equipmentItems = getState().mission.mission.equipmentItems || {};
    const newEquipmentItems = {
      ...equipmentItems,
      [equipmentUuid]: blankEquipmentItem,
    };
    dispatch(upsertMissionByField("equipmentItems", newEquipmentItems));

    return equipmentUuid;
  }
);
