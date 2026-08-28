import { intermediatePoint, interpolateSegment } from "server/raster/greatCircleInterpolation";

describe("great-circle interpolation", () => {
  it("matches the Python great-circle reference midpoint", () => {
    const midpoint = intermediatePoint({ lat: -85, lng: -20 }, { lat: -84.5, lng: -19 }, 0.5);

    expect(midpoint.lat).toBeCloseTo(-84.75019833866531, 12);
    expect(midpoint.lng).toBeCloseTo(-19.476256396530708, 12);
  });

  it("preserves the legacy endpoint behavior for zero and one step", () => {
    const start = { lat: -3.6, lng: -17.4 };
    const end = { lat: -3.7, lng: -17.5 };

    expect(interpolateSegment(start, end, 0)).toEqual([start, end]);
    expect(interpolateSegment(start, end, 1)).toEqual([start, end]);
  });
});
