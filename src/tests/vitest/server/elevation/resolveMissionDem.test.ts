import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveMissionDemPath } from "server/elevation/resolveMissionDem";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "aegis-dem-"));
  await mkdir(path.join(root, "missionFiles", "42", "Data"), { recursive: true });
});

afterEach(async () => rm(root, { recursive: true, force: true }));

describe("resolveMissionDemPath", () => {
  it("resolves a configured GeoTIFF inside the authorized mission Data directory", async () => {
    const raster = path.join(root, "missionFiles", "42", "Data", "dem.tif");
    await writeFile(raster, "fixture");

    await expect(resolveMissionDemPath(root, 42, "Data/dem.tif")).resolves.toBe(raster);
  });

  it("rejects paths outside the mission Data directory", async () => {
    const raster = path.join(root, "missionFiles", "42", "other.tif");
    await writeFile(raster, "fixture");

    await expect(resolveMissionDemPath(root, 42, "other.tif")).rejects.toThrow("Data directory");
  });

  it("rejects symlinks that escape the mission Data directory", async () => {
    const outside = path.join(root, "outside");
    const raster = path.join(outside, "dem.tif");
    const link = path.join(root, "missionFiles", "42", "Data", "linked");
    await mkdir(outside);
    await writeFile(raster, "fixture");
    await symlink(outside, link, "junction");

    await expect(resolveMissionDemPath(root, 42, "Data/linked/dem.tif")).rejects.toThrow(
      "Data directory"
    );
  });
});
