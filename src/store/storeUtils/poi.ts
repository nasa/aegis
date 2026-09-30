import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

/**
 * Generate a blank poi
 * @param partialPoi any fields that are to be overridden from default
 * @returns the generated poi
 */
export const generateBlankPoi = (partialPoi?: Partial<POI>): POI => {
  const defaultNewPoi: POI = {
    uuid: uuidv4(),
    ownerId: 0,
    missionId: 0,
    name: "",
    description: "",
    actionOrderUuids: [],
    priorityOverride: 0,
    radius: 5,
    location: null,
    elevation: null,
    icon: "1F534",
    tags: [],
    status: "Candidate",
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };
  return { ...defaultNewPoi, ...partialPoi };
};
