/**
 * Find the highest copy number for a station name and increment it
 *
 * @param duplicateItem
 * @param duplicateItems
 * @param propName
 */
export function copyStringFromObj<P extends string, T extends Record<P, string>>(
  duplicateItem: T,
  duplicateItems: T[],
  propName: P
): string {
  /**
   * Find the highest copy number for a POI or Station name
   * @param duplicateItemName
   */
  const findHighestDuplicateNumber = (duplicateItemName: string) => {
    const duplicateItemNameRegex = / \((copy \d+)\)$/;
    const duplicateItemNameCopy = duplicateItemName.split(duplicateItemNameRegex); // e.g. ["Station Name", " (copy 1)" "Modifer"]
    const duplicateItemNameCopyNumber = duplicateItemNameCopy[1]
      ? duplicateItemNameCopy[1].replace(/^\D+/g, "")
      : 0;
    return duplicateItemNameCopy[1] ? parseInt(duplicateItemNameCopyNumber as string) : 0;
  };

  const duplicateItemName = duplicateItem[propName];
  const duplicateItemNameRegex = / \((copy \d+)\)$/;
  if (
    !duplicateItemNameRegex.test(duplicateItemName) &&
    !duplicateItems.some((s) => s[propName] === duplicateItemName)
  ) {
    return duplicateItemName;
  } else {
    const duplicateItemNameCopy = duplicateItemName.split(duplicateItemNameRegex); // e.g. ["Station Name", " (copy 1)" "Modifer"]
    let highestStationDuplicateNumber = 0;
    for (const duplicateItem of duplicateItems) {
      if (!duplicateItem[propName].startsWith(duplicateItemNameCopy[0])) {
        continue;
      }
      const duplicateItemDuplicateNumber = findHighestDuplicateNumber(duplicateItem[propName]);
      if (duplicateItemDuplicateNumber > highestStationDuplicateNumber) {
        highestStationDuplicateNumber = duplicateItemDuplicateNumber;
      }
    }
    const duplicateItemNameCopyNumberIncremented = highestStationDuplicateNumber + 1;
    return duplicateItemNameCopy[0] + " (copy " + duplicateItemNameCopyNumberIncremented + ")";
  }
}

/**
 * A helper method to duplicate a unique name with a string and array of strings
 *
 * @param duplicateItemName
 * @param duplicateItems
 * @param propName
 */
export function makeUniqueStringCopy(
  duplicateItemName: string,
  duplicateItems: string[],
  propName: string = "name"
): string {
  return copyStringFromObj(
    { [propName]: duplicateItemName } as Record<string, string>,
    duplicateItems.map((s) => ({ [propName]: s } as Record<string, string>)),
    propName as keyof Record<string, string>
  );
}
