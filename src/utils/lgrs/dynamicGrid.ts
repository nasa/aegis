import {
  SURF_NAV_LGRS_ACC,
  SURF_NAV_LPS_E25K,
  SURF_NAV_LPS_FALSE_EAST,
  SURF_NAV_LPS_FALSE_NORTH,
  SURF_NAV_LPS_N25K,
  SURF_NAV_MOON_K0,
  SURF_NAV_MOON_MEAN_RADIUS,
} from "utils/consts";

const BASE_GRID_SPACING_METERS = 10;
const LINE_CELL_TARGET = 100;
const LABEL_TARGET = 25;
const LABEL_MIN_PX = 60;
const SOUTH_LPS_MIN_LATITUDE = -80;
const STANDARD_PRECISIONS = [1000, 100, 10, 1] as const;

export const SOUTH_LPS_DOMAIN_RADIUS_METERS =
  2 *
  SURF_NAV_MOON_MEAN_RADIUS *
  SURF_NAV_MOON_K0 *
  Math.tan(((90 + SOUTH_LPS_MIN_LATITUDE) * Math.PI) / 360);

export type LpsCoordinate = [easting: number, northing: number];
export type LpsExtent = [
  minEasting: number,
  minNorthing: number,
  maxEasting: number,
  maxNorthing: number,
];
export type LgrsPrecision = 1 | 10 | 100 | 1000 | 25000;

export type SouthLpsLabel = {
  lgrs: string;
  acc: string;
  condensed: string;
  text: string;
  lowerLeft: LpsCoordinate;
  precision: LgrsPrecision;
};

export type DynamicLgrsLine = {
  axis: "easting" | "northing";
  value: number;
  start: LpsCoordinate;
  end: LpsCoordinate;
};

export type DynamicLgrsLabel = {
  coordinate: LpsCoordinate;
  label: SouthLpsLabel;
};

export type DynamicLgrsRenderPlan = {
  lineSpacing: number;
  labelSpacing: number;
  lines: DynamicLgrsLine[];
  labels: DynamicLgrsLabel[];
};

type DynamicLgrsRenderOptions = {
  extent: LpsExtent;
  gridSpacingMode: GridSpacingMode;
  gridLabelInterval: GridSpacingMode;
  mapResolution: number;
  labelsVisible: boolean;
};

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function pad(value: number, length: number): string {
  return Math.floor(value).toString().padStart(length, "0");
}

function getPrecisionCharacterCount(precision: LgrsPrecision): number {
  if (precision === 25000) return 0;
  return 5 - Math.log10(precision);
}

function getStandardLabelPrecision(spacing: number): LgrsPrecision {
  return STANDARD_PRECISIONS.find((precision) => spacing % precision === 0) ?? 1;
}

export function isSupportedSouthLpsCoordinate([easting, northing]: LpsCoordinate): boolean {
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) return false;
  return (
    Math.hypot(easting - SURF_NAV_LPS_FALSE_EAST, northing - SURF_NAV_LPS_FALSE_NORTH) <=
    SOUTH_LPS_DOMAIN_RADIUS_METERS
  );
}

