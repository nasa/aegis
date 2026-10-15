import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

/**
 * Generate a blank layer
 * @param partialLayer any fields that are to be overridden from default
 * @returns the generated layer
 */
export const generateBlankLayer = (partialLayer?: Partial<Layer>): Layer => {
  const defaultNewLayer: Layer = {
    uuid: uuidv4(),
    missionId: 0,
    name: "",
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };
  return { ...defaultNewLayer, ...partialLayer };
};
