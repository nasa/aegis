import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

/**
 * Generate a blank traverse
 * @param partialTraverse any fields that are to be overridden from default
 * @returns the generated traverse
 */
export const generateBlankTraverse = (partialTraverse?: Partial<Traverse>): Traverse => {
  const defaultNewTraverse: Traverse = {
    uuid: uuidv4(),
    refUuid: uuidv4(),
    missionId: null,
    name: "",
    description: "",
    duration: null,
    path: [],
    pathSegmentDistances: null,
    pathSegmentElevations: null,
    status: null,
    color: null,
    actionOrderUuids: [],
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };
  return { ...defaultNewTraverse, ...partialTraverse };
};
