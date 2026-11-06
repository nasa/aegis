import { getLgrsMapProjection, getLgrsMapProjector } from "./mapProjection";

const PROBE_POINTS: [lat: number, lon: number][] = [
  [0, 0],
  [-90, 0],
  [90, 0],
  [-45, 45],
  [45, -45],
];

const probe = new Float64Array(2);

/**
 * Whether the dynamic grid of `system` can be drawn for a mission: the system must accept the
 * mission's planet radius, and the map projection must be one proj4 can build.
 */
export function getLgrsCompatibility(
  system: LgrsGridSystem,
  mission: Pick<Mission, "id" | "planetRadius" | "projIsCustom" | "projEpsg" | "projProj4String">
): LgrsCompatibility {
  const radiusIssue = system.checkPlanetRadius(mission.planetRadius);
  if (radiusIssue !== null) return { compatible: false, reason: radiusIssue, projection: null };
  const projection = getLgrsMapProjection(mission);
  const projector = getLgrsMapProjector(projection);
  const parseable = PROBE_POINTS.some(([lat, lon]) => projector.latLonToMap(lat, lon, probe));
  if (!parseable) {
    return {
      compatible: false,
      reason: "LGRS requires a map projection that proj4 can parse.",
      projection: null,
    };
  }
  return {
    compatible: true,
    reason: "Dynamic LGRS grid is available for this mission's projection.",
    projection,
  };
}
