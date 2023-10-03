import {
  addPointsAtMeters,
  calcCentroidofCoordinates,
  computeDestinationPoint,
  convertLeafletLatLngToAegisPoint,
  getDistanceBetweenTwoCoordinates,
  getRhumbLineBearing,
  getSlope,
  getTotalDistance,
  calcPathDurationMins,
} from "utils/geoMath";
import { LatLng } from "leaflet";

describe("Geomath Functions", () => {
  const earthRadius = 6371000; //6378137;
  const latLng1: LatLng = new LatLng(0, 0);
  const latLng2: LatLng = new LatLng(0, 0);

  test("Returns 0 distance between two identical coordinates", () => {
    expect(getDistanceBetweenTwoCoordinates(latLng1, latLng2, 0)).toBe(0);
  });
  test("Convert leaflet latlng to aegispoint", () => {
    const latlng = new LatLng(0, 0);
    const aegispoint = convertLeafletLatLngToAegisPoint(latlng);
    expect(aegispoint.lat).toBe(0);
    expect(aegispoint.lng).toBe(0);
  });

  test("Returns 0 distance between three identical coordinates", () => {
    const point1 = {
      lat: 0,
      lng: 0,
    } as AEGISPoint;
    const radiusOfEarth = 6371000;
    expect(getTotalDistance([point1, point1, point1], radiusOfEarth)).toBe(0);
  });

  test("calcCentroidofCoordinates returns known results for 2 test cases", () => {
    const sf = [
      {
        lat: 37.797749,
        lng: -122.412147,
      },
      {
        lat: 37.789068,
        lng: -122.390604,
      },
      {
        lat: 37.785269,
        lng: -122.421975,
      },
    ] as AEGISPoint[];
    expect(calcCentroidofCoordinates(sf)).toEqual({
      lat: 37.790696058721714,
      lng: -122.40824208245043,
    });

    const globe = [
      {
        // Japan
        lat: 37.928969,
        lng: 138.979637,
      },
      {
        // Nevada
        lat: 39.029788,
        lng: -119.594585,
      },
      {
        // New Zealand
        lat: -39.298237,
        lng: 175.717917,
      },
    ] as AEGISPoint[];
    expect(calcCentroidofCoordinates(globe)).toEqual({
      lat: 19.21417269459288,
      lng: -176.73031760486452,
    });
  });

  describe("computeDestinationPoint", () => {
    it("should get the destination point to a given point, distance and bearing", () => {
      let point = computeDestinationPoint(
        { lat: 52.518611, lng: 13.408056 },
        15000,
        180,
        earthRadius
      );
      point.lat = +point.lat.toFixed(5);
      point.lng = +point.lng.toFixed(5);

      expect(point).toEqual({
        lat: +(52.383712759112186).toFixed(5),
        lng: +(13.408056).toFixed(5),
      });
      point = computeDestinationPoint({ lat: 52.518611, lng: 13.408056 }, 15000, 135, earthRadius);
      point.lat = +point.lat.toFixed(5);
      point.lng = +point.lng.toFixed(5);
      expect(point).toEqual({
        lat: +(52.42312025947117).toFixed(5),
        lng: +(13.56447370636139).toFixed(5),
      });
    });

    it("should not exceed maxLon or fall below minLon", () => {
      expect(
        computeDestinationPoint({ lat: 18.5075232, lng: 73.8047121 }, 50000000, 0, earthRadius)
      ).toEqual({
        lat: 71.83167384063478,
        lng: -106.19528790000001,
      });
    });

    it("should leave lng untouched if bearing is 0 or 180", () => {
      expect(
        computeDestinationPoint({ lat: 18.5075232, lng: 73.8047121 }, 500, 0, earthRadius)
      ).toEqual({
        lat: 18.512019808029596,
        lng: 73.8047121,
      });

      expect(
        computeDestinationPoint({ lat: 18.5075232, lng: 73.8047121 }, 500, 180, earthRadius)
      ).toEqual({
        lat: 18.50302659197041,
        lng: 73.8047121,
      });
    });
  });

  describe("getRhumbLineBearing", () => {
    it("should return a bearing between two points", () => {
      expect(
        getRhumbLineBearing(
          { lat: 39.778889, lng: -104.9825 },
          { lat: 43.778889, lng: -102.9825 }
        ).toFixed(5)
      ).toEqual((20.438617005368314).toFixed(5));
    });
  });

  describe("addPointsAtMeters", () => {
    it("should return a new path with the same distance as the old path", () => {
      const path = [
        { lat: -3.645421873728663, lng: -17.47186660766602 },
        { lat: -3.6305197977566683, lng: -17.43161201477051 },
      ];
      const newPath = addPointsAtMeters(path, 10, earthRadius);
      const distance = getTotalDistance(path, earthRadius).toFixed(5);
      const newDistance = getTotalDistance(newPath, earthRadius).toFixed(5);
      expect(distance).toEqual(newDistance);
    });

    it("should return the original path if the first and last coordinates are the same", () => {
      const path = [
        { lat: -3.645421873728663, lng: -17.47186660766602 },
        { lat: -3.645421873728663, lng: -17.47186660766602 },
      ];
      const newPath = addPointsAtMeters(path, 10, earthRadius);
      expect(path).toEqual(newPath);
    });

    it("should return the original path if given a single point", () => {
      const path = [{ lat: -3.645421873728663, lng: -17.47186660766602 }];
      const newPath = addPointsAtMeters(path, 10, earthRadius);
      expect(path).toEqual(newPath);
    });
  });
});

