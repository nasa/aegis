import _ from "lodash";
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
 * Convert a Leaflet LatLng to an AEGISPoint
 * @param {L.LatLng} latLng - the Leaflet LatLng
 * @returns {AEGISPoint} the AEGISPoint
 */
export const convertLeafletLatLngToAegisPoint = (latLng: L.LatLng): AEGISPoint => {
  return {
    lat: latLng.lat,
    lng: latLng.lng,
  };
};

/**
 * Convert an array of Leaflet LatLngs to an array of AEGISPoints
 * @param {L.LatLng[]} latLngs - the Leaflet LatLngs
 * @returns {AEGISPoint[]} the AEGISPoints
 */
export const convertLeafletLatLngsToAegisPoints = (latLngs: L.LatLng[]): AEGISPoint[] => {
  return latLngs.map((latLng) => convertLeafletLatLngToAegisPoint(latLng));
};

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
  if (_.isEqual(path[0], path[1])) return path;

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
  const lat = _.meanBy(points, "lat");
  const lng = _.meanBy(points, "lng");
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
