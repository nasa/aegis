import { getLgrsCompatibility } from "./compatibility";
import { getGridSystem } from "@bfeist/planetary-grid-reference";

export { getGridSystem } from "@bfeist/planetary-grid-reference";

/** Label scheme of the Moon, and of an Earth mission without `earthGridLabelScheme`. */
const DEFAULT_LABEL_SCHEME: GridLabelScheme = "lunar-acc";

/** The grid system a mission uses; lunar when `gridSystem` is not set. */
export function getMissionGridSystemId(mission: LgrsMissionGridSelection): MissionGridSystemId {
  return mission.gridSystem ?? "moon-m2025";
}

/** The label scheme a mission is shown in: `earthGridLabelScheme` on Earth, ACC on the Moon. */
export function getMissionLabelScheme(mission: LgrsMissionGridSelection): GridLabelScheme {
  return getMissionGridSystemId(mission) === "earth-wgs84"
    ? (mission.earthGridLabelScheme ?? DEFAULT_LABEL_SCHEME)
    : DEFAULT_LABEL_SCHEME;
}

/**
 * A mission's grid system, labelled in the mission's scheme. Cheap: use it where compatibility
 * is not needed (readouts, bearings, exports).
 */
export function resolveMissionGridSystem(mission: LgrsMissionGridSelection): LgrsGridSystem {
  return getGridSystem(getMissionGridSystemId(mission), getMissionLabelScheme(mission));
}

/** A mission's grid system and whether its dynamic grid can be drawn. */
export function getMissionGridSystem(mission: LgrsMissionGridFields): LgrsMissionGridSystem {
  const system = resolveMissionGridSystem(mission);
  return { system, compatibility: getLgrsCompatibility(system, mission) };
}

/**
 * The system for a mission's grid coordinates and grid-north bearings: its grid system when it
 * shows grid coordinates (`usingLGRSCoordinates`), otherwise null.
 */
export function getMissionCoordinateSystem(
  mission: LgrsMissionGridSelection & Pick<Mission, "usingLGRSCoordinates">
): LgrsGridSystem | null {
  return mission.usingLGRSCoordinates ? resolveMissionGridSystem(mission) : null;
}
