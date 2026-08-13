import { v4 as uuidv4 } from "uuid";
import { getAccurateNow } from "utils/formatting";
import cloneDeep from "lodash/cloneDeep";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";

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

/**
 * Build a lander station to be used as xgress for an EVA
 */
export function generateLanderXgressStation(
  mission: Mission,
  args?: { ownerId?: number; duration?: number | null }
): Station {
  // Mirror the circle controls a user-created station gets so lander stations
  // render consistently with the rest of the map.
  const mapCircleControls: MapCircleControls = {};
  for (const uuid of Object.keys(mission.circleDefinitions ?? {})) {
    mapCircleControls[uuid] = { uuid, visible: false, style: cloneDeep(defaultSublayerStyle) };
  }

  return generateBlankStation({
    uuid: uuidv4(),
    refUuid: uuidv4(),
    missionId: mission.id,
    ownerId: args?.ownerId ?? 0,
    name: "Lander",
    isLanderXgress: true,
    location: cloneDeep(mission.landerLocation),
    elevation: mission.landerElevationMeters ?? null,
    duration: args?.duration ?? 10,
    mapCircleControls,
  });
}
