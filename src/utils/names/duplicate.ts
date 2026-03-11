/**
 * A helper method to duplicate a unique name with a string and array of strings
 *
 * @param nameToCopy
 * @param existingNames
 * @param useCopyPrefix
 */
export function makeUniqueStringCopy(
  nameToCopy: string,
  existingNames: string[],
  useCopyPrefix: boolean = true
): string {
  const copyRegex = / \(((?:copy )??\d+)\)$/;

  // Find the highest copy number for a item name, eg POI, Station, etc
  const findHighestDuplicateNumber = (name: string) => {
    const words = name.split(copyRegex); // e.g. ["Station Name", " (copy 1)" "Modifier"]
    const number = words[1] ? words[1].replace(/^\D+/g, "") : 0;
    return words[1] ? parseInt(number as string) : 0;
  };

  if (!copyRegex.test(nameToCopy) && !existingNames.includes(nameToCopy)) {
    // This name isn't being used anywhere else. Just return it.
    return nameToCopy;
  } else {
    const nameToCopyWords = nameToCopy.split(copyRegex); // e.g. ["Station Name", " (copy 1)" "Modifier"]

    // get the highest duplicate number
    let highestDuplicateNumber = 0;
    for (const existingName of existingNames) {
      if (!existingName || !existingName.startsWith(nameToCopyWords[0])) {
        continue;
      }
      const duplicateNumber = findHighestDuplicateNumber(existingName);
      if (duplicateNumber > highestDuplicateNumber) {
        highestDuplicateNumber = duplicateNumber;
      }
    }

    // return the new name with incremented number
    const prefix = useCopyPrefix ? "copy " : "";
    return `${nameToCopyWords[0]} (${prefix}${highestDuplicateNumber + 1})`;
  }
}
