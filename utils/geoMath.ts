import { LatLng } from "leaflet";

export function getDistanceBetweenTwoCoordinates(
  latLng1: LatLng,
  latLng2: LatLng,
  R: number
): number {
  /**
   * Calculate the distance between two coordinates
   * @param {number} lat1
   * @param {number} lon1
   * @param {number} lat2
   * @param {number} lon2
   * @param {number} R - the radius of the planet in question
   */
  var dLat = deg2rad(latLng2.lat - latLng1.lat); // deg2rad below
  var dLon = deg2rad(latLng2.lng - latLng1.lng);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(latLng1.lat)) *
      Math.cos(deg2rad(latLng2.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c; // Distance in R units
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}
