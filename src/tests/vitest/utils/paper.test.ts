import type { Mock } from "vitest";
import {
  buildDistanceElevationProfile,
  buildDistanceTerrainSlopeProfile,
  calculateWindowedPathSlopes,
  getGraphSlopeAtX,
  getHoverValue,
} from "../../../utils/paper";
import { getSlope } from "../../../utils/mapping/geoMath";

vi.mock("../../../utils/mapping/geoMath");

describe("getHoverValue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return correct y, val, and slope when hover point falls between two points", () => {
    const graphArray = [
      { xPixel: 0, yPixel: 0, val: 10 },
      { xPixel: 100, yPixel: 100, val: 20 },
    ];
    const hoverPointX = 50;

    (getSlope as Mock).mockReturnValue(0.1);

    const result = getHoverValue(graphArray, hoverPointX);

    expect(result.y).toBe(50); // Midpoint between 0 and 100
    expect(result.val).toBe(15); // Midpoint between 10 and 20
    expect(result.slope).toBe(0.1); // Value from mocked getSlope
    expect(getSlope).toHaveBeenCalledWith(0, 10, 100, 20);
  });

  it("calculates slope using physical distance when available", () => {
    const graphArray = [
      { xPixel: 0, yPixel: 100, val: 10, distanceMeters: 0 },
      { xPixel: 200, yPixel: 50, val: 20, distanceMeters: 100 },
    ];

    (getSlope as Mock).mockReturnValue(5.71);

    expect(getHoverValue(graphArray, 100).slope).toBe(5.71);
    expect(getSlope).toHaveBeenCalledWith(0, 10, 100, 20);
  });

  it("uses the windowed slope represented by the graph", () => {
    const graphArray = [
      { xPixel: 0, yPixel: 100, val: 10, distanceMeters: 0, slopeDegrees: 4 },
      { xPixel: 200, yPixel: 50, val: 20, distanceMeters: 100, slopeDegrees: 6 },
    ];

    expect(getHoverValue(graphArray, 100).slope).toBe(5);
    expect(getSlope).not.toHaveBeenCalled();
  });

  it("should return the last point data when hover point is beyond the last data point", () => {
    const graphArray = [
      { xPixel: 0, yPixel: 0, val: 10 },
      { xPixel: 100, yPixel: 100, val: 20 },
    ];
    const hoverPointX = 150;

    (getSlope as Mock).mockReturnValue(0.1);

    const result = getHoverValue(graphArray, hoverPointX);

    expect(result.y).toBe(100); // The y value of the last point
    expect(result.val).toBe(20); // The val of the last point
    expect(result.slope).toBe(0); // Expecting 0 because it's beyond the last point
  });

  it("should return the first point data when hover point is before the first data point", () => {
    const graphArray = [
      { xPixel: 0, yPixel: 0, val: 10 },
      { xPixel: 100, yPixel: 100, val: 20 },
    ];
    const hoverPointX = -10;

    // Mock the slope to return 0 when the points are the same
    (getSlope as Mock).mockReturnValue(0);

    const result = getHoverValue(graphArray, hoverPointX);

    expect(result.y).toBe(0); // The y value of the first point
    expect(result.val).toBe(10); // The val of the first point
    expect(result.slope).toBe(0); // Expecting 0 because it's before the first point
    expect(getSlope).toHaveBeenCalledWith(0, 10, 0, 10); // Expect slope calc with the same point
  });

  it("should not extrapolate if the values of the two points are equal (stationary points)", () => {
    const graphArray = [
      { xPixel: 0, yPixel: 0, val: 10 },
      { xPixel: 100, yPixel: 100, val: 10 },
    ];
    const hoverPointX = 50;

    (getSlope as Mock).mockReturnValue(0.1);

    const result = getHoverValue(graphArray, hoverPointX);

    expect(result.y).toBe(0); // Same as pointBefore.yPixel
    expect(result.val).toBe(10); // Same as pointBefore.val
    expect(result.slope).toBe(0.1); // Value from mocked getSlope
    expect(getSlope).toHaveBeenCalledWith(0, 10, 100, 10);
  });

  it("should handle case when hover point is exactly at a graph data point", () => {
    const graphArray = [
      { xPixel: 0, yPixel: 0, val: 10 },
      { xPixel: 100, yPixel: 100, val: 20 },
    ];
    const hoverPointX = 100;

    (getSlope as Mock).mockReturnValue(0.1);

    const result = getHoverValue(graphArray, hoverPointX);

    expect(result.y).toBe(100);
    expect(result.val).toBe(20);
    expect(result.slope).toBe(0.1);
    expect(getSlope).toHaveBeenCalledWith(0, 10, 100, 20);
  });
});

