import meanBy from "lodash/meanBy";
import isEqual from "lodash/isEqual";
import { getSouthLpsDisplayCoordinate } from "utils/lgrs/southLps";
import { getBearingFromLatLngPoints } from "utils/surf-nav/surfNavWrapper";

/**
 * This uses the 'haversine' formula to calculate the great-circle distance between two points
 * that is, the shortest distance over the planet's surface (not including terrain)
 * @param {AEGISPoint} point1 - the first coordinate
 * @param {AEGISPoint} point2 - the second coordinate
 * @param {number} radius - The radius of the planet in question (usually meters)
 * @reference http://www.movable-type.co.uk/scripts/latlong.html
 */
export function getDistanceBetweenTwoCoordinates(
  point1: AEGISPoint,
  point2: AEGISPoint,
  radius: number
): number {
  if (!point1 || !point2) return null;
  const dLat = deg2rad(point2.lat - point1.lat); // deg2rad below
  const dLon = deg2rad(point2.lng - point1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(point1.lat)) *
      Math.cos(deg2rad(point2.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c; // Distance in R units
}

/**
 * Find the grid coordinates of a point depending on which grid should be used.
 * LGRS display values come from the pinned LGRS port; surf-nav is only used
 * below for LPS grid-north bearings.
 * @param {AEGISPoint} point - the point to find coordinates for
 * @param {number} radius - The radius of the planet in question (usually meters)
 * @reference http://www.movable-type.co.uk/scripts/latlong.html
 */
export function getGridCoordinatesFromPoint(
  point: AEGISPoint,
  radius: number,
  usingLGRSCoordinates: boolean,
  globalGrid?: MissionGridPoint[][]
): string {
  if (!point) return null;

  if (usingLGRSCoordinates) {
    return getSouthLpsDisplayCoordinate(point);
  } else if (globalGrid) {
    return findGlobalGridCoordsFromPoint(globalGrid, point, radius);
  } else {
    return null;
  }
}

/**
 * Performs binary search to find the closest grid coordinate to a specific point
 * @param {MissionGridPoint[][]} grid - the grid to find coordinates in
 * @param {AEGISPoint} point - the point to look for
 * @param {number} radius - The radius of the planet in question (usually meters)
 */
export function findClosestPointInGlobalGrid(
  grid: MissionGridPoint[][],
  point: AEGISPoint,
  radius: number
): GridIndex {
  if (!grid || !point) return null;

  // Initialization
  let startX = 0,
    startY = 0,
    endX = grid.length - 1,
    endY = grid[0].length - 1;
  let startDist = getDistanceBetweenTwoCoordinates(grid[startX][startY].coordinates, point, radius);
  let endDist = getDistanceBetweenTwoCoordinates(grid[endX][startY].coordinates, point, radius);

  // Search for correct x index- distance changes linearly so correct x leads to correct xy
  while (startX < endX - 1) {
    const midX = Math.floor((startX + endX) / 2);
    const midDist = getDistanceBetweenTwoCoordinates(grid[midX][startY].coordinates, point, radius);
    if (startDist < endDist) {
      endX = midX;
      endDist = midDist;
    } else {
      startX = midX;
      startDist = midDist;
    }
  }
  if (startDist > endDist) {
    startX = endX;
    startDist = endDist;
  }

  // Search for correct y index
  startDist = getDistanceBetweenTwoCoordinates(grid[startX][startY].coordinates, point, radius);
  endDist = getDistanceBetweenTwoCoordinates(grid[startX][endY].coordinates, point, radius);
  while (startY < endY - 1) {
    const midY = Math.floor((startY + endY) / 2);
    const midDist = getDistanceBetweenTwoCoordinates(grid[startX][midY].coordinates, point, radius);
    if (startDist < endDist) {
      endY = midY;
      endDist = midDist;
    } else {
      startY = midY;
      startDist = midDist;
    }
  }
  if (startDist > endDist) {
    startY = endY;
    startDist = endDist;
  }

  return { row: startX, col: startY };
}

/**
 * Finds the cooresponding grid cell name for a given point
 * @param {MissionGridPoint[][]} grid - the grid to find coordinates in
 * @param {AEGISPoint} point - the point to find coordinates for
 * @param {number} radius - The radius of the planet in question (usually meters)
 */
export function findGlobalGridCoordsFromPoint(
  grid: MissionGridPoint[][],
  point: AEGISPoint,
  radius: number
): string {
  if (!grid || !point) return null;

  const closestPoint: GridIndex = findClosestPointInGlobalGrid(grid, point, radius);

  const upperCoord = closestPoint.row > 0 ? grid[closestPoint.row - 1][closestPoint.col] : null;
  const lowerCoord =
    closestPoint.row < grid.length - 1 ? grid[closestPoint.row + 1][closestPoint.col] : null;
  const leftCoord = closestPoint.col > 0 ? grid[closestPoint.row][closestPoint.col - 1] : null;
  const rightCoord =
    closestPoint.col < grid[0].length - 1 ? grid[closestPoint.row][closestPoint.col + 1] : null;

  let lowerIsCloser = false;
  let leftIsCloser = false;

  // Find where in grid you are
  if (upperCoord && lowerCoord) {
    const upperDist = getDistanceBetweenTwoCoordinates(upperCoord.coordinates, point, radius);
    const lowerDist = getDistanceBetweenTwoCoordinates(lowerCoord.coordinates, point, radius);
    if (lowerDist < upperDist) {
      lowerIsCloser = true;
    }
  } else if (lowerCoord) {
    lowerIsCloser = true;
  }

  if (leftCoord && rightCoord) {
    const leftDist = getDistanceBetweenTwoCoordinates(leftCoord.coordinates, point, radius);
    const rightDist = getDistanceBetweenTwoCoordinates(rightCoord.coordinates, point, radius);
    if (leftDist < rightDist) {
      leftIsCloser = true;
    }
  } else if (leftCoord) {
    leftIsCloser = true;
  }

  // If the closest coordiante to the point is on the edge of the grid, return N/A
  // This isn't an ideal solution, but attempts to solve these edge cases were unsuccessful (and painful)
  if (!upperCoord || !lowerCoord || !leftCoord || !rightCoord) {
    return "N/A";
  }

  // Find lower left corner of grid cell, then make sure you are in the right cell
  if (lowerIsCloser && leftIsCloser) {
    return grid[closestPoint.row + 1][closestPoint.col - 1].name;
  } else if (lowerIsCloser) {
    return grid[closestPoint.row + 1][closestPoint.col].name;
  } else if (leftIsCloser) {
    return grid[closestPoint.row][closestPoint.col - 1].name;
  } else {
    return grid[closestPoint.row][closestPoint.col].name;
  }
}

/**
 * Adjust grid indicies to be one shown cell out
 * @param {GridIndex} index - the index to adjust
 * @param {number} numRows - the number of rows in the grid
 * @param {number} numCols - the number of columns in the grid
 * @param {number} lineMod - the number of lines per which one line is shown
 * @param {boolean} isTopLeft - Defines the direction of adjustement after calculation
 */
export function adjustGridIndex(
  index: GridIndex,
  numRows: number,
  numCols: number,
  lineMod: number,
  isTopLeft: boolean
): GridIndex {
  let gridCornerX = index.col;
  let gridCornerY = index.row;

  const rowRemainder = (numRows - 1) % lineMod;
  const colRemainder = (numCols - 1) % lineMod;
  if (isTopLeft) {
    gridCornerX = Math.floor((gridCornerX - colRemainder - 1) / lineMod) * lineMod + colRemainder;
    gridCornerY = Math.floor((gridCornerY - rowRemainder - 1) / lineMod) * lineMod + rowRemainder;

    if (gridCornerX < 0) {
      gridCornerX += lineMod;
    }
    if (gridCornerY < 0) {
      gridCornerY += lineMod;
    }
  } else {
    gridCornerX = Math.ceil((gridCornerX + 1) / lineMod) * lineMod + colRemainder;
    gridCornerY = Math.ceil((gridCornerY + 1) / lineMod) * lineMod + rowRemainder;

    if (gridCornerX >= numCols) {
      gridCornerX -= lineMod;
    }
    if (gridCornerY >= numRows) {
      gridCornerY -= lineMod;
    }
  }

  return { row: gridCornerY, col: gridCornerX };
}

/**
 * Convert degrees to radians
 * @param {number} deg - degrees
 * @returns {number} radians
 */
function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 * @param angle - radians
 * @returns  degrees
 */
function rad2deg(angle: number) {
  return angle * (180 / Math.PI);
}

/**
 * Great-circle initial bearing (true-north azimuth) between two lat/lng points.
 * Degrees clockwise from north, normalised to [0, 360).
 * @reference http://www.movable-type.co.uk/scripts/latlong.html
 */
export function getTrueBearingFromLatLngPoints(
  origin: AEGISPoint,
  destination: AEGISPoint
): number {
  const lat1 = deg2rad(origin.lat);
  const lat2 = deg2rad(destination.lat);
  const dLon = deg2rad(destination.lng - origin.lng);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (rad2deg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Segment bearing appropriate to the mission's coordinate frame.
 *
 * LGRS/lunar missions use the LPS grid-north bearing: near the projection's
 * south-pole origin true north is degenerate, so bearings are given relative to
 * the lunar polar grid. Every other mission (e.g. Earth / Web Mercator) uses a
 * true-north great-circle azimuth — running those through the lunar LPS
 * projection rotates the frame by roughly the point's longitude, which is why an
 * east-west line otherwise reports a bogus bearing.
 */
export function getSegmentBearing(
  origin: AEGISPoint,
  destination: AEGISPoint,
  usingLGRSCoordinates: boolean
): number {
  return usingLGRSCoordinates
    ? getBearingFromLatLngPoints(origin, destination)
    : getTrueBearingFromLatLngPoints(origin, destination);
}

/**
 * Calculate the total distance of a path (array of points)
 * @param points AEGISPoint array
 * @param radius The radius of the planet in question
 * @returns distance in R units
 */
export const getTotalDistance = (points: AEGISPoint[], radius: number): number => {
  let distance = 0;
  points.forEach((latLng, index) => {
    if (index === 0) return;
    distance += getDistanceBetweenTwoCoordinates(points[index], points[index - 1], radius);
  });
  return distance;
};

/**
 * Calculate the center/average of multiple AEGISPoint coordinates *
 * Refined from @url http://stackoverflow.com/a/14231286/538646
 */
export function calcCentroidofCoordinates(coords: AEGISPoint[]): AEGISPoint {
  if (coords.length === 1) {
    return coords[0];
  }

  let x = 0.0;
  let y = 0.0;
  let z = 0.0;

  for (const coord of coords) {
    const latitude = (coord.lat * Math.PI) / 180;
    const longitude = (coord.lng * Math.PI) / 180;

    x += Math.cos(latitude) * Math.cos(longitude);
    y += Math.cos(latitude) * Math.sin(longitude);
    z += Math.sin(latitude);
  }

  x = x / coords.length;
  y = y / coords.length;
  z = z / coords.length;

  const centralLongitude = Math.atan2(y, x);
  const centralSquareRoot = Math.sqrt(x * x + y * y);
  const centralLatitude = Math.atan2(z, centralSquareRoot);

  return {
    lat: (centralLatitude * 180) / Math.PI,
    lng: (centralLongitude * 180) / Math.PI,
  };
}

/**
 * Adds points along a path every x meters. Preserves the original points passed in.
 * @param path original path of AEGIS Points
 * @param meters distance at which new points should be added
 * @param radius Radius of the planet
 * @returns new path of AEGIS Points
 */
export function addPointsAtMeters(
  path: AEGISPoint[],
  meters: number,
  radius: number
): AEGISPoint[] {
  if (path.length < 2) return path;
  if (isEqual(path[0], path[1])) return path;

  const newPath: AEGISPoint[] = [];
  //loop through path segments
  for (let i = 0; i < path.length; i++) {
    newPath.push(path[i]);

    //     //we're on the last item of the array
    if (i === path.length - 1) break;

    const distance = getDistanceBetweenTwoCoordinates(path[i], path[i + 1], radius);
    const nNeeded = Math.floor(distance / meters);
    if (nNeeded === 0) continue;
    const interpolatedPoints = greatCircleInterpolate(path[i], path[i + 1], nNeeded);
    // const interpolatedPoints = linearInterpolate(path[i], path[i + 1], nNeeded);
    newPath.push(...interpolatedPoints);
  }
  return newPath;
}

/**
 * Calculates the coordinates of n points along a great circle path between two points
 * @param start AEGISPoint
 * @param endAEGISPoint
 * @param n Number of points to interpolate between start and end
 * @returns AEGISPoint[]
 */
export function greatCircleInterpolate(
  startPoint: AEGISPoint,
  endPoint: AEGISPoint,
  n: number
): AEGISPoint[] {
  const start = [startPoint.lat, startPoint.lng];
  const end = [endPoint.lat, endPoint.lng];
  const result: AEGISPoint[] = [];
  const startLatRad = deg2rad(start[0]);
  const startLonRad = deg2rad(start[1]);
  const endLatRad = deg2rad(end[0]);
  const endLonRad = deg2rad(end[1]);
  const d = Math.acos(
    Math.sin(startLatRad) * Math.sin(endLatRad) +
      Math.cos(startLatRad) * Math.cos(endLatRad) * Math.cos(endLonRad - startLonRad)
  ); // Angular distance

  for (let i = 1; i <= n; i++) {
    const f = i / (n + 1);
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x =
      A * Math.cos(startLatRad) * Math.cos(startLonRad) +
      B * Math.cos(endLatRad) * Math.cos(endLonRad);
    const y =
      A * Math.cos(startLatRad) * Math.sin(startLonRad) +
      B * Math.cos(endLatRad) * Math.sin(endLonRad);
    const z = A * Math.sin(startLatRad) + B * Math.sin(endLatRad);
    const latRad = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lonRad = Math.atan2(y, x);
    result.push({ lat: rad2deg(latRad), lng: rad2deg(lonRad) });
  }
  return result;
}

/**
 * Find the slope in degrees of a line between two points in x and y coordinates
 */
export function getSlope(x1: number, y1: number, x2: number, y2: number): number {
  const rise = y2 - y1;
  const run = x2 - x1;
  if (run === 0) return 90;
  return (Math.atan(rise / run) * 180) / Math.PI;
}

/**
 * Get the midpoint of an array of AEGISPoints by averaging the lat and lng
 */
export function getMidpoint(points: AEGISPoint[]): AEGISPoint {
  const lat = meanBy(points, "lat");
  const lng = meanBy(points, "lng");
  return { lat, lng };
}

/**
 * Calculate total ascent and descent from a pathSegmentElevations array
 * @param elevations pathSegmentElevations
 * @returns
 */
export const calculateAscentAndDescent = (elevations: number[][]): TotalAscentDescentObj => {
  const returnValue: TotalAscentDescentObj = {
    totalMetersClimbed: 0,
    totalMetersDescended: 0,
  };
  if (!elevations) return returnValue;

  //Loop through the multidimensional array of elevations
  for (const elevation of elevations) {
    // loop over all but the last element (note i < elevation.length - 1)
    for (let i = 0; i < elevation.length - 1; i++) {
      const difference = elevation[i + 1] - elevation[i];
      if (difference > 0) {
        returnValue.totalMetersClimbed += difference;
      } else {
        returnValue.totalMetersDescended += -difference;
      }
    }
  }
  return returnValue;
};

/**
 * Calculate the total duration of a pathSegmentDistances array given a traverse rate
 * @param segmentDistances an array of distances in meters
 * @param traverseRate the traverse rate in km/h
 * @returns the duration in minutes
 */
export const calcPathDurationMins = (segmentDistances: number[], traverseRate: number): number => {
  if (!segmentDistances || !traverseRate) return 0;
  //convert meters to km, then divide by traverse rate to get minutes
  const distanceMeters = segmentDistances.reduce((accumulator, currentVal) => {
    return accumulator + currentVal;
  }, 0);

  const distanceKm = distanceMeters / 1000;
  const durationHours = distanceKm / traverseRate;
  const durationMinutes = durationHours * 60;
  return durationMinutes;
};
