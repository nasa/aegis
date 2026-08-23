import { calculateTerrainSlopeDegrees } from "server/terrain/calculateTerrainSlope";

const metadata = (resolution: [number, number] = [2, -3]): RasterMetadata => ({
  width: 10,
  height: 10,
  origin: [0, 0],
  resolution,
  blockSize: [4, 4],
  isTiled: true,
  samplesPerPixel: 1,
  noData: null,
  scale: 1,
  offset: 0,
  geoKeys: { ProjLinearUnitsGeoKey: 9001 },
});

const plane = (xGradient: number, yGradient: number, rasterMetadata = metadata()): RasterSample[] =>
  [-1, 0, 1].flatMap((y) =>
    [-1, 0, 1].map((x) => ({
      status: "value" as const,
      value:
        100 +
        x * Math.abs(rasterMetadata.resolution[0]) * xGradient +
        y * Math.abs(rasterMetadata.resolution[1]) * yGradient,
    }))
  );

describe("calculateTerrainSlopeDegrees", () => {
  it.each([
    ["flat", 0, 0],
    ["x plane", 0.25, 0],
    ["y plane", 0, -0.5],
    ["diagonal plane", 0.25, -0.5],
  ])("calculates an analytical %s", (_name, xGradient, yGradient) => {
    const expected = (Math.atan(Math.hypot(xGradient, yGradient)) * 180) / Math.PI;
    expect(calculateTerrainSlopeDegrees(plane(xGradient, yGradient), metadata())).toBeCloseTo(
      expected,
      10
    );
  });

  it("applies scale and offset while supporting rectangular pixels and negative Y resolution", () => {
    const rasterMetadata = { ...metadata([4, -2]), scale: 0.5, offset: 1000 };
    const raw = plane(0.4 / rasterMetadata.scale, -0.2 / rasterMetadata.scale, rasterMetadata);
    const expected = (Math.atan(Math.hypot(0.4, 0.2)) * 180) / Math.PI;
    expect(calculateTerrainSlopeDegrees(raw, rasterMetadata)).toBeCloseTo(expected, 10);
  });

  it("returns null when the center or any neighbor is unavailable", () => {
    const samples = plane(0, 0);
    samples[0] = { status: "missing", reason: "nodata" };
    expect(calculateTerrainSlopeDegrees(samples, metadata())).toBeNull();
    samples[0] = { status: "value", value: 100 };
    samples[4] = { status: "missing", reason: "out-of-bounds" };
    expect(calculateTerrainSlopeDegrees(samples, metadata())).toBeNull();
  });
});
