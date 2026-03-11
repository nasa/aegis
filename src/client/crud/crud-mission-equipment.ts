import { getAutomergeDocHandles } from "client/automergeDocHandles";
import { getAccurateNow } from "utils/formatting";
import { v4 as uuidv4 } from "uuid";
import { crudUpdateMissionByField } from "./crud-mission";
import { generateBlankEquipmentItem } from "store/storeUtils/mission";

export const crudCreateEquipmentItem = (): void => {
  const blankEquipmentItem = generateBlankEquipmentItem();
  const blankEquipItemUuid = uuidv4();

  crudUpdateMissionByField("equipmentItems", blankEquipItemUuid, blankEquipmentItem);
};

// export const crudDeleteEquipmentItem = (equipmentItemUuid: string): void => {};

export const crudUpdateEquipmentItemByField = <K extends keyof EquipmentItem>(
  equipmentUuid: string,
  fieldName: K,
  value: EquipmentItem[K]
): void => {
  const missionDocHandle = getAutomergeDocHandles()?.mission;
  missionDocHandle.change((m: Mission) => {
    const equipItem = m.equipmentItems?.[equipmentUuid];
    if (equipItem) {
      equipItem[fieldName] = value;
      m.updatedAt = getAccurateNow().getTime();
    }
  });
};
