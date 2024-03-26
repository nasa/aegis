import _ from "lodash";

/**
 * Upsert (update or insert) an element into any array of objects that contain a uuid field.
 * @param array The array the object is upserted into
 * @param element The element/object to upsert
 * @returns The modified array with the upserted element.
 */
export function upsertToArrayByUuid<T extends MustContain>(array: T[], element: T): T[] {
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
 * @param equipItemUsage items to add in
 * @param totalEquipItems the array to add the items into
 * @returns
 */
export function mergeEquipmentItems(
  equipItemUsage: EquipmentItemUsage[],
  totalEquipItems: EquipmentItemUsage[]
): EquipmentItemUsage[] {
  if (!equipItemUsage) return totalEquipItems;

  for (const itemUsage of equipItemUsage) {
    const indexFound = totalEquipItems.findIndex((i) => i.uuid === itemUsage.uuid);
    if (indexFound >= 0) {
      totalEquipItems[indexFound].quantityUsed += itemUsage.quantityUsed;
    } else {
      totalEquipItems.push({
        uuid: itemUsage.uuid,
        quantityUsed: itemUsage.quantityUsed,
      });
    }
  }

  return totalEquipItems;
}

export const getStmUuidRefs = (stmPriorities: StmPriorities): string[] => {
  const stmUuidRefs: string[] = [];
  if (_.isEmpty(stmPriorities)) return stmUuidRefs;
  for (const [key, __] of Object.entries(stmPriorities)) {
    stmUuidRefs.push(key);
  }
  return stmUuidRefs;
};
