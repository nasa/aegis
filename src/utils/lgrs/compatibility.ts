import { LGRS_MOON_RADIUS } from "./constants";
import { getLgrsMapAdapter, getLgrsMapProjection } from "./mapAdapter";

const PROBE_POINTS: [lat: number, lon: number][] = [
  [0, 0],
  [-90, 0],
  [90, 0],
  [-45, 45],
  [45, -45],
];

const probe = new Float64Array(2);

/**
 * Whether the dynamic LGRS grid can be drawn for a mission: LGRS is defined on the IAU 2015
 * lunar sphere, and the map projection must be one the LGRS map adapter can build with proj4.
 */
export function getLgrsCompatibility(
  mission: Pick<Mission, "id" | "planetRadius" | "projIsCustom" | "projEpsg" | "projProj4String">
): LgrsCompatibility {
  if (mission.planetRadius !== LGRS_MOON_RADIUS) {
    return {
      compatible: false,
      reason: `LGRS requires the lunar planet radius (${LGRS_MOON_RADIUS} m).`,
      projection: null,
    };
  }
  const projection = getLgrsMapProjection(mission);
  const adapter = getLgrsMapAdapter(projection);
  const parseable = PROBE_POINTS.some(([lat, lon]) => adapter.latLonToMap(lat, lon, probe));
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
