// @vitest-environment node
const newton = vi.hoisted(() => ({
  newtonProbeExtent: vi.fn(),
  newtonProbePoint: vi.fn(),
}));
vi.mock("server/newton/v1/http-newton", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...newton,
}));

import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  demProbeRegion,
  getNewtonCoverage,
  NEWTON_COVERAGE_TIMEOUT_MS,
} from "server/newton/coverage";

const FIXTURES = path.resolve(__dirname, "../../fixtures/raster");
const SLOPE: Newton.MapInfo = {
  name: "ms3_slope",
  planet: "moon",
  type: "slope",
  crs: "",
  extent: [0, 0, 1, 1],
  resolution: [1, 1],
};
const ELEVATION: Newton.MapInfo = { ...SLOPE, name: "ms3_elevation", type: "elevation" };
const maps = (...list: Newton.MapInfo[]) => ({ kind: "ok", status: 200, data: { maps: list } });

let staticDir: string | undefined;
let tempDir: string;
beforeAll(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "newton-coverage-"));
  await cp(
    path.join(FIXTURES, "mission50-golden-tiled.tif"),
    path.join(tempDir, "missionFiles/50/Data/dem.tif"),
    { recursive: true }
  );
});
afterAll(() => rm(tempDir, { recursive: true, force: true }));
beforeEach(() => {
  vi.clearAllMocks();
  staticDir = process.env.STATIC_DIR;
  process.env.STATIC_DIR = tempDir;
});
afterEach(() => {
  process.env.STATIC_DIR = staticDir;
});

const mission = (overrides: Partial<Mission> = {}): Mission =>
  ({
    id: 50,
    planetRadius: 1_737_400,
    landerLocation: { lat: -84.223397, lng: 33.5021945 },
    demFilePath: "Data/dem.tif",
    ...overrides,
  }) as Mission;

describe("demProbeRegion", () => {
  it("reads a polar stereographic DEM's extent and proj4 CRS", async () => {
    const region = await demProbeRegion(path.join(FIXTURES, "mission50-golden-tiled.tif"));
    expect(region).toMatchObject({ kind: "extent" });
    if (region?.kind !== "extent") return;
    expect(region.extent.map(Math.round)).toEqual([97070, 139308, 97102, 139340]);
    expect(region.crs).toMatch(/^\+proj=stere \+lat_0=-90 /);
  });

  it("is null for a missing file", async () => {
    expect(await demProbeRegion(path.join(FIXTURES, "missing.tif"))).toBeNull();
  });
});

describe("getNewtonCoverage", () => {
  it("probes the DEM extent for slope maps", async () => {
    newton.newtonProbeExtent.mockResolvedValue(maps(SLOPE));
    const result = await getNewtonCoverage(50, mission(), "moon");
    expect(result).toEqual({
      kind: "ok",
      coverage: {
        supported: true,
        reason: "covered",
        planet: "moon",
        probedBy: "dem_extent",
        maps: [{ name: "ms3_slope", resolution: [1, 1] }],
      },
    });
    const [query] = newton.newtonProbeExtent.mock.calls[0];
    expect(query).toMatchObject({ planet: "moon", type: "slope" });
    expect(query.crs).toMatch(/^\+proj=stere/);
    expect(newton.newtonProbePoint).not.toHaveBeenCalled();
  });

  it("gives up on a slow Newton sooner than a traverse request would", async () => {
    newton.newtonProbeExtent.mockResolvedValue(maps(SLOPE));
    await getNewtonCoverage(50, mission(), "moon");
    const [, options] = newton.newtonProbeExtent.mock.calls[0];
    expect(options.timeoutMs).toBe(NEWTON_COVERAGE_TIMEOUT_MS);
  });

  it("is unavailable when Newton doesn't answer", async () => {
    newton.newtonProbeExtent.mockResolvedValue({
      kind: "transient",
      status: null,
      reason: "timeout",
      message: "no response within 5000 ms",
    });
    const result = await getNewtonCoverage(50, mission(), "moon");
    expect(result).toEqual({ kind: "unavailable", message: "no response within 5000 ms" });
    expect(newton.newtonProbePoint).not.toHaveBeenCalled();
  });

  it("counts a listed slope map as coverage whatever slope_fraction says", async () => {
    newton.newtonProbeExtent.mockResolvedValue({
      kind: "ok",
      status: 200,
      data: { maps: [{ ...SLOPE, fraction: 0 }], slope_fraction: 0 },
    });
    const result = await getNewtonCoverage(50, mission(), "moon");
    expect(result).toMatchObject({ coverage: { supported: true, reason: "covered" } });
    expect(result.kind === "ok" && result.coverage).not.toHaveProperty("slopeFraction");
  });

  it("ignores maps that aren't slope maps", async () => {
    newton.newtonProbeExtent.mockResolvedValue(maps(ELEVATION));
    const result = await getNewtonCoverage(50, mission(), "moon");
    expect(result).toMatchObject({
      kind: "ok",
      coverage: { supported: false, reason: "no_slope_map", maps: [] },
    });
  });

  it("probes the lander without a DEM", async () => {
    newton.newtonProbePoint.mockResolvedValue(maps());
    const result = await getNewtonCoverage(50, mission({ demFilePath: "" }), "moon");
    expect(newton.newtonProbePoint).toHaveBeenCalledWith(
      { planet: "moon", lon: 33.5021945, lat: -84.223397, type: "slope" },
      expect.objectContaining({ timeoutMs: NEWTON_COVERAGE_TIMEOUT_MS })
    );
    expect(result).toMatchObject({
      coverage: {
        supported: false,
        reason: "no_slope_map",
        probedBy: "lander",
      },
    });
  });

  it("falls back to the lander when Newton rejects the DEM's CRS", async () => {
    newton.newtonProbeExtent.mockResolvedValue({
      kind: "rejected",
      status: 400,
      error: { code: "invalid_request", message: "crs", details: [] },
    });
    newton.newtonProbePoint.mockResolvedValue(maps(SLOPE));
    const result = await getNewtonCoverage(50, mission(), "moon");
    expect(result).toMatchObject({ coverage: { supported: true, probedBy: "lander" } });
  });

  it("is no_area with neither a DEM nor a lander", async () => {
    const result = await getNewtonCoverage(
      50,
      mission({ demFilePath: "", landerLocation: { lat: null, lng: null } }),
      "moon"
    );
    expect(result).toMatchObject({ coverage: { supported: false, reason: "no_area" } });
    expect(newton.newtonProbePoint).not.toHaveBeenCalled();
  });

  it("is unavailable when Newton can't be reached", async () => {
    newton.newtonProbeExtent.mockResolvedValue({
      kind: "transient",
      status: null,
      reason: "network",
      message: "down",
    });
    expect(await getNewtonCoverage(50, mission(), "moon")).toEqual({
      kind: "unavailable",
      message: "down",
    });
  });
});
