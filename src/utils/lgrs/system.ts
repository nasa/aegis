import { usesGridCoordinates } from "utils/planets";
import { getLgrsCompatibility } from "./compatibility";
import { getGridSystem } from "@bfeist/planetary-grid-reference";

export { getGridSystem } from "@bfeist/planetary-grid-reference";

const DEFAULT_LABEL_SCHEME: GridLabelScheme = "lunar-acc";

/** The planetary reference system, or null for bodies the library does not support. */
export function getMissionGridSystemId(
  mission: Pick<Mission, "planet">
): MissionGridSystemId | null {
  switch (mission.planet) {
    case "earth":
      return "earth-wgs84";
    case "moon":
      return "moon-m2025";
    default:
      return null;
  }
}

/** The label scheme a mission is shown in: `earthGridLabelScheme` on Earth, ACC elsewhere. */
export function getMissionLabelScheme(mission: LgrsMissionGridSelection): GridLabelScheme {
  return mission.planet === "earth"
    ? (mission.earthGridLabelScheme ?? DEFAULT_LABEL_SCHEME)
    : DEFAULT_LABEL_SCHEME;
}

/**
 * A mission's grid system, labelled in the mission's scheme. Cheap: use it where compatibility
 * is not needed (readouts, bearings, exports).
 */
export function resolveMissionGridSystem(mission: LgrsMissionGridSelection): LgrsGridSystem | null {
  const id = getMissionGridSystemId(mission);
  return id ? getGridSystem(id, getMissionLabelScheme(mission)) : null;
}

/** A mission's grid system and whether its dynamic grid can be drawn. */
export function getMissionGridSystem(mission: LgrsMissionGridFields): LgrsMissionGridSystem {
  const system = resolveMissionGridSystem(mission);
  return { system, compatibility: getLgrsCompatibility(system, mission) };
}

/** Uploaded Earth grids keep their site-specific coordinate labels and true-north bearings. */
export function getMissionCoordinateSystem(
  mission: LgrsMissionGridSelection & Pick<Mission, "serverFileGrid">
): LgrsGridSystem | null {
  return usesGridCoordinates(mission) ? resolveMissionGridSystem(mission) : null;
}
