import appCreateAsyncThunk from "./thunkUtil";
import { setMission } from "store/mission";
import { v4 as uuidv4 } from "uuid";

type PrintableListItem = {
  parentType: "Station" | "POI";
  parentName: string;
  actionName: string;
};

export const thunkUpdateEquipment = appCreateAsyncThunk<{ equipmentItem: EquipmentItem }>(
  "updateEquipment",
  async ({ equipmentItem }, { dispatch, getState }) => {
    const itemIndex = getState().mission.mission.equipmentItems?.findIndex(
      (item) => item.uuid === equipmentItem.uuid
    );
    const newEquipmentItems = [...getState().mission.mission.equipmentItems];
    newEquipmentItems[itemIndex] = equipmentItem;
    dispatch(setMission({ ...getState().mission.mission, equipmentItems: newEquipmentItems }));
  }
);

export const thunkDeleteEquipment = appCreateAsyncThunk<{ equipmentItemUuid: string }>(
  "deleteEquipment",
  async ({ equipmentItemUuid }, { dispatch, getState }) => {
    // find all of the actions using this equipment item
    const actionsUsingEquipmentItem = getState().action.actions.filter((action) =>
      action.equipmentItemsUsage?.some((item) => item.uuid === equipmentItemUuid)
    );

    if (actionsUsingEquipmentItem.length > 0) {
      // compile a list of the actions using this equipment item including their parent poi or station names
      const printableList: PrintableListItem[] = actionsUsingEquipmentItem.map((action) => {
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

      alert(
        "This equipment item is being used by one or more actions. Please remove it from the following actions before deleting.\n\n" +
          printableList.map((item) => `${item.parentType}: ${item.parentName} - ${item.actionName}`)
      );
      return;
    }

    const newEquipmentItems = getState().mission.mission.equipmentItems?.filter(
      (item) => item.uuid !== equipmentItemUuid
    );
    dispatch(setMission({ ...getState().mission.mission, equipmentItems: newEquipmentItems }));
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
    dispatch(setMission({ ...getState().mission.mission, equipmentItems: newEquipmentItems }));
  }
);
