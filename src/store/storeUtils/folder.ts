import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

/**
 * Generate a blank folder
 * @param partialFolder any fields that are to be overridden from default
 * @returns the generated folder
 */
export const generateBlankFolder = (partialFolder?: Partial<Folder>): Folder => {
  const defaultNewFolder: Folder = {
    uuid: uuidv4(),
    missionId: 0,
    name: "",
    type: "poi", // Default type
    items: [],
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };
  return { ...defaultNewFolder, ...partialFolder };
};
