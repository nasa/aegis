/**
 * Calculate the distance between two coordinates
 * @param {AEGISPoint} point1 - the first coordinate
 * @param {AEGISPoint} point2 - the second coordinate
 * @param {number} R - The radius of the planet in question
 */
export function getDistanceBetweenTwoCoordinates(
  point1: AEGISPoint,
  point2: AEGISPoint,
  R: number
): number {
  var dLat = deg2rad(point2.lat - point1.lat); // deg2rad below
  var dLon = deg2rad(point2.lng - point1.lng);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(point1.lat)) *
      Math.cos(deg2rad(point2.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c; // Distance in R units
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Calculate the total distance of a path (array of points)
 * @param points AEGISPoint array
 * @param R The radius of the planet in question
 * @returns distance in R units
 */
export const getTotalDistance = (points: AEGISPoint[], R: number): number => {
  let distance = 0;
  points.forEach((latLng, index) => {
    if (index === 0) return;
    distance += getDistanceBetweenTwoCoordinates(points[index], points[index - 1], R);
  });
  return distance;
};

/**
 * Calculate the center/average of multiple AEGISPoint coordinates
 *
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

export const convertLeafletLatLngToAegisPoint = (latLng: L.LatLng): AEGISPoint => {
  return {
    lat: latLng.lat,
    lng: latLng.lng,
  };
};

export const convertLeafletLatLngsToAegisPoints = (latLngs: L.LatLng[]): AEGISPoint[] => {
  return latLngs.map((latLng) => convertLeafletLatLngToAegisPoint(latLng));
};

/**
 *   
  // sample implementation:
  // location is an array of AEGISPoint

  // const numPointsAt10Meters =
  //   getTotalDistance(location, parseInt(mission.config.msv.radius.minor)) / 10;

  // const newPoints = generateEquidistantPointsAlongPolyline(
  //   location,
  //   numPointsAt10Meters,
  //   parseInt(mission.config.msv.radius.minor)
  // );

 * @param polyline An array of points
 * @param n number of new points to add between each segment in the polyline
 * @param R radius of planet
 * @returns New array with added points
 */
export function generateEquidistantPointsAlongPolyline(
  polyline: AEGISPoint[],
  n: number,
  R: number
): AEGISPoint[] {
  const editablePolyline = [...polyline];

  // Calculate total distance
  const totalDistance = getTotalDistance(editablePolyline, R);

  // Calculate distance between each equidistant point
  const distanceBetweenPoints = totalDistance / (n - 1);

  // Traverse polyline and add equidistant points to output array
  let currentDistance = 0;
  const output = [editablePolyline[0]];
  for (let i = 1; i < editablePolyline.length; i++) {
    const segmentDistance = getDistanceBetweenTwoCoordinates(
      editablePolyline[i - 1],
      editablePolyline[i],
      R
    );
    if (currentDistance + segmentDistance >= distanceBetweenPoints) {
      const remainder = distanceBetweenPoints - currentDistance;
      const ratio = remainder / segmentDistance;
      const lat =
        editablePolyline[i - 1].lat +
        ratio * (editablePolyline[i].lat - editablePolyline[i - 1].lat);
      const lng =
        editablePolyline[i - 1].lng +
        ratio * (editablePolyline[i].lng - editablePolyline[i - 1].lng);
      output.push({ lat, lng });
      editablePolyline.splice(i, 0, { lat, lng });
      currentDistance = remainder;
    } else {
      currentDistance += segmentDistance;
    }
  }
  output.push(editablePolyline[editablePolyline.length - 1]);

  return output;
}
