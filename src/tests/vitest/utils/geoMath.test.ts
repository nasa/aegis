import {
  addPointsAtMeters,
  calcCentroidofCoordinates,
  getDistanceBetweenTwoCoordinates,
  getGridCoordinatesFromPoint,
  getSegmentBearing,
  getSlope,
  getTotalDistance,
  getTrueBearingFromLatLngPoints,
  calcPathDurationMins,
} from "utils/mapping/geoMath";
import { getBearingFromLatLngPoints } from "utils/surf-nav/surfNavWrapper";

describe("Geomath Functions", () => {
  const earthRadius = 6371000; //6378137;

  test("uses the LGRS display port for LGRS grid coordinates", () => {
    expect(getGridCoordinatesFromPoint({ lat: -89, lng: -133 }, 1737400, true)).toBe("B95 D44");
  });

  test("Returns 0 distance between two identical coordinates", () => {
    const point: AEGISPoint = { lat: 0, lng: 0 };
    expect(getDistanceBetweenTwoCoordinates(point, point, 0)).toBe(0);
  });

  describe("getDistanceBetweenTwoCoordinates", () => {
    test("should correctly calculate distance between two points", () => {
      const point1: AEGISPoint = { lat: 37.7749, lng: -122.4194 }; // San Francisco
      const point2: AEGISPoint = { lat: 34.0522, lng: -118.2437 }; // Los Angeles
      const radius = earthRadius; // Earth's radius in meters

      const distance = getDistanceBetweenTwoCoordinates(point1, point2, radius);

      expect(distance).toBeCloseTo(559120.5770615533, 3);
    });

    test("should return null when either point is null", () => {
      const point: AEGISPoint = { lat: 37.7749, lng: -122.4194 };
      const radius = earthRadius;

      expect(getDistanceBetweenTwoCoordinates(null, point, radius)).toBeNull();
      expect(getDistanceBetweenTwoCoordinates(point, null, radius)).toBeNull();
      expect(getDistanceBetweenTwoCoordinates(null, null, radius)).toBeNull();
    });

    test("should return 0 when radius is 0", () => {
      const point1: AEGISPoint = { lat: 37.7749, lng: -122.4194 };
      const point2: AEGISPoint = { lat: 34.0522, lng: -118.2437 };

      expect(getDistanceBetweenTwoCoordinates(point1, point2, 0)).toBe(0);
    });

    test("should return negative distance when radius is negative", () => {
      const point1: AEGISPoint = { lat: 37.7749, lng: -122.4194 };
      const point2: AEGISPoint = { lat: 34.0522, lng: -118.2437 };
      const radius = -earthRadius;

      const distance = getDistanceBetweenTwoCoordinates(point1, point2, radius);

      expect(distance).toBeCloseTo(-559120.5770615533, 1);
    });

    test("should return a small number when the two points are very close together", () => {
      const point1: AEGISPoint = { lat: 37.7749, lng: -122.4190004 };
      const point2: AEGISPoint = { lat: 37.7749, lng: -122.4190005 };
      const radius = earthRadius;

      const distance = getDistanceBetweenTwoCoordinates(point1, point2, radius);

      expect(distance).toBeCloseTo(0.008789, 6);
    });

    test("should return a small number when the two points are very close together on the south pole of the moon", () => {
      const point1: AEGISPoint = { lat: -90, lng: 0 };
      const point2: AEGISPoint = { lat: -90, lng: 0.0000001 };
      const radius = 1737100;

      const distance = getDistanceBetweenTwoCoordinates(point1, point2, radius);

      expect(distance).toBeCloseTo(0.0000001, 6);
    });
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

describe("getTrueBearingFromLatLngPoints()", () => {
  test("returns 0 for a due-north segment", () => {
    expect(getTrueBearingFromLatLngPoints({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(
      0,
      6
    );
  });

  test("returns 90 for a due-east segment", () => {
    expect(getTrueBearingFromLatLngPoints({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(
      90,
      6
    );
  });

  test("returns 180 for a due-south segment", () => {
    expect(getTrueBearingFromLatLngPoints({ lat: 0, lng: 0 }, { lat: -1, lng: 0 })).toBeCloseTo(
      180,
      6
    );
  });

  test("returns 270 for a due-west segment (normalised to [0, 360))", () => {
    expect(getTrueBearingFromLatLngPoints({ lat: 0, lng: 0 }, { lat: 0, lng: -1 })).toBeCloseTo(
      270,
      6
    );
  });

  test("matches a known great-circle azimuth (Kansas City → St Louis)", () => {
    const bearing = getTrueBearingFromLatLngPoints(
      { lat: 39.099912, lng: -94.581213 },
      { lat: 38.627089, lng: -90.200203 }
    );
    expect(bearing).toBeCloseTo(96.5126, 3);
  });
});

describe("getSegmentBearing()", () => {
  // An east-west segment at mission-4's latitude (Earth / Web Mercator, ~35.5°N).
  const horizontalWest: AEGISPoint = { lat: 35.5, lng: -111.727 };
  const horizontalEast: AEGISPoint = { lat: 35.5, lng: -111.717 };

  describe("Mercator / non-LGRS missions (true-north azimuth)", () => {
    test("a horizontal east-west line reads ~90°", () => {
      expect(getSegmentBearing(horizontalWest, horizontalEast, false)).toBeCloseTo(90, 1);
    });

    test("delegates to getTrueBearingFromLatLngPoints", () => {
      expect(getSegmentBearing(horizontalWest, horizontalEast, false)).toBe(
        getTrueBearingFromLatLngPoints(horizontalWest, horizontalEast)
      );
    });
  });

  describe("LGRS / lunar missions (LPS grid bearing)", () => {
    test("uses the lunar LPS frame, so an Earth horizontal line does NOT read ~90°", () => {
      const bearing = getSegmentBearing(horizontalWest, horizontalEast, true);
      // Same points through the LPS south-pole projection → ~338°, not 90°.
      expect(bearing).toBeCloseTo(338.278, 2);
      expect(bearing).not.toBeCloseTo(90, 0);
    });

    test("delegates to getBearingFromLatLngPoints", () => {
      expect(getSegmentBearing(horizontalWest, horizontalEast, true)).toBe(
        getBearingFromLatLngPoints(horizontalWest, horizontalEast)
      );
    });
  });

  test("LGRS and Mercator disagree for the same Earth segment", () => {
    const lgrs = getSegmentBearing(horizontalWest, horizontalEast, true);
    const mercator = getSegmentBearing(horizontalWest, horizontalEast, false);
    expect(Math.abs(lgrs - mercator)).toBeGreaterThan(1);
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
