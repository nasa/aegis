import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

/**
 * Generate a blank station
 * @param partialStation any fields that are to be overridden from default
 * @returns the generated station
 */
export const generateBlankStation = (partialStation?: Partial<Station>): Station => {
  const defaultNewStation: Station = {
    uuid: uuidv4(),
    refUuid: uuidv4(),
    ownerId: 0,
    missionId: 0,
    poiUuids: [],
    actionOrderUuids: [],
    name: "",
    status: "Candidate",
    description: "",
    icon: null,
    radius: 5,
    location: null,
    elevation: null,
    duration: 15,
    walkbackPath: null,
    walkbackPathSegmentDistances: null,
    walkbackPathSegmentElevations: null,
    walkbackTraverseRate: null,
    mapCircleControls: {},
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };
  return { ...defaultNewStation, ...partialStation };
};
