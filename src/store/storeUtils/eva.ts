import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

/**
 * Generate a blank eva
 * @param partialEVA any fields that are to be overridden from default
 * @returns the generated eva
 */
export const generateBlankEVA = (partialEVA?: Partial<Eva>): Eva => {
  const defaultNewEVA: Eva = {
    uuid: uuidv4(),
    refUuid: uuidv4(),
    ownerId: 0,
    missionId: 0,
    name: "",
    status: "Candidate",
    sequence: [],
    description: "",
    traverseRate: null,
    duration: null,
    traverseColor: null,
    datetime: null,
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };
  return { ...defaultNewEVA, ...partialEVA };
};