describe("buildDistanceElevationProfile", () => {
  it("places samples by distance and removes shared segment endpoints", () => {
    expect(
      buildDistanceElevationProfile(
        [
          [100, 110, 120],
          [120, 115],
        ],
        [20, 30]
      )
    ).toEqual([
      { distanceMeters: 0, elevationMeters: 100 },
      { distanceMeters: 10, elevationMeters: 110 },
      { distanceMeters: 20, elevationMeters: 120 },
      { distanceMeters: 50, elevationMeters: 115 },
    ]);
  });

  it("uses each segment's own sample spacing", () => {
    expect(
      buildDistanceElevationProfile(
        [
          [0, 10],
          [10, 20, 30],
        ],
        [10, 40]
      )
    ).toEqual([
      { distanceMeters: 0, elevationMeters: 0 },
      { distanceMeters: 10, elevationMeters: 10 },
      { distanceMeters: 30, elevationMeters: 20 },
      { distanceMeters: 50, elevationMeters: 30 },
    ]);
  });
});

describe("buildDistanceTerrainSlopeProfile", () => {
  it("places stored samples by distance and preserves null gaps", () => {
    expect(
      buildDistanceTerrainSlopeProfile(
        [
          [2, null, 4],
          [4, 8],
        ],
        [20, 30],
        [
          [100, 101, 102],
          [102, 103],
        ]
      )
    ).toEqual([
      { distanceMeters: 0, slopeDegrees: 2 },
      { distanceMeters: 10, slopeDegrees: null },
      { distanceMeters: 20, slopeDegrees: 4 },
      { distanceMeters: 50, slopeDegrees: 8 },
    ]);
  });

  it("rejects outer and inner profile shape mismatches", () => {
    expect(buildDistanceTerrainSlopeProfile([[2]], [10, 20], [[100]])).toEqual([]);
    expect(buildDistanceTerrainSlopeProfile([[2]], [10], null)).toEqual([]);
    expect(buildDistanceTerrainSlopeProfile([[2, 4]], [10], [[100]])).toEqual([]);
  });

  it("normalizes a missing legacy profile to no graph data", () => {
    expect(buildDistanceTerrainSlopeProfile(undefined, [10])).toEqual([]);
    expect(buildDistanceTerrainSlopeProfile(null, [10])).toEqual([]);
  });

  it("rejects a profile containing a negative or non-finite slope sample", () => {
    expect(buildDistanceTerrainSlopeProfile([[2, -4]], [10], [[100, 101]])).toEqual([]);
    expect(buildDistanceTerrainSlopeProfile([[2, Infinity]], [10], [[100, 101]])).toEqual([]);
  });
});

describe("getGraphSlopeAtX", () => {
  const data: GraphDataItem[] = [
    { xPixel: 0, yPixel: 0, val: -4, slopeDegrees: -4 },
    { xPixel: 10, yPixel: 0, val: 0, slopeDegrees: null },
    { xPixel: 20, yPixel: 0, val: 8, slopeDegrees: 8 },
  ];

  it("preserves signed values and interpolates available intervals", () => {
    expect(getGraphSlopeAtX(data, 0)).toBe(-4);
    expect(
      getGraphSlopeAtX(
        [
          { xPixel: 0, yPixel: 0, val: -4, slopeDegrees: -4 },
          { xPixel: 10, yPixel: 0, val: -2, slopeDegrees: -2 },
        ],
        5
      )
    ).toBe(-3);
  });

  it("does not interpolate across null gaps", () => {
    expect(getGraphSlopeAtX(data, 5)).toBeNull();
    expect(getGraphSlopeAtX(data, 10)).toBeNull();
    expect(getGraphSlopeAtX(data, 15)).toBeNull();
  });
});

describe("calculateWindowedPathSlopes", () => {
  it("preserves a constant grade at irregular sample spacing", () => {
    const profile = [0, 7, 18, 31, 50, 72].map((distanceMeters) => ({
      distanceMeters,
      elevationMeters: distanceMeters * 0.1,
    }));

    for (const slope of calculateWindowedPathSlopes(profile, 50)) {
      expect(slope).toBeCloseTo(5.7106, 3);
    }
  });

  it("returns a negative slope for a downhill profile", () => {
    const profile = [0, 10, 20, 30].map((distanceMeters) => ({
      distanceMeters,
      elevationMeters: 10 - distanceMeters * 0.1,
    }));

    for (const slope of calculateWindowedPathSlopes(profile, 20)) {
      expect(slope).toBeCloseTo(-5.7106, 3);
    }
  });

  it("suppresses alternating single-sample elevation noise", () => {
    const profile = Array.from({ length: 11 }, (_, index) => ({
      distanceMeters: index * 10,
      elevationMeters: index + (index % 2 === 0 ? 1 : -1),
    }));

    const slopes = calculateWindowedPathSlopes(profile, 50);

    expect(Math.max(...slopes.slice(2, -2)) - Math.min(...slopes.slice(2, -2))).toBeLessThan(1);
    expect(slopes[5]).toBeCloseTo(5.7106, 1);
  });

  it("returns zero when there is not enough distance to calculate a slope", () => {
    expect(calculateWindowedPathSlopes([{ distanceMeters: 0, elevationMeters: 5 }])).toEqual([0]);
    expect(
      calculateWindowedPathSlopes([
        { distanceMeters: 0, elevationMeters: 5 },
        { distanceMeters: 0, elevationMeters: 10 },
      ])
    ).toEqual([0, 0]);
  });
});
