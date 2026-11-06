import { getLgrsCompatibility } from "./compatibility";
import { moonGridSystem } from "./moon/system";

/** Label scheme a mission uses unless the user overrides it. */
const DEFAULT_LABEL_SCHEME: GridLabelScheme = "lunar-acc";

/** The grid system a mission uses. Every mission is lunar. */
export function getMissionGridSystemId(_mission: LgrsMissionGridSelection): MissionGridSystemId {
  return "moon-m2025";
}

/** The grid system for an id and label scheme. The Moon has only the lunar ACC scheme. */
export function getGridSystem(id: MissionGridSystemId, _scheme: GridLabelScheme): LgrsGridSystem {
  switch (id) {
    case "moon-m2025":
      return moonGridSystem;
    default:
      throw new Error(`Grid system "${id}" is not available.`);
  }
}

/**
 * A mission's grid system, labelled in the user's scheme override or else the mission default.
 * Cheap: use it where compatibility is not needed (readouts, bearings, exports).
 */
export function resolveMissionGridSystem(
  mission: LgrsMissionGridSelection,
  userSchemeOverride?: GridLabelScheme | null
): LgrsGridSystem {
  return getGridSystem(getMissionGridSystemId(mission), userSchemeOverride ?? DEFAULT_LABEL_SCHEME);
}

/** A mission's grid system and whether its dynamic grid can be drawn. */
export function getMissionGridSystem(
  mission: LgrsMissionGridFields,
  userSchemeOverride?: GridLabelScheme | null
): LgrsMissionGridSystem {
  const system = resolveMissionGridSystem(mission, userSchemeOverride);
  return { system, compatibility: getLgrsCompatibility(system, mission) };
}

/**
 * The system for a mission's grid coordinates and grid-north bearings: its grid system when it
 * shows grid coordinates (`usingLGRSCoordinates`), otherwise null.
 */
export function getMissionCoordinateSystem(
  mission: LgrsMissionGridSelection & Pick<Mission, "usingLGRSCoordinates">,
  userSchemeOverride?: GridLabelScheme | null
): LgrsGridSystem | null {
  return mission.usingLGRSCoordinates
    ? resolveMissionGridSystem(mission, userSchemeOverride)
    : null;
}
