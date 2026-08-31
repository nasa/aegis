import type { Mock } from "vitest";
import { getHoverValue } from "../../../utils/paper";
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
