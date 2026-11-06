import { getPlanetRadius } from "utils/planets";
import { getLgrsMapProjector } from "@bfeist/planetary-grid-reference/grid";
import { getLgrsMapProjection } from "./mapProjection";

const PROBE_POINTS: [lat: number, lon: number][] = [
  [0, 0],
  [-90, 0],
  [90, 0],
  [-45, 45],
  [45, -45],
];

const probe = new Float64Array(2);

/**
 * Whether the dynamic grid of `system` can be drawn for a mission: the map projection must be
 * one proj4 can build, and the Moon also requires the lunar planet radius. On Earth a radius
 * issue is only a warning, since WGS84 does not depend on the mission's sphere.
 */
export function getLgrsCompatibility(
  system: LgrsGridSystem | null,
  mission: Pick<Mission, "id" | "planet" | "projIsCustom" | "projEpsg" | "projProj4String">
): LgrsCompatibility {
  if (!system) {
    return {
      compatible: false,
      reason: "No dynamic grid is available for this planet.",
      projection: null,
      warning: null,
    };
  }
  const radiusIssue = system.checkPlanetRadius(getPlanetRadius(mission));
  const radiusBlocks = system.id !== "earth-wgs84";
  if (radiusIssue !== null && radiusBlocks) {
    return { compatible: false, reason: radiusIssue, projection: null, warning: null };
  }
  const warning = radiusBlocks ? null : radiusIssue;
  const projection = getLgrsMapProjection(mission);
  const projector = getLgrsMapProjector(projection);
  const parseable = PROBE_POINTS.some(([lat, lon]) => projector.latLonToMap(lat, lon, probe));
  if (!parseable) {
    return {
      compatible: false,
      reason: "LGRS requires a map projection that proj4 can parse.",
      projection: null,
      warning,
    };
  }
  return {
    compatible: true,
    reason: "Dynamic LGRS grid is available for this mission's projection.",
    projection,
    warning,
  };
}
