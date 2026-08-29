import last from "lodash/last";
import { getSlope } from "./mapping/geoMath";

export const PATH_SLOPE_WINDOW_METERS = 10;

/**
 * Get the hover data from an array of graph data items given a mouse hover x point
 * Extrapolate values if the hover x point falls between two array points
 * Also calculate slope for optional usage
 * @param graphArray
 * @param hoverPoint
 * @returns the y pixel, the extrapolated value, and optional slope from the surrounding points before/after.
 */
export function getHoverValue(
  graphArray: GraphDataItem[],
  hoverPointX: number
): { y: number; val: number; slope: number } {
  let pointBefore: GraphDataItem = null;
  let pointAfter: GraphDataItem = null;
  for (const graphDataItem of graphArray) {
    if (hoverPointX > graphDataItem.xPixel) {
      pointBefore = graphDataItem;
    } else if (hoverPointX < graphDataItem.xPixel) {
      pointAfter = graphDataItem;
      break;
    }
  }

  if (!pointBefore) {
    pointBefore = graphArray[0];
    pointAfter = graphArray[0];
  }

  if (!pointAfter) {
    pointAfter = last(graphArray);
    if (pointBefore === pointAfter) {
      // No slope when pointBefore and pointAfter are the same
      return {
        y: pointAfter.yPixel,
        val: pointAfter.val,
        slope: 0, // no slope as it's a single point
      };
    }
  }

  let newVal: number;
  let newYPixel: number;

  if (pointBefore.val === pointAfter.val) {
    newVal = pointBefore.val;
    newYPixel = pointBefore.yPixel;
  } else {
    const percent = (hoverPointX - pointBefore.xPixel) / (pointAfter.xPixel - pointBefore.xPixel);
    newVal = pointBefore.val + (pointAfter.val - pointBefore.val) * percent;
    newYPixel = pointBefore.yPixel + (pointAfter.yPixel - pointBefore.yPixel) * percent;
  }

  const slope =
    pointBefore.slopeDegrees != null && pointAfter.slopeDegrees != null
      ? pointBefore.slopeDegrees +
        (pointAfter.slopeDegrees - pointBefore.slopeDegrees) *
          ((hoverPointX - pointBefore.xPixel) / (pointAfter.xPixel - pointBefore.xPixel || 1))
      : getSlope(
          pointBefore.distanceMeters ?? pointBefore.xPixel,
          pointBefore.val,
          pointAfter.distanceMeters ?? pointAfter.xPixel,
          pointAfter.val
        );

  return {
    y: newYPixel,
    val: newVal,
    slope,
  };
}

/**
 * Place each elevation sample at its physical distance along a segmented path.
 */
export function buildDistanceElevationProfile(
  segmentedElevations: number[][],
  segmentDistances: number[]
): DistanceElevationDataItem[] {
  const profile: DistanceElevationDataItem[] = [];
  let segmentStartDistance = 0;

  for (const [segmentIndex, elevations] of segmentedElevations.entries()) {
    const segmentDistance = segmentDistances[segmentIndex];
    if (!Number.isFinite(segmentDistance) || segmentDistance < 0 || elevations.length === 0) {
      continue;
    }

    for (const [elevationIndex, elevationMeters] of elevations.entries()) {
      if (!Number.isFinite(elevationMeters)) continue;
      const fraction = elevations.length === 1 ? 1 : elevationIndex / (elevations.length - 1);
      const distanceMeters = segmentStartDistance + segmentDistance * fraction;
      const item = { distanceMeters, elevationMeters };

      if (profile.at(-1)?.distanceMeters === distanceMeters) {
        profile[profile.length - 1] = item;
      } else {
        profile.push(item);
      }
    }

    segmentStartDistance += segmentDistance;
  }

  return profile;
}

