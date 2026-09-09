import { copyFile, mkdtemp, rm, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { closeRasterCache, getCachedRaster } from "server/raster/rasterCache";

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/raster/lunar-tiled.tif"
);

describe("rasterCache", () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    await closeRasterCache();
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "aegis-raster-cache-"));
  });

  afterEach(async () => {
    await closeRasterCache();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("reuses an open raster and deduplicates concurrent opens", async () => {
    const rasterPath = path.join(temporaryDirectory, "a.tif");
    await copyFile(fixturePath, rasterPath);

    const [first, second] = await Promise.all([
      getCachedRaster(rasterPath),
      getCachedRaster(rasterPath),
    ]);
    const third = await getCachedRaster(rasterPath);

    expect(first).toBe(second);
    expect(third).toBe(first);
  });

  it("invalidates a changed file", async () => {
    const rasterPath = path.join(temporaryDirectory, "a.tif");
    await copyFile(fixturePath, rasterPath);
    const first = await getCachedRaster(rasterPath);
    const changedTime = new Date(Date.now() + 10_000);
    await utimes(rasterPath, changedTime, changedTime);

    const second = await getCachedRaster(rasterPath);

    expect(second).not.toBe(first);
  });

  it("uses least-recently-used eviction with an eight-handle bound", async () => {
    const paths = await Promise.all(
      Array.from({ length: 9 }, async (_, index) => {
        const rasterPath = path.join(temporaryDirectory, `${index}.tif`);
        await copyFile(fixturePath, rasterPath);
        return rasterPath;
      })
    );
    const opened = [];
    for (const rasterPath of paths.slice(0, 8)) opened.push(await getCachedRaster(rasterPath));
    await getCachedRaster(paths[0]);
    await getCachedRaster(paths[8]);

    expect(await getCachedRaster(paths[0])).toBe(opened[0]);
    expect(await getCachedRaster(paths[1])).not.toBe(opened[1]);
  });
});
