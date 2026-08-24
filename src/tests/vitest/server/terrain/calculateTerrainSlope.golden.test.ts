import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { closeRasterCache } from "server/raster/rasterCache";
import { sampleRasterNeighborhoods } from "server/raster/sampleRasterPoints";
import { calculateTerrainSlopeDegrees } from "server/terrain/calculateTerrainSlope";

type SlopeGoldenCorpus = {
  raster: { name: string };
  cases: {
    pixel: [number, number];
    point: { lat: number; lng: number };
    rawElevation: number | null;
    expectedSlopeDegrees: number | null;
  }[];
};

const fixtureDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/raster"
);
const corpus = JSON.parse(
  await fs.readFile(path.join(fixtureDirectory, "terrain-slope-goldens.json"), "utf8")
) as SlopeGoldenCorpus;
// GDAL evaluates its Horn kernel in Float32; the server keeps decoded samples in Float64.
const GDAL_SLOPE_TOLERANCE_DEGREES = 0.025;

describe("calculateTerrainSlopeDegrees GDAL reference corpus", () => {
  afterAll(closeRasterCache);

  it("matches GDAL Horn slopes across a production DEM extract", async () => {
    const sampled = await sampleRasterNeighborhoods(
      { absolutePath: path.join(fixtureDirectory, corpus.raster.name) },
      corpus.cases.map(({ point }) => point)
    );

    expect(sampled.neighborhoods).toHaveLength(corpus.cases.length);
    corpus.cases.forEach((golden, index) => {
      const label = `pixel ${golden.pixel.join(",")}`;
      const center = sampled.centerSamples[index];
      if (golden.rawElevation === null) {
        expect(center.status, label).toBe("missing");
      } else {
        expect(center, label).toEqual({ status: "value", value: golden.rawElevation });
      }

      const actual = calculateTerrainSlopeDegrees(sampled.neighborhoods[index], sampled.metadata);
      if (golden.expectedSlopeDegrees === null) {
        expect(actual, label).toBeNull();
      } else {
        expect(actual, label).not.toBeNull();
        expect(Math.abs(actual! - golden.expectedSlopeDegrees), label).toBeLessThanOrEqual(
          GDAL_SLOPE_TOLERANCE_DEGREES
        );
      }
    });
  });
});
