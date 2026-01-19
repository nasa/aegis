import isEmpty from "lodash/isEmpty";

/**
 * Upsert (update or insert) an element into any array of objects that contain a uuid field.
 * @param array The array the object is upserted into
 * @param element The element/object to upsert
 * @returns The modified array with the upserted element.
 */
export function upsertToArrayByUuid<T extends MustContainIsModified>(array: T[], element: T): T[] {
  const i = array?.findIndex((_element) => _element.uuid === element.uuid);
  // (1) upsert
  if (i > -1) {
    array[i] = element;
  }
  // (2) insert
  else {
    array.push(element);
  }

  // sort by createdAt, then by uuid -- item arrays in every store will be sorted this way for easy array comparison
  array.sort((a, b) => {
    if (new Date(a.createdAt) < new Date(b.createdAt)) return -1;
    if (new Date(a.createdAt) > new Date(b.createdAt)) return 1;
    if (a.uuid < b.uuid) return -1;
    if (a.uuid > b.uuid) return 1;
    return 0;
  });
  return array;
}

/**
 * Add items if they don't exist. If they do, increments quantity
 * @param equipItemUsage items to add in (object map)
 * @param totalEquipItems the object map to add the items into
 * @returns merged equipment items object map
 */
export function mergeEquipmentItems(
  equipItemUsage: EquipmentItemUsages,
  totalEquipItems: EquipmentItemUsages
): EquipmentItemUsages {
  if (!equipItemUsage) return totalEquipItems;

  for (const [uuid, equipmentUsage] of Object.entries(equipItemUsage)) {
    if (totalEquipItems[uuid]) {
      totalEquipItems[uuid].quantityUsed += equipmentUsage.quantityUsed;
    } else {
      totalEquipItems[uuid] = {
        quantityUsed: equipmentUsage.quantityUsed,
      };
    }
  }

  return totalEquipItems;
}

export const getStmUuids = (stmPriorities: StmPriorities): string[] => {
  const stmUuids: string[] = [];
  if (isEmpty(stmPriorities)) return stmUuids;
  for (const [uuid, __] of Object.entries(stmPriorities)) {
    stmUuids.push(uuid);
  }
  return stmUuids;
};