export function formatSouthLpsCoordinate(
  coordinate: LpsCoordinate,
  precision: LgrsPrecision
): SouthLpsLabel | null {
  if (!isSupportedSouthLpsCoordinate(coordinate)) return null;

  const [easting, northing] = coordinate;
  const lowerLeft: LpsCoordinate = [
    Math.floor(easting / precision) * precision,
    Math.floor(northing / precision) * precision,
  ];
  const sampleEasting = lowerLeft[0] + precision / 2;
  const sampleNorthing = lowerLeft[1] + precision / 2;
  const adjustedEasting = sampleEasting - SURF_NAV_LPS_FALSE_EAST;
  const adjustedNorthing = sampleNorthing - SURF_NAV_LPS_FALSE_NORTH;
  const isWestHalf = sampleEasting < SURF_NAV_LPS_FALSE_EAST;
  const band = isWestHalf ? "A" : "B";
  const eastingAreaIndex = isWestHalf
    ? 23 - Math.floor(Math.abs(adjustedEasting) / 25000)
    : Math.floor(adjustedEasting / 25000);
  const northingAreaIndex = Math.floor(adjustedNorthing / 25000) + 13;
  const eastingArea = SURF_NAV_LPS_E25K[eastingAreaIndex];
  const northingArea = SURF_NAV_LPS_N25K[northingAreaIndex];
  if (!eastingArea || !northingArea) return null;

  const withinAreaEasting = isWestHalf
    ? 25000 - positiveModulo(Math.abs(adjustedEasting), 25000)
    : positiveModulo(adjustedEasting, 25000);
  const withinAreaNorthing = positiveModulo(adjustedNorthing, 25000);
  const eastingDigits = pad(withinAreaEasting, 5).slice(0, 5);
  const northingDigits = pad(withinAreaNorthing, 5).slice(0, 5);
  const characterCount = getPrecisionCharacterCount(precision);
  const lgrsEasting = eastingDigits.slice(0, characterCount);
  const lgrsNorthing = northingDigits.slice(0, characterCount);
  const prefix = `${band}${eastingArea}${northingArea}`;
  const lgrs = `${prefix}${lgrsEasting}${lgrsNorthing}`;

  if (precision === 25000) {
    return { lgrs, acc: prefix, condensed: "", text: prefix, lowerLeft, precision };
  }

  const easting1k = SURF_NAV_LGRS_ACC[parseInt(eastingDigits.slice(0, 2), 10)];
  const northing1k = SURF_NAV_LGRS_ACC[parseInt(northingDigits.slice(0, 2), 10)];
  if (!easting1k || !northing1k) return null;
  const residualLength = Math.max(0, characterCount - 2);
  const eastingResidual = eastingDigits.slice(2, 2 + residualLength);
  const northingResidual = northingDigits.slice(2, 2 + residualLength);
  const eastingCondensed = `${easting1k}${eastingResidual}`;
  const northingCondensed = `${northing1k}${northingResidual}`;
  const condensed = `${eastingCondensed}${northingCondensed}`;

  return {
    lgrs,
    acc: `${prefix}${condensed}`,
    condensed,
    text: `${eastingCondensed} ${northingCondensed}`,
    lowerLeft,
    precision,
  };
}

export function mapCapToLps([x, y]: [number, number]): LpsCoordinate {
  return [
    x * SURF_NAV_MOON_K0 + SURF_NAV_LPS_FALSE_EAST,
    y * SURF_NAV_MOON_K0 + SURF_NAV_LPS_FALSE_NORTH,
  ];
}

export function lpsToMapCap([easting, northing]: LpsCoordinate): [number, number] {
  return [
    (easting - SURF_NAV_LPS_FALSE_EAST) / SURF_NAV_MOON_K0,
    (northing - SURF_NAV_LPS_FALSE_NORTH) / SURF_NAV_MOON_K0,
  ];
}

function parseProj4(proj4String: string): Map<string, string> {
  return new Map(
    proj4String
      .trim()
      .split(/\s+/)
      .filter((token) => token.startsWith("+") && token.includes("="))
      .map((token) => {
        const [key, value] = token.slice(1).split("=", 2);
        return [key, value];
      })
  );
}

function equalsNumber(value: string | undefined, expected: number): boolean {
  return value !== undefined && Number(value) === expected;
}

export function isCanonicalSouthLpsMission(
  mission: Pick<Mission, "planetRadius" | "projIsCustom" | "projProj4String">
): boolean {
  if (!mission.projIsCustom || mission.planetRadius !== SURF_NAV_MOON_MEAN_RADIUS) return false;
  const projection = parseProj4(mission.projProj4String);
  return (
    projection.get("proj") === "stere" &&
    equalsNumber(projection.get("lat_0"), -90) &&
    equalsNumber(projection.get("lon_0"), 0) &&
    equalsNumber(projection.get("k") ?? projection.get("k_0"), 1) &&
    equalsNumber(projection.get("x_0"), 0) &&
    equalsNumber(projection.get("y_0"), 0) &&
    equalsNumber(projection.get("a"), SURF_NAV_MOON_MEAN_RADIUS) &&
    equalsNumber(projection.get("b"), SURF_NAV_MOON_MEAN_RADIUS) &&
    projection.get("units") === "m"
  );
}

function alignFirst(value: number, spacing: number): number {
  return Math.ceil(value / spacing) * spacing;
}

function getVisibleBaseCellCount(extent: LpsExtent): number {
  const domainMinEasting = SURF_NAV_LPS_FALSE_EAST - SOUTH_LPS_DOMAIN_RADIUS_METERS;
  const domainMaxEasting = SURF_NAV_LPS_FALSE_EAST + SOUTH_LPS_DOMAIN_RADIUS_METERS;
  const domainMinNorthing = SURF_NAV_LPS_FALSE_NORTH - SOUTH_LPS_DOMAIN_RADIUS_METERS;
  const domainMaxNorthing = SURF_NAV_LPS_FALSE_NORTH + SOUTH_LPS_DOMAIN_RADIUS_METERS;
  const width = Math.max(
    0,
    Math.min(extent[2], domainMaxEasting) - Math.max(extent[0], domainMinEasting)
  );
  const height = Math.max(
    0,
    Math.min(extent[3], domainMaxNorthing) - Math.max(extent[1], domainMinNorthing)
  );
  const columns = Math.max(1, Math.ceil(width / BASE_GRID_SPACING_METERS));
  const rows = Math.max(1, Math.ceil(height / BASE_GRID_SPACING_METERS));
  return columns * rows;
}

