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

export function getMissionDefaultLabelScheme(mission: LgrsMissionGridSelection): GridLabelScheme {
  return mission.planet === "earth"
    ? (mission.earthGridLabelScheme ?? DEFAULT_LABEL_SCHEME)
    : DEFAULT_LABEL_SCHEME;
}

/** Earth uses the user's label override, then the mission default; Moon always uses ACC. */
export function getMissionLabelScheme(
  mission: LgrsMissionGridSelection,
  userSchemeOverride?: GridLabelScheme | null
): GridLabelScheme {
  return mission.planet === "earth"
    ? (userSchemeOverride ?? getMissionDefaultLabelScheme(mission))
    : DEFAULT_LABEL_SCHEME;
}

export function resolveMissionGridSystem(
  mission: LgrsMissionGridSelection,
  userSchemeOverride?: GridLabelScheme | null
): LgrsGridSystem | null {
  const id = getMissionGridSystemId(mission);
  return id ? getGridSystem(id, getMissionLabelScheme(mission, userSchemeOverride)) : null;
}

export function getMissionGridSystem(
  mission: LgrsMissionGridFields,
  userSchemeOverride?: GridLabelScheme | null
): LgrsMissionGridSystem {
  const system = resolveMissionGridSystem(mission, userSchemeOverride);
  return { system, compatibility: getLgrsCompatibility(system, mission) };
}

/** Uploaded Earth grids keep their site-specific coordinate labels and true-north bearings. */
export function getMissionCoordinateSystem(
  mission: LgrsMissionGridSelection & Pick<Mission, "serverFileGrid">,
  userSchemeOverride?: GridLabelScheme | null
): LgrsGridSystem | null {
  return usesGridCoordinates(mission)
    ? resolveMissionGridSystem(mission, userSchemeOverride)
    : null;
}