describe("getSlope()", () => {
  test("should return the slope in degrees given two points", () => {
    expect(getSlope(0, 0, 1, 1)).toBe(45);
    expect(getSlope(1, 2, 3, 4)).toBe(45);
    expect(getSlope(-1, -2, -3, -4)).toBe(45);
    expect(getSlope(0, 0, -1, -1)).toBe(45);
    expect(getSlope(2, 4, 0, 0)).toBe(63.43494882292201);
    expect(getSlope(-2, -4, 0, 0)).toBe(63.43494882292201);
    expect(getSlope(0, 0, 0, 1)).toBe(90);
    expect(getSlope(0, 0, 0, -1)).toBe(90);
    expect(getSlope(0, 0, 1, 0)).toBe(0);
    expect(getSlope(0, 0, -1, 0)).toBe(-0);
  });

  test("should return 90 if the run is zero", () => {
    expect(getSlope(0, 0, 0, 1)).toBe(90);
    expect(getSlope(1, 2, 1, 3)).toBe(90);
    expect(getSlope(-1, -2, -1, -3)).toBe(90);
  });
});

describe("calcPathDurationMins()", () => {
  test("returns 0 when segmentDistances is not provided", () => {
    expect(calcPathDurationMins(null, 10)).toBe(0);
  });

  test("returns 0 when traverseRate is not provided", () => {
    expect(calcPathDurationMins([1000, 2000], null)).toBe(0);
  });

  test("returns 0 when both segmentDistances and traverseRate are not provided", () => {
    expect(calcPathDurationMins(null, null)).toBe(0);
  });

  test("returns correct duration for a single segment", () => {
    expect(calcPathDurationMins([1000], 10)).toBe(6);
  });

  test("returns correct duration for multiple segments", () => {
    expect(calcPathDurationMins([500, 500], 1)).toBe(60);
  });

  test("returns 0 when segmentDistances is an empty array", () => {
    expect(calcPathDurationMins([], 10)).toBe(0);
  });

  test("returns 0 when traverseRate is 0", () => {
    expect(calcPathDurationMins([1000, 2000], 0)).toBe(0);
  });

  test("returns 0 when segmentDistances and traverseRate are both 0", () => {
    expect(calcPathDurationMins([0, 0], 0)).toBe(0);
  });
});
