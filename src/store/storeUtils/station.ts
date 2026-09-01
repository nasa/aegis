import { v4 as uuidv4 } from "uuid";
import { getAccurateNow } from "utils/formatting";
import cloneDeep from "lodash/cloneDeep";

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
    isLanderXgress: false,
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

/**
 * Build a lander station to be used as xgress for an EVA.
 *
 * @param args `xgressType` plus the required mission-derived fields and any
 * other `Station` fields to override
 * @returns the generated lander xgress station
 */
export function generateLanderXgressStation(
  args: Partial<Station> & {
    xgressType: "egress" | "ingress";
    missionId: number;
    location: AEGISPoint;
    elevation: number | null;
  }
): Station {
  const { xgressType, ...overrides } = args;
  return generateBlankStation({
    name: xgressType === "egress" ? "Lander Egress" : "Lander Ingress",
    icon: "landerIcon",
    ...overrides,
    location: cloneDeep(overrides.location),
    ownerId: overrides.ownerId ?? 0,
    duration: overrides.duration ?? 10,
    isLanderXgress: true,
  });
}
