/**
 * Find the highest copy number for a station name and increment it
 *
 * @param duplicateItem
 * @param duplicateItems
 */
export function duplicateStationOrPOI(
  duplicateItem: Station | POI,
  duplicateItems: Station[] | POI[]
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

  const duplicateItemName = duplicateItem.name;
  const duplicateItemNameRegex = / \((copy \d+)\)$/;
  if (
    !duplicateItemNameRegex.test(duplicateItemName) &&
    !duplicateItems.some((s) => s.name === duplicateItemName)
  ) {
    return duplicateItemName + " (copy 1)";
  } else {
    const duplicateItemNameCopy = duplicateItemName.split(duplicateItemNameRegex); // e.g. ["Station Name", " (copy 1)" "Modifer"]
    let highestStationDuplicateNumber = 0;
    for (const duplicateItem of duplicateItems) {
      if (!duplicateItem.name.startsWith(duplicateItemNameCopy[0])) {
        continue;
      }
      const duplicateItemDuplicateNumber = findHighestDuplicateNumber(duplicateItem.name);
      if (duplicateItemDuplicateNumber > highestStationDuplicateNumber) {
        highestStationDuplicateNumber = duplicateItemDuplicateNumber;
      }
    }
    const duplicateItemNameCopyNumberIncremented = highestStationDuplicateNumber + 1;
    return duplicateItemNameCopy[0] + " (copy " + duplicateItemNameCopyNumberIncremented + ")";
  }
}
