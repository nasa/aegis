import { getMoonAffine } from "./affine";
import { clipLtmGridLine, getLtmFalseNorthing, getLtmRegionBounds } from "./clip";
import {
  LGRS_MOON_RADIUS,
  LPS_DOMAIN_RADIUS,
  LPS_FALSE_EASTING,
  LPS_FALSE_NORTHING,
} from "./constants";
import {
  classifyLatLon,
  formatCrsName,
  getLtmCentralMeridian,
  getLtmZone,
  isLtmCrs,
  isValidMoonCrs,
  LGRS_CRS_LPS_NORTH,
  LGRS_CRS_LPS_SOUTH,
} from "./crs";
import { formatMoonPoint } from "./display";
import { formatLgrsLabel } from "./format";
import { getMoonCandidateRegions, getMoonFrameworkLines, getMoonZoneLabels } from "./framework";
import { projectLatLon, unprojectToLatLon } from "./projection";

const LPS_CAP: LgrsCap = Object.freeze({
  centreE: LPS_FALSE_EASTING,
  centreN: LPS_FALSE_NORTHING,
  radius: LPS_DOMAIN_RADIUS,
});
const BOX_SPACINGS: readonly LgrsPrecision[] = Object.freeze([10, 100, 1000, 25000]);

/**
 * Whole-Moon LGRS (USGS M2025) with lunar ACC labels: LTM zones 1–45 × N/S and the two LPS
 * caps on the IAU 2015 sphere.
 */
export const moonGridSystem: LgrsGridSystem = {
  key: "moon-m2025",
  id: "moon-m2025",
  scheme: "lunar-acc",
  drawsZoneTier: true,

  isValidCrs: isValidMoonCrs,
  formatCrsName,
  classifyLatLon,
  isInRegion(lat: number, lon: number, crs: LgrsCrsId): boolean {
    return classifyLatLon(lat, lon) === crs;
  },

  projectLatLon,
  unprojectToLatLon,
  getAffine: getMoonAffine,

  formatPoint: formatMoonPoint,
  formatBox: formatLgrsLabel,
  getBoxSpacings(): readonly LgrsPrecision[] {
    return BOX_SPACINGS;
  },

  getCandidateRegions: getMoonCandidateRegions,
  getCap(crs: LgrsCrsId): LgrsCap | null {
    return crs === LGRS_CRS_LPS_SOUTH || crs === LGRS_CRS_LPS_NORTH ? LPS_CAP : null;
  },
  getRegionBounds: getLtmRegionBounds,
  clipGridLine: clipLtmGridLine,
  getCentralMeridian(crs: LgrsCrsId): number {
    return isLtmCrs(crs) ? getLtmCentralMeridian(getLtmZone(crs)) : NaN;
  },
  isSeamGridLine(crs: LgrsCrsId, axis: "easting" | "northing", value: number): boolean {
    // The equator is a seam; LTM lines along it are drawn as the framework line.
    return axis === "northing" && isLtmCrs(crs) && value === getLtmFalseNorthing(crs);
  },

  getFrameworkLines: getMoonFrameworkLines,
  getZoneLabels: getMoonZoneLabels,

  checkPlanetRadius(planetRadius: number | null | undefined): string | null {
    return planetRadius === LGRS_MOON_RADIUS
      ? null
      : `LGRS requires the lunar planet radius (${LGRS_MOON_RADIUS} m).`;
  },
};
