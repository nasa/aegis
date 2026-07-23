import cloneDeep from "lodash/cloneDeep";
import { v4 as uuidv4 } from "uuid";

import { generateBlankEquipmentItem } from "store/storeUtils/mission";
import { getAccurateNow } from "utils/formatting";

import { applyUpdateMissionByField } from "./apply-mission";

/**
 * Insert a new blank EquipmentItem into the Mission draft.
 * Returns the newly-allocated uuid.
 */
export function applyCreateEquipmentItem(m: Mission): string {
  const blankEquipmentItem = generateBlankEquipmentItem();
  const blankEquipItemUuid = uuidv4();

  applyUpdateMissionByField(m, {
    fieldName: "equipmentItems",
    mapKey: blankEquipItemUuid,
    mapValue: blankEquipmentItem,
  });

  return blankEquipItemUuid;
}

/**
 * Update a single field on an EquipmentItem in the Mission draft.
 */
export function applyUpdateEquipmentItemByField<K extends keyof EquipmentItem>(
  m: Mission,
  {
    equipmentUuid,
    fieldName,
    value,
  }: {
    equipmentUuid: string;
    fieldName: K;
    value: EquipmentItem[K];
  }
): void {
  const equipItem = m.equipmentItems?.[equipmentUuid];
  if (equipItem) {
    equipItem[fieldName] = cloneDeep(value);
    m.updatedAt = getAccurateNow().getTime();
  }
}

/**
 * Delete an EquipmentItem from the Mission draft by uuid.
 */
export function applyDeleteEquipmentItem(
  m: Mission,
  { equipmentItemUuid }: { equipmentItemUuid: string }
): void {
  if (m.equipmentItems?.[equipmentItemUuid]) {
    delete m.equipmentItems[equipmentItemUuid];
    m.updatedAt = getAccurateNow().getTime();
  }
}