function createLines(extent: LpsExtent, spacing: number): DynamicLgrsLine[] {
  const lines: DynamicLgrsLine[] = [];
  const radiusSquared = SOUTH_LPS_DOMAIN_RADIUS_METERS ** 2;

  for (let easting = alignFirst(extent[0], spacing); easting <= extent[2]; easting += spacing) {
    const delta = easting - SURF_NAV_LPS_FALSE_EAST;
    const remainingSquared = radiusSquared - delta ** 2;
    if (remainingSquared < 0) continue;
    const halfLength = Math.sqrt(remainingSquared);
    const minNorthing = Math.max(extent[1], SURF_NAV_LPS_FALSE_NORTH - halfLength);
    const maxNorthing = Math.min(extent[3], SURF_NAV_LPS_FALSE_NORTH + halfLength);
    if (minNorthing <= maxNorthing) {
      lines.push({
        axis: "easting",
        value: easting,
        start: [easting, minNorthing],
        end: [easting, maxNorthing],
      });
    }
  }

  for (let northing = alignFirst(extent[1], spacing); northing <= extent[3]; northing += spacing) {
    const delta = northing - SURF_NAV_LPS_FALSE_NORTH;
    const remainingSquared = radiusSquared - delta ** 2;
    if (remainingSquared < 0) continue;
    const halfLength = Math.sqrt(remainingSquared);
    const minEasting = Math.max(extent[0], SURF_NAV_LPS_FALSE_EAST - halfLength);
    const maxEasting = Math.min(extent[2], SURF_NAV_LPS_FALSE_EAST + halfLength);
    if (minEasting <= maxEasting) {
      lines.push({
        axis: "northing",
        value: northing,
        start: [minEasting, northing],
        end: [maxEasting, northing],
      });
    }
  }

  return lines;
}

export function createDynamicLgrsRenderPlan({
  extent,
  gridSpacingMode,
  gridLabelInterval,
  mapResolution,
  labelsVisible,
}: DynamicLgrsRenderOptions): DynamicLgrsRenderPlan {
  const visibleBaseCells = getVisibleBaseCellCount(extent);
  const lineSpacing =
    gridSpacingMode === "auto"
      ? Math.max(
          BASE_GRID_SPACING_METERS,
          Math.ceil(Math.sqrt(visibleBaseCells / LINE_CELL_TARGET)) * BASE_GRID_SPACING_METERS
        )
      : gridSpacingMode;

  let labelSpacing = lineSpacing;
  let hideLabels = !labelsVisible;
  if (gridSpacingMode === "auto") {
    const targetSpacing =
      Math.ceil(Math.sqrt(visibleBaseCells / LABEL_TARGET)) * BASE_GRID_SPACING_METERS;
    labelSpacing = Math.ceil(targetSpacing / lineSpacing) * lineSpacing;
  } else if (gridLabelInterval === "auto") {
    const pixelSpacing = lineSpacing / SURF_NAV_MOON_K0 / mapResolution;
    hideLabels = hideLabels || !Number.isFinite(pixelSpacing) || pixelSpacing < LABEL_MIN_PX;
  } else {
    labelSpacing = Math.max(lineSpacing, Math.ceil(gridLabelInterval / lineSpacing) * lineSpacing);
  }

  const labels: DynamicLgrsLabel[] = [];
  if (!hideLabels) {
    const precision = getStandardLabelPrecision(labelSpacing);
    for (
      let northing = alignFirst(extent[1], labelSpacing);
      northing <= extent[3];
      northing += labelSpacing
    ) {
      for (
        let easting = alignFirst(extent[0], labelSpacing);
        easting <= extent[2];
        easting += labelSpacing
      ) {
        const coordinate: LpsCoordinate = [easting, northing];
        const label = formatSouthLpsCoordinate(coordinate, precision);
        if (label) labels.push({ coordinate, label });
      }
    }
  }

  return {
    lineSpacing,
    labelSpacing,
    lines: createLines(extent, lineSpacing),
    labels,
  };
}
