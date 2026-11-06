import { getLgrsCompatibility } from "./compatibility";
import { getGridSystem } from "@bfeist/planetary-grid-reference";

export { getGridSystem } from "@bfeist/planetary-grid-reference";

/** Label scheme of the Moon, and of an Earth mission without `earthGridLabelScheme`. */
const DEFAULT_LABEL_SCHEME: GridLabelScheme = "lunar-acc";

/** The grid system a mission uses; lunar when `gridSystem` is not set. */
export function getMissionGridSystemId(mission: LgrsMissionGridSelection): MissionGridSystemId {
  return mission.gridSystem ?? "moon-m2025";
}

/** A mission's default label scheme, ignoring any user override. */
export function getMissionDefaultLabelScheme(mission: LgrsMissionGridSelection): GridLabelScheme {
  return getMissionGridSystemId(mission) === "earth-wgs84"
    ? (mission.earthGridLabelScheme ?? DEFAULT_LABEL_SCHEME)
    : DEFAULT_LABEL_SCHEME;
}

/**
 * A mission's grid system, labelled in the user's scheme override or else the mission default.
 * The override applies only to Earth missions. Cheap: use it where compatibility is not needed
 * (readouts, bearings, exports).
 */
export function resolveMissionGridSystem(
  mission: LgrsMissionGridSelection,
  userSchemeOverride?: GridLabelScheme | null
): LgrsGridSystem {
  return getGridSystem(
    getMissionGridSystemId(mission),
    getMissionLabelScheme(mission, userSchemeOverride)
  );
}

/** The label scheme a mission is shown in: the user's override on Earth, else the default. */
export function getMissionLabelScheme(
  mission: LgrsMissionGridSelection,
  userSchemeOverride?: GridLabelScheme | null
): GridLabelScheme {
  return getMissionGridSystemId(mission) === "earth-wgs84"
    ? (userSchemeOverride ?? getMissionDefaultLabelScheme(mission))
    : DEFAULT_LABEL_SCHEME;
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
