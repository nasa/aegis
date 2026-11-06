import { formatEarthAccBoxLabel, formatEarthAccFromLatLon } from "./acc";
import { getEarthAffine } from "./affine";
import { formatCanonicalMgrs, formatMgrsBoxLabel } from "./mgrs";
import { projectEarthLatLon, unprojectEarthToLatLon } from "./projection";
import {
  clipEarthGridLine,
  getEarthCandidateRegions,
  getEarthCap,
  getEarthFrameworkLines,
  getEarthRegionBounds,
  isEarthSeamGridLine,
} from "./region";
import {
  classifyEarthLatLon,
  formatEarthCrsName,
  getUtmCentralMeridian,
  getUtmZone,
  isInEarthRegion,
  isUtmCrs,
  isValidEarthCrs,
} from "./zones";

/** Radii above this are Earth-scale (matches `isEarthScale`). */
const EARTH_SCALE_MIN_RADIUS = 4_000_000;

const ACC_BOX_SPACINGS: readonly LgrsPrecision[] = Object.freeze([10, 100, 1000, 25000]);
const MGRS_BOX_SPACINGS: readonly LgrsPrecision[] = Object.freeze([10, 100, 1000, 10000, 100000]);

/**
 * Readout precision used for a requested precision: the coarsest of the scheme's precisions that
 * is not coarser than the request, so digits never claim less precision than asked for (ACC
 * 10 km → 1 km, ACC 100 km → the 25 km area, MGRS 25 km → 10 km).
 */
function getAccPointPrecision(precision: LgrsPrecision): EarthAccPrecision | null {
  switch (precision) {
    case 1:
    case 10:
    case 100:
    case 1000:
    case 25000:
      return precision;
    case 10000:
      return 1000;
    case 100000:
      return 25000;
    default:
      return null;
  }
}

function getMgrsPointPrecision(precision: LgrsPrecision): EarthMgrsPrecision | null {
  switch (precision) {
    case 1:
    case 10:
    case 100:
    case 1000:
    case 10000:
    case 100000:
      return precision;
    case 25000:
      return 10000;
    default:
      return null;
  }
}

/** `"full"`: `15R TN 9751 7177`; `"condensed"`: `TN 9751 7177`; at 100 km both are `15R TN`. */
function formatMgrsPoint(
  lat: number,
  lon: number,
  precision: LgrsPrecision,
  style: LgrsDisplayStyle
): string | null {
  const mgrsPrecision = getMgrsPointPrecision(precision);
  if (mgrsPrecision === null) return null;
  const mgrs = formatCanonicalMgrs(lat, lon, mgrsPrecision);
  if (mgrs === null || style === "full" || mgrsPrecision === 100000) return mgrs;
  return mgrs.slice(mgrs.indexOf(" ") + 1);
}

function formatAccPoint(
  lat: number,
  lon: number,
  precision: LgrsPrecision,
  style: LgrsDisplayStyle
): string | null {
  const accPrecision = getAccPointPrecision(precision);
  return accPrecision === null ? null : formatEarthAccFromLatLon(lat, lon, accPrecision, style);
}

const nodeScratch = new Float64Array(2);

/** Whether the box corner `[e, n]` lies in the region of `crs` (boxes are labelled at it). */
function isNodeInRegion(e: number, n: number, crs: LgrsCrsId): boolean {
  return (
    unprojectEarthToLatLon(e, n, crs, nodeScratch) &&
    isInEarthRegion(nodeScratch[0], nodeScratch[1], crs)
  );
}

function createEarthGridSystem(scheme: GridLabelScheme): LgrsGridSystem {
  const mgrs = scheme === "mgrs";
  return Object.freeze({
    key: `earth-wgs84/${scheme}`,
    id: "earth-wgs84",
    scheme,
    drawsZoneTier: false,

    isValidCrs: isValidEarthCrs,
    formatCrsName: formatEarthCrsName,
    classifyLatLon: classifyEarthLatLon,
    isInRegion: isInEarthRegion,

    projectLatLon: projectEarthLatLon,
    unprojectToLatLon: unprojectEarthToLatLon,
    getAffine: getEarthAffine,

    formatPoint: mgrs ? formatMgrsPoint : formatAccPoint,
    /**
     * Box label of a box whose corner lies in the region; a box whose corner lies
     * in a neighbouring region is labelled there instead.
     */
    formatBox(
      lowerLeftE: number,
      lowerLeftN: number,
      crs: LgrsCrsId,
      precision: LgrsPrecision
    ): LgrsLabel | null {
      if (!isValidEarthCrs(crs) || !isNodeInRegion(lowerLeftE, lowerLeftN, crs)) return null;
      if (mgrs) {
        return precision === 25000
          ? null
          : formatMgrsBoxLabel(crs, lowerLeftE, lowerLeftN, precision as EarthMgrsPrecision);
      }
      return precision === 10000 || precision === 100000
        ? null
        : formatEarthAccBoxLabel(crs, lowerLeftE, lowerLeftN, precision as EarthAccPrecision);
    },
    getBoxSpacings(): readonly LgrsPrecision[] {
      return mgrs ? MGRS_BOX_SPACINGS : ACC_BOX_SPACINGS;
    },

    getCandidateRegions: getEarthCandidateRegions,
    getCap: getEarthCap,
    getRegionBounds: getEarthRegionBounds,
    clipGridLine: clipEarthGridLine,
    getCentralMeridian(crs: LgrsCrsId): number {
      return isUtmCrs(crs) ? getUtmCentralMeridian(getUtmZone(crs)) : NaN;
    },
    isSeamGridLine: isEarthSeamGridLine,

    getFrameworkLines: getEarthFrameworkLines,
    getZoneLabels(): LgrsZoneLabel[] {
      return [];
    },

    // A radius that is not Earth-scale is an admin warning, never a block.
    checkPlanetRadius(planetRadius: number | null | undefined): string | null {
      return typeof planetRadius === "number" && planetRadius > EARTH_SCALE_MIN_RADIUS
        ? null
        : "The Earth grid expects an Earth-scale planet radius; check the mission's radius.";
    },
  });
}

const ACC_SYSTEM = createEarthGridSystem("lunar-acc");
const MGRS_SYSTEM = createEarthGridSystem("mgrs");

/**
 * WGS84 UTM/UPS (zones 1–60 with the Norway/Svalbard exceptions, both UPS caps) labelled in
 * `scheme`: Earth ACC (`15RTNDC X51 W77`) or canonical MGRS (`15R TN 9751 7177`). One cached
 * instance per scheme. The grid is hidden at zone-tier zoom.
 */
export function getEarthGridSystem(scheme: GridLabelScheme): LgrsGridSystem {
  return scheme === "mgrs" ? MGRS_SYSTEM : ACC_SYSTEM;
}
