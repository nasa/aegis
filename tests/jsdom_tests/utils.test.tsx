import { describe, expect, test, it } from "@jest/globals";
import {
  addPointsAtMeters,
  calcCentroidofCoordinates,
  computeDestinationPoint,
  convertLeafletLatLngToAegisPoint,
  getDistanceBetweenTwoCoordinates,
  getRhumbLineBearing,
  getSlope,
  getTotalDistance,
  traverseDurationMinutes,
} from "utils/geoMath";
import { LatLng } from "leaflet";
import {
  appSecondsFromDateString,
  formatNumberWithCommas,
  getJulianDate,
  getPlayheadISOString,
  hhmmFromMinutes,
  hhmmssFromDateString,
  hhmmssFromSeconds,
  hhmmssmmmFromSeconds,
  isoStringFromAnyDateString,
  padZeros,
  shortdateFromDateString,
  toDecimal,
} from "utils/formatting";
import { getEM } from "utils/mikro";

describe("Utilities Functions", () => {
  const earthRadius = 6371000; //6378137;
  const latLng1: LatLng = new LatLng(0, 0);
  const latLng2: LatLng = new LatLng(0, 0);
  const tests = [
    {
      num: 7,
      size: 2,
      expected: "07",
    },
    {
      num: 23,
      size: 2,
      expected: "23",
    },
    {
      num: 222,
      size: 2,
      expected: "222",
    },
    {
      num: 0,
      size: 5,
      expected: "00000",
    },
    {
      num: 0,
      size: 0,
      expected: "0",
    },
    {
      num: 5,
      size: -3,
      expected: "5",
    },
  ];

  for (const test of tests) {
    it(`should result in "${test.expected}" when ${test.num} padded with ${test.size} zeros`, () => {
      expect(padZeros(test.num, test.size)).toEqual(test.expected);
    });
  }
  test("GeoMath: Returns 0 distance between two identical coordinates", () => {
    expect(getDistanceBetweenTwoCoordinates(latLng1, latLng2, 0)).toBe(0);
  });
  test("GeoMath: Convert leaflet latlng to aegispoint", () => {
    const latlng = new LatLng(0, 0);
    const aegispoint = convertLeafletLatLngToAegisPoint(latlng);
    expect(aegispoint.lat).toBe(0);
    expect(aegispoint.lng).toBe(0);
  });

  test("GeoMath: Returns 0 distance between three identical coordinates", () => {
    const point1 = {
      lat: 0,
      lng: 0,
    } as AEGISPoint;
    const radiusOfEarth = 6371000;
    expect(getTotalDistance([point1, point1, point1], radiusOfEarth)).toBe(0);
  });

  test("GeoMath: calcCentroidofCoordinates returns known results for 2 test cases", () => {
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

  test("Formatting: Calculates Seconds into day", () => {
    const julianDateTest = new Date("2020-01-01T00:00:00Z");

    expect(appSecondsFromDateString("2021-01-01T00:00:00.000Z")).toBe(0);
    expect(hhmmssFromDateString("2021-01-01T00:00:00.000Z")).toBe("00:00:00");
    expect(hhmmssmmmFromSeconds(0)).toBe("00:00:00.000");
    expect(hhmmssmmmFromSeconds(-5)).toBe("-00:00:05.000");
    expect(hhmmssFromDateString("")).toBe("");
    expect(hhmmssFromSeconds(0)).toBe("00:00:00");
    expect(hhmmssFromSeconds(-5)).toBe("-00:00:05");
    expect(shortdateFromDateString("2021-01-01T00:00:00.000Z")).toBe("2021-01-01");
    expect(shortdateFromDateString("")).toBe("");
    expect(isoStringFromAnyDateString("2021-01-01T00:00:00.000Z")).toBe("2021-01-01T00:00:00.000Z");
    expect(() => isoStringFromAnyDateString("XX")).toThrow(
      "The date string couldn't be converted into a Date"
    );
    expect(getPlayheadISOString("2021-01-01T00:00:00.000Z", 0)).toBe("2021-01-01T00:00:00.000Z");

    expect(getJulianDate(julianDateTest)).toBe("2020/1");

    expect(toDecimal("0")).toBe(0);
    expect(toDecimal("0.0")).toBe(0);
    expect(toDecimal("0.00")).toBe(0);
    expect(toDecimal("5..5")).toBe(5.5);
    expect(toDecimal("5.5")).toBe(5.5);
    expect(toDecimal("5.5k")).toBe(5.5);
    expect(toDecimal("sdfsdf")).toBe(null);
    expect(toDecimal(null)).toBe(null);
    expect(toDecimal("")).toBe(null);
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

  describe("Mikro ORM", () => {
    test("Entity Manager Error", async () => {
      expect(() => getEM()).toThrow("Run Mikro.getORM() first");
    });
  });
});

describe("getSlope", () => {
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

describe("hhmmFromMinutes", () => {
  it("should format positive minutes into hh:mm", () => {
    expect(hhmmFromMinutes(90)).toEqual("01:30");
    expect(hhmmFromMinutes(120)).toEqual("02:00");
    expect(hhmmFromMinutes(720)).toEqual("12:00");
  });

  it("should format negative minutes into -hh:mm", () => {
    expect(hhmmFromMinutes(-90)).toEqual("-01:30");
    expect(hhmmFromMinutes(-120)).toEqual("-02:00");
    expect(hhmmFromMinutes(-720)).toEqual("-12:00");
  });

  it("should format zero minutes into 00:00", () => {
    expect(hhmmFromMinutes(0)).toEqual("00:00");
  });

  it("should pad single digit hours and minutes with zeros", () => {
    expect(hhmmFromMinutes(9)).toEqual("00:09");
    expect(hhmmFromMinutes(63)).toEqual("01:03");
    expect(hhmmFromMinutes(600)).toEqual("10:00");
  });
});

describe("traverseDurationMinutes", () => {
  test("returns 0 when segmentDistances is not provided", () => {
    expect(traverseDurationMinutes(null, 10)).toBe(0);
  });

  test("returns 0 when traverseRate is not provided", () => {
    expect(traverseDurationMinutes([1000, 2000], null)).toBe(0);
  });

  test("returns 0 when both segmentDistances and traverseRate are not provided", () => {
    expect(traverseDurationMinutes(null, null)).toBe(0);
  });

  test("returns correct duration for a single segment", () => {
    expect(traverseDurationMinutes([1000], 10)).toBe(6);
  });

  test("returns correct duration for multiple segments", () => {
    expect(traverseDurationMinutes([500, 500], 1)).toBe(60);
  });

  test("returns 0 when segmentDistances is an empty array", () => {
    expect(traverseDurationMinutes([], 10)).toBe(0);
  });

  test("returns 0 when traverseRate is 0", () => {
    expect(traverseDurationMinutes([1000, 2000], 0)).toBe(0);
  });

  test("returns 0 when segmentDistances and traverseRate are both 0", () => {
    expect(traverseDurationMinutes([0, 0], 0)).toBe(0);
  });
});

describe("formatNumberWithCommas", () => {
  it("formats numbers with commas", () => {
    expect(formatNumberWithCommas(1000)).toBe("1,000.00");
    expect(formatNumberWithCommas(123456789.12)).toBe("123,456,789.12");
    expect(formatNumberWithCommas(9876543210.123)).toBe("9,876,543,210.12");
  });

  it('returns "0.00" when given 0', () => {
    expect(formatNumberWithCommas(0)).toBe("0.00");
  });
});
