import { cloneDeep } from "lodash";
import appCreateAsyncThunk from "./thunkUtil";
import { upsertMission, upsertMissionByField } from "store/mission";
import { v4 as uuidv4 } from "uuid";

type PrintableListItem = {
  parentType: "Station" | "POI" | "Template";
  parentName: string;
  actionName: string;
};

export const thunkUpdateEquipment = appCreateAsyncThunk<{
  uuid: string;
  fieldName: keyof EquipmentItem;
  value: EquipmentItem[keyof EquipmentItem];
}>("updateEquipment", async ({ uuid, fieldName, value }, { dispatch, getState }) => {
  const newEquipmentItems = cloneDeep(getState().mission.mission.equipmentItems);
  const itemIndex = newEquipmentItems?.findIndex((item) => item.uuid === uuid);
  if (itemIndex >= 0) {
    (newEquipmentItems[itemIndex] as Record<typeof fieldName, EquipmentItem[keyof EquipmentItem]>)[
      fieldName
    ] = value;
    dispatch(upsertMissionByField("equipmentItems", newEquipmentItems));
  }
});

export const thunkDeleteEquipment = appCreateAsyncThunk<{ equipmentItemUuid: string }>(
  "deleteEquipment",
  async ({ equipmentItemUuid }, { dispatch, getState }) => {
    // find all of the things that could be using this equipment item
    const actionsUsingEquipmentItem = getState().action.actions.filter((action) =>
      action.equipmentItemsUsage?.some((item) => item.uuid === equipmentItemUuid)
    );
    const templatesUsingEquipmentItem = getState().mission.mission.actionTemplates?.filter(
      (template) => template.equipmentItemsUsage?.some((item) => item.uuid === equipmentItemUuid)
    );

    const printableList: PrintableListItem[] = [];
    if (actionsUsingEquipmentItem.length > 0) {
      // compile a list of the actions using this equipment item including their parent poi or station names
      const actionsList: PrintableListItem[] = actionsUsingEquipmentItem.map((action) => {
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
    const newEquipmentItems = getState().mission.mission.equipmentItems?.filter(
      (item) => item.uuid !== equipmentItemUuid
    );
    dispatch(upsertMission({ ...getState().mission.mission, equipmentItems: newEquipmentItems }));
  }
);

export const thunkCreateEquipment = appCreateAsyncThunk<void>(
  "createEquipment",
  async (_, { dispatch, getState }) => {
    const blankEquipmentItem: EquipmentItem = {
      uuid: uuidv4(),
      name: "(Equipment Name)",
      quantity: 1,
      singleUse: false,
    };

    const equipmentItems = getState().mission.mission.equipmentItems || [];
    const newEquipmentItems = [...equipmentItems, blankEquipmentItem];
    dispatch(upsertMission({ ...getState().mission.mission, equipmentItems: newEquipmentItems }));
  }
);
