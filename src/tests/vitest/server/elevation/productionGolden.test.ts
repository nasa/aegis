import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
});
