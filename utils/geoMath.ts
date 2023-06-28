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
function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 * @param angle - radians
 * @returns  degrees
 */
function rad2deg(angle) {
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

// https://github.com/manuelbieh/geolib/
// Computes the destination point given an initial point, a distance and a bearing
// See http://www.movable-type.co.uk/scripts/latlong.html for the original code
export function computeDestinationPoint(
  start: AEGISPoint,
  distance: number,
  bearing: number,
  radius: number
): AEGISPoint {
  const lat = start.lat;
  const lng = start.lng;

  const delta = distance / radius;
  const theta = deg2rad(bearing);

  const phi1 = deg2rad(lat);
  const lambda1 = deg2rad(lng);

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  );

  let lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );

  let longitude = rad2deg(lambda2);
  if (longitude < -180 || longitude > 180) {
    // normalise to >=-180 and <=180° if value is >180 or <-180
    lambda2 = ((lambda2 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    longitude = rad2deg(lambda2);
  }

  return {
    lat: rad2deg(phi2),
    lng: longitude,
  };
}

/**
 * https://github.com/manuelbieh/geolib/
 * Gets rhumb line bearing of two points. Find out about the difference between rhumb line and
 * great circle bearing on Wikipedia. It's quite complicated. Rhumb line should be fine in most cases:
 *
 * http://en.wikipedia.org/wiki/Rhumb_line#General_and_mathematical_description
 *
 * Function heavily based on Doug Vanderweide's great PHP version (licensed under GPL 3.0)
 * http://www.dougv.com/2009/07/13/calculating-the-bearing-and-compass-rose-direction-between-two-latitude-longitude-coordinates-in-php/
 */
export function getRhumbLineBearing(origin: AEGISPoint, dest: AEGISPoint): number {
  // difference of longitude coords
  let diffLon = deg2rad(dest.lng) - deg2rad(origin.lng);

  // difference latitude coords phi
  const diffPhi = Math.log(
    Math.tan(deg2rad(dest.lat) / 2 + Math.PI / 4) / Math.tan(deg2rad(origin.lat) / 2 + Math.PI / 4)
  );

  // recalculate diffLon if it is greater than pi
  if (Math.abs(diffLon) > Math.PI) {
    if (diffLon > 0) {
      diffLon = (Math.PI * 2 - diffLon) * -1;
    } else {
      diffLon = Math.PI * 2 + diffLon;
    }
  }

  //return the angle, normalized
  return (rad2deg(Math.atan2(diffLon, diffPhi)) + 360) % 360;
}

/**
 * Adds points along a path every x meters. Preserves the original points passed in.
 * The returned path can be gaurenteed to have a point at least every x meters, but there may be
 * points with less distance.
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

    //we're on the last item of the array
    if (i === path.length - 1) break;

    const bearing = getRhumbLineBearing(path[i], path[i + 1]);
    let currentPoint = path[i];
    let distance = getDistanceBetweenTwoCoordinates(currentPoint, path[i + 1], radius);
    //loop while the distance remaining is greater than the meters distance
    while (distance > meters) {
      const newPoint = computeDestinationPoint(currentPoint, meters, bearing, radius);
      newPath.push(newPoint);
      currentPoint = newPoint;
      distance = getDistanceBetweenTwoCoordinates(currentPoint, path[i + 1], radius);
    }
  }

  return newPath;
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
  //convert meters to km, then divide by traverse speed to get minutes
  const distanceMeters = segmentDistances.reduce((accumulator, currentVal) => {
    return accumulator + currentVal;
  }, 0);

  const distanceKm = distanceMeters / 1000;
  const durationHours = distanceKm / traverseRate;
  const durationMinutes = durationHours * 60;
  return durationMinutes;
};
