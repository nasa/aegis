// @vitest-environment node
import path from "node:path";
import { mkdtemp, mkdir, copyFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { writeArrayBuffer } from "geotiff";
import { listMissionDems, readMissionDem, resolveMissionDemPath } from "server/raster/missionDems";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "aegis-dems-"));
  vi.stubEnv("STATIC_DIR", directory);
  await mkdir(path.join(directory, "missionFiles/42/Data/nested"), { recursive: true });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

test("discovers nested GeoTIFFs, detects native resolution, and explains invalid files", async () => {
  const fixture = path.resolve("src/tests/vitest/fixtures/raster/mission50-golden-tiled.tif");
  const data = path.join(directory, "missionFiles/42/Data");
  await copyFile(fixture, path.join(data, "nested/elevation.TIF"));
  await writeFile(path.join(data, "broken.tiff"), "invalid");
  await writeFile(path.join(data, "grid.json"), "{}");
  const dems = await listMissionDems(42);
  expect(dems).toHaveLength(2);
  expect(dems[0]).toMatchObject({ filePath: "Data/broken.tiff", resolution: null });
  expect(dems[0].error).toBeTruthy();
  expect(dems[1]).toEqual({ filePath: "Data/nested/elevation.TIF", resolution: 1, error: null });
  expect(await readMissionDem(42, dems[1].filePath)).toEqual(dems[1]);
});

test.each([
  "../secret.tif",
  "Data/../../secret.tif",
  "Data\\elevation.tif",
  "Layers/a.tif",
  "Data/grid.json",
  "Data//a.tif",
])("rejects a DEM outside the allowed path: %s", async (filePath) => {
  await expect(resolveMissionDemPath(42, filePath)).rejects.toThrow("mission Data folder");
});

test("returns an empty list for a mission without uploaded data", async () => {
  expect(await listMissionDems(43)).toEqual([]);
});

test.each([
  [{}, null],
  [{ GTModelTypeGeoKey: 2 }, "geographic degrees"],
  [{ ProjLinearUnitsGeoKey: 9002 }, "linear units must be metres"],
  [{ VerticalUnitsGeoKey: 9002 }, "elevation units must be metres"],
])("uses metre metadata and rejects unsupported units: %s", async (overrides, error) => {
  const buffer = writeArrayBuffer(new Float32Array([1, 2, 3, 4]), {
    width: 2,
    height: 2,
    BitsPerSample: [32],
    SampleFormat: [3],
    ModelPixelScale: [0.25, 0.5, 0],
    ModelTiepoint: [0, 0, 0, 0, 0, 0],
    ProjectedCSTypeGeoKey: 3857,
    // The GeoTIFF writer only handles a subset of named GeoKeys; encode SHORT keys directly.
    GeoKeyDirectory: [
      1,
      1,
      0,
      5,
      1024,
      0,
      1,
      "GTModelTypeGeoKey" in overrides ? overrides.GTModelTypeGeoKey : 1,
      2048,
      0,
      1,
      4326,
      3072,
      0,
      1,
      3857,
      3076,
      0,
      1,
      "ProjLinearUnitsGeoKey" in overrides ? overrides.ProjLinearUnitsGeoKey : 9001,
      4099,
      0,
      1,
      "VerticalUnitsGeoKey" in overrides ? overrides.VerticalUnitsGeoKey : 9001,
    ],
  });
  await writeFile(path.join(directory, "missionFiles/42/Data/test.tif"), new Uint8Array(buffer));
  if (error) await expect(readMissionDem(42, "Data/test.tif")).rejects.toThrow(error);
  else
    expect(await readMissionDem(42, "Data/test.tif")).toMatchObject({
      resolution: 0.25,
      error: null,
    });
});

test("rejects a linked directory that escapes this mission's Data folder", async () => {
  const outside = path.join(directory, "outside");
  await mkdir(outside);
  await writeFile(path.join(outside, "private.tif"), "private");
  await symlink(outside, path.join(directory, "missionFiles/42/Data/link"), "junction");
  await expect(resolveMissionDemPath(42, "Data/link/private.tif")).rejects.toThrow(
    "inside the mission Data folder"
  );
  expect(await listMissionDems(42)).toEqual([]);
});