/** Place each terrain-slope sample at its physical distance along a segmented path. */
export function buildDistanceTerrainSlopeProfile(
  segmentedSlopes: (number | null)[][] | null | undefined,
  segmentDistances: number[],
  segmentedElevations: number[][] | null = null
): { distanceMeters: number; slopeDegrees: number | null }[] {
  if (
    !segmentedSlopes ||
    !segmentedElevations ||
    segmentedSlopes.length !== segmentDistances.length ||
    segmentedElevations.length !== segmentDistances.length
  ) {
    return [];
  }

  const profile: { distanceMeters: number; slopeDegrees: number | null }[] = [];
  let segmentStartDistance = 0;
  for (const [segmentIndex, slopes] of segmentedSlopes.entries()) {
    const elevations = segmentedElevations[segmentIndex];
    const segmentDistance = segmentDistances[segmentIndex];
    if (
      !Array.isArray(slopes) ||
      !Array.isArray(elevations) ||
      slopes.length !== elevations.length ||
      slopes.length === 0 ||
      !Number.isFinite(segmentDistance) ||
      segmentDistance < 0 ||
      !slopes.every((value) => value === null || (Number.isFinite(value) && value >= 0))
    ) {
      return [];
    }

    for (const [sampleIndex, slopeDegrees] of slopes.entries()) {
      const fraction = slopes.length === 1 ? 1 : sampleIndex / (slopes.length - 1);
      const item = {
        distanceMeters: segmentStartDistance + segmentDistance * fraction,
        slopeDegrees,
      };
      if (profile.at(-1)?.distanceMeters === item.distanceMeters) {
        profile[profile.length - 1] = item;
      } else {
        profile.push(item);
      }
    }
    segmentStartDistance += segmentDistance;
  }
  return profile;
}

/** Interpolate a graph's slope value without bridging missing-data gaps. */
export function getGraphSlopeAtX(graphArray: GraphDataItem[], hoverPointX: number): number | null {
  if (graphArray.length === 0) return null;

  const exactPoint = graphArray.find(({ xPixel }) => xPixel === hoverPointX);
  if (exactPoint) return exactPoint.slopeDegrees ?? null;

  let pointBefore: GraphDataItem | undefined;
  let pointAfter: GraphDataItem | undefined;
  for (const point of graphArray) {
    if (point.xPixel < hoverPointX) pointBefore = point;
    else if (point.xPixel > hoverPointX) {
      pointAfter = point;
      break;
    }
  }
  if (!pointBefore || !pointAfter) {
    return (pointBefore ?? pointAfter)?.slopeDegrees ?? null;
  }
  if (pointBefore.slopeDegrees == null || pointAfter.slopeDegrees == null) return null;

  const fraction =
    (hoverPointX - pointBefore.xPixel) / (pointAfter.xPixel - pointBefore.xPixel || 1);
  return pointBefore.slopeDegrees + (pointAfter.slopeDegrees - pointBefore.slopeDegrees) * fraction;
}

/**
 * Calculate local path grade with a least-squares fit over a fixed distance window.
 * The wider baseline suppresses single-cell DEM noise without making the result
 * dependent on canvas width or sample density.
 */
export function calculateWindowedPathSlopes(
  profile: DistanceElevationDataItem[],
  windowMeters = PATH_SLOPE_WINDOW_METERS
): number[] {
  const halfWindow = Math.max(windowMeters, 0) / 2;

  return profile.map(({ distanceMeters }) => {
    const samples = profile.filter(
      (sample) => Math.abs(sample.distanceMeters - distanceMeters) <= halfWindow
    );
    if (samples.length < 2) return 0;

    const meanDistance =
      samples.reduce((total, sample) => total + sample.distanceMeters, 0) / samples.length;
    const meanElevation =
      samples.reduce((total, sample) => total + sample.elevationMeters, 0) / samples.length;
    let covariance = 0;
    let distanceVariance = 0;

    for (const sample of samples) {
      const distanceOffset = sample.distanceMeters - meanDistance;
      covariance += distanceOffset * (sample.elevationMeters - meanElevation);
      distanceVariance += distanceOffset ** 2;
    }

    return distanceVariance === 0 ? 0 : (Math.atan(covariance / distanceVariance) * 180) / Math.PI;
  });
}
