import path from "node:path";
import { fileURLToPath } from "node:url";

import { closeRasterCache } from "server/raster/rasterCache";
import { sampleRasterNeighborhoods, sampleRasterPoints } from "server/raster/sampleRasterPoints";

const fixtureDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/raster"
);
const fixture = (name: string) => path.join(fixtureDirectory, name);

const toPoint = (x: number, y: number) => ({
  lng: -0.5274722222222222 + x / 30.3231045833,
  lat: 0.5274722222222222 - y / 30.3231045833,
});

describe("sampleRasterPoints", () => {
  afterAll(closeRasterCache);

  it.each([
    ["lunar-tiled.tif", true, 2],
    ["lunar-striped.tif", false, 2],
  ])("samples the deterministic %s fixture", async (name, isTiled, expectedBlocks) => {
    const result = await sampleRasterPoints({ absolutePath: fixture(name) }, [
      toPoint(1.25, 1.25),
      toPoint(2.25, 1.25),
      toPoint(3.25, 2.25),
      toPoint(20.25, 20.25),
    ]);

    expect(result.metadata.isTiled).toBe(isTiled);
    expect(result.blocksRead).toBe(expectedBlocks);
    expect(result.samples).toEqual([
      { status: "value", value: 33 },
      { status: "value", value: 34 },
      { status: "missing", reason: "nodata" },
      { status: "value", value: 660 },
    ]);
  });

  it("selects a non-default sample and does not read out-of-bounds points", async () => {
    const result = await sampleRasterPoints(
      { absolutePath: fixture("lunar-tiled.tif"), sampleIndex: 1 },
      [toPoint(1.25, 1.25), toPoint(-2, -2)]
    );

    expect(result.blocksRead).toBe(1);
    expect(result.samples).toEqual([
      { status: "value", value: 10033 },
      { status: "missing", reason: "out-of-bounds" },
    ]);
  });

  it.each([
    ["lunar-tiled.tif", true],
    ["lunar-striped.tif", false],
  ])("deduplicates overlapping 3x3 neighborhoods in %s", async (name, isTiled) => {
    const result = await sampleRasterNeighborhoods({ absolutePath: fixture(name) }, [
      toPoint(7.25, 7.25),
      toPoint(8.25, 7.25),
    ]);

    expect(result.metadata.isTiled).toBe(isTiled);
    expect(result.uniquePixelsRead).toBe(12);
    expect(result.neighborhoods).toHaveLength(2);
    expect(result.neighborhoods.every((neighborhood) => neighborhood.length === 9)).toBe(true);
    expect(result.centerSamples).toEqual([
      { status: "value", value: 231 },
      { status: "value", value: 232 },
    ]);
  });

  it("returns a valid border elevation with an unavailable neighborhood", async () => {
    const result = await sampleRasterNeighborhoods({ absolutePath: fixture("lunar-tiled.tif") }, [
      toPoint(0.25, 0.25),
    ]);

    expect(result.centerSamples).toEqual([{ status: "value", value: 0 }]);
    expect(result.neighborhoods[0].some((sample) => sample.status === "missing")).toBe(true);
  });
});
