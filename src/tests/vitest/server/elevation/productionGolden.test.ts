import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NODATA_SENTINEL, readElevationProfile } from "server/elevation/readElevationProfile";
import { closeRasterCache } from "server/raster/rasterCache";
import { sampleRasterPoints } from "server/raster/sampleRasterPoints";

type GoldenCase = {
  name: string;
  points: { lat: number; lng: number }[];
  values: number[];
};

const fixtureDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/raster"
);

const manifest = JSON.parse(
  await fs.readFile(path.join(fixtureDirectory, "production-goldens.json"), "utf8")
) as { cases: GoldenCase[] };

describe("production DEM golden extracts", () => {
  afterAll(closeRasterCache);

  it.each(manifest.cases)("matches GDAL samples for $name", async (golden) => {
    const result = await sampleRasterPoints(
      { absolutePath: path.join(fixtureDirectory, golden.name) },
      golden.points
    );

    expect(result.samples).toEqual(golden.values.map((value) => ({ status: "value", value })));
  });

  it.each(manifest.cases)("preserves profile output for $name", async (golden) => {
    const result = await readElevationProfile(
      { absolutePath: path.join(fixtureDirectory, golden.name) },
      [golden.points[0], golden.points[1]],
      [2]
    );

    expect(result.elevations).toEqual([[golden.values[0], golden.values[1]]]);
    expect(result.elevations[0]).not.toContain(NODATA_SENTINEL);
  });
});
