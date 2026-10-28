vi.mock("server/terrain/terrainProfileCache", () => ({
  watchTerrainCache: vi.fn(),
  cachedTerrainProfile: vi.fn(),
}));
const mocks = vi.hoisted(() => ({
  getAutomergeMissionHandle: vi.fn(),
  hasPerms: vi.fn(),
  readTerrainProfileInWorker: vi.fn(),
  apiRoute: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("server/express/routes/missionAutomerge", () => ({
  getAutomergeMissionHandle: mocks.getAutomergeMissionHandle,
}));
vi.mock("utils/permissions", () => ({ hasPerms: mocks.hasPerms }));
vi.mock("server/terrain/readTerrainProfile", () => ({
  MAX_RASTER_PROFILE_SAMPLES: 100_000,
  readTerrainProfileInWorker: mocks.readTerrainProfileInWorker,
}));
vi.mock("utils/logging/serverLogger", () => ({
  serverLogger: { apiRoute: mocks.apiRoute, debug: mocks.debug },
}));
vi.mock("server/raster/rasterSamplingWorkerPool", () => {
  class RasterSamplingWorkerPoolUnavailableError extends Error {}
  class RasterSamplingWorkerPoolSupersededError extends RasterSamplingWorkerPoolUnavailableError {}
  return { RasterSamplingWorkerPoolUnavailableError, RasterSamplingWorkerPoolSupersededError };
});

import path from "node:path";
import express from "express";
import supertest from "supertest";

import terrainProfileRouter, {
  getMissionTerrainProfiles,
} from "server/express/routes/terrainProfile";
import { MAX_RASTER_PROFILE_SAMPLES } from "server/terrain/readTerrainProfile";
import { cachedTerrainProfile } from "server/terrain/terrainProfileCache";
import {
  RasterSamplingWorkerPoolSupersededError,
  RasterSamplingWorkerPoolUnavailableError,
} from "server/raster/rasterSamplingWorkerPool";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import type { DocHandle } from "@automerge/automerge-repo/slim";

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.session = {
    appUser: {
      username: "terrain-test",
      isAdmin: false,
      isSuperAdmin: false,
      permissionList: [],
    },
  } as unknown as typeof req.session;
  next();
});
app.use("/api/v1/terrain-profile", terrainProfileRouter);

const validBody = {
  path: [
    { lat: -85, lng: 10 },
    { lat: -85.1, lng: 10.1 },
  ],
  pathSegmentDistances: [20],
  entityKey: "traverse_abc-123",
};

describe("terrain profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasPerms.mockReturnValue(true);
    mocks.getAutomergeMissionHandle.mockResolvedValue({
      isDeleted: () => false,
      doc: () => ({ demFilePath: "Data/trusted.tif", demResolution: 5 }),
    });
    mocks.readTerrainProfileInWorker.mockResolvedValue({
      elevationsMeters: [[100, 101, 102, 103, 104]],
      terrainSlopesDegrees: [[1, 2, null, 4, 5]],
      centerSamples: 5,
      uniqueDemPixels: 21,
      blocksRead: 2,
      workerId: 1,
      queueDurationMs: 1,
      executionDurationMs: 2,
    });
  });

  it("uses trusted mission metadata and N=ceil(d/r)+1 samples", async () => {
    const response = await supertest(app)
      .post("/api/v1/terrain-profile?missionId=42")
      .send({ ...validBody, demFilePath: "../../spoofed.tif", resolutionMeters: 1 });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      elevationsMeters: [[100, 101, 102, 103, 104]],
      terrainSlopesDegrees: [[1, 2, null, 4, 5]],
    });
    expect(mocks.readTerrainProfileInWorker).toHaveBeenCalledWith(
      {
        absolutePath: path.resolve(
          process.env.STATIC_DIR ?? "",
          "missionFiles",
          "42",
          "Data/trusted.tif"
        ),
        expectedResolutionMeters: 5,
      },
      validBody.path,
      [5],
      "42:traverse_abc-123",
      false
    );
    expect(mocks.debug).not.toHaveBeenCalled();
  });

  it("retains both coincident endpoints for a zero-length segment", async () => {
    await supertest(app)
      .post("/api/v1/terrain-profile?missionId=42")
      .send({ ...validBody, pathSegmentDistances: [0] });

    expect(mocks.readTerrainProfileInWorker).toHaveBeenCalledWith(
      expect.any(Object),
      validBody.path,
      [2],
      "42:traverse_abc-123",
      false
    );
  });

  it("serves 40 profiles in one HTTP call with bounded sampling and one debug summary", async () => {
    const profiles = Array.from({ length: 40 }, (_, i) => ({
      ...validBody,
      entityKey: `traverse-${i}`,
      path: [
        { lat: i, lng: 0 },
        { lat: i, lng: 1 },
      ],
    }));
    mocks.getAutomergeMissionHandle.mockResolvedValue({
      isDeleted: () => false,
      doc: () => ({
        demFilePath: "dem.tif",
        demResolution: 5,
        traverses: Object.fromEntries(profiles.map(({ entityKey }) => [entityKey, {}])),
      }),
    });
    vi.mocked(cachedTerrainProfile).mockImplementation(({ compute, onCacheStatus }) => {
      onCacheStatus?.("miss");
      return compute();
    });
    let active = 0;
    let peak = 0;
    mocks.readTerrainProfileInWorker.mockImplementation(async (_descriptor, path) => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return { elevationsMeters: [[path[0].lat, path[0].lat + 1]], terrainSlopesDegrees: [[1, 2]] };
    });
    const response = await supertest(app)
      .post("/api/v1/terrain-profile/batch?missionId=42")
      .send({ profiles });
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(40);
    response.body.data.forEach((result: TerrainProfileResponse, index: number) => {
      expect(result.status).toBe("success");
      expect(result.data.elevationsMeters).toEqual([[index, index + 1]]);
    });
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
    expect(mocks.debug).toHaveBeenCalledTimes(1);
    expect(mocks.debug).toHaveBeenCalledWith({
      logId: "terrain-profile",
      missionId: 42,
      batchId: expect.any(String),
      logValue: expect.stringMatching(
        /^Batch 40 profiles > disk-cache hit=0 miss=40 bypass=0 errors=0 in [\d.]+ ms$/
      ),
    });
  });

  it("returns successful profiles alongside validation failures in a batch", async () => {
    const response = await supertest(app)
      .post("/api/v1/terrain-profile/batch?missionId=42")
      .send({
        profiles: [validBody, { ...validBody, path: [{ lat: 91, lng: 0 }, validBody.path[1]] }],
      });
    expect(response.status).toBe(200);
    expect(response.body.data[0].status).toBe("success");
    expect(response.body.data[1]).toMatchObject({ status: "error", httpStatus: 400 });
    expect(mocks.readTerrainProfileInWorker).toHaveBeenCalledTimes(1);
    expect(mocks.debug).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, { profiles: [] }, { profiles: "invalid" }])(
    "rejects an invalid batch body: %j",
    async (body) => {
      const response = await supertest(app)
        .post("/api/v1/terrain-profile/batch?missionId=42")
        .send(body);
      expect(response.status).toBe(400);
      expect(mocks.readTerrainProfileInWorker).not.toHaveBeenCalled();
    }
  );

  it("checks mission permission before sampling a batch", async () => {
    mocks.hasPerms.mockReturnValue(false);
    const response = await supertest(app)
      .post("/api/v1/terrain-profile/batch?missionId=42")
      .send({ profiles: [validBody] });
    expect(response.status).toBe(401);
    expect(mocks.readTerrainProfileInWorker).not.toHaveBeenCalled();
  });

  it("allows requests without a coalescing entity key", async () => {
    const { entityKey: _, ...body } = validBody;
    await supertest(app).post("/api/v1/terrain-profile?missionId=42").send(body);

    expect(mocks.readTerrainProfileInWorker).toHaveBeenCalledWith(
      expect.any(Object),
      body.path,
      [5],
      undefined,
      false
    );
  });

  it("requests center-only sampling for elevation-only profiles", async () => {
    await supertest(app)
      .post("/api/v1/terrain-profile?missionId=42")
      .send({ ...validBody, getElevationOnly: true });

    expect(mocks.readTerrainProfileInWorker).toHaveBeenCalledWith(
      expect.any(Object),
      validBody.path,
      [5],
      "42:traverse_abc-123",
      true
    );
  });

  it("rejects a mission without a configured DEM", async () => {
    mocks.getAutomergeMissionHandle.mockResolvedValue({
      isDeleted: () => false,
      doc: () => ({ demFilePath: "", demResolution: 5 }),
    });

    const response = await supertest(app)
      .post("/api/v1/terrain-profile?missionId=42")
      .send(validBody);

    expect(response.status).toBe(400);
    expect(mocks.readTerrainProfileInWorker).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid mission", "/api/v1/terrain-profile?missionId=42junk", validBody],
    [
      "invalid coordinates",
      "/api/v1/terrain-profile?missionId=42",
      { ...validBody, path: [{ lat: 91, lng: 0 }, validBody.path[1]] },
    ],
    [
      "invalid distances",
      "/api/v1/terrain-profile?missionId=42",
      { ...validBody, pathSegmentDistances: [-1] },
    ],
    [
      "invalid entity key",
      "/api/v1/terrain-profile?missionId=42",
      { ...validBody, entityKey: "unsafe:key" },
    ],
    [
      "oversized entity key",
      "/api/v1/terrain-profile?missionId=42",
      { ...validBody, entityKey: "a".repeat(65) },
    ],
    [
      "invalid elevation-only flag",
      "/api/v1/terrain-profile?missionId=42",
      { ...validBody, getElevationOnly: "true" },
    ],
  ])("rejects %s before queueing", async (_name, url, body) => {
    const response = await supertest(app).post(url).send(body);
    expect(response.status).toBe(400);
    expect(mocks.readTerrainProfileInWorker).not.toHaveBeenCalled();
  });

  it("logs invalid mission IDs", async () => {
    await supertest(app).post("/api/v1/terrain-profile?missionId=42junk").send(validBody);

    expect(mocks.apiRoute).toHaveBeenCalledWith({
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 400,
      routeName: "terrain-profile",
      appUsername: "terrain-test",
      message: "Invalid mission ID",
    });
  });

  it("rejects oversized work before queueing", async () => {
    const response = await supertest(app)
      .post("/api/v1/terrain-profile?missionId=42")
      .send({ ...validBody, pathSegmentDistances: [MAX_RASTER_PROFILE_SAMPLES * 5] });
    expect(response.status).toBe(400);
    expect(mocks.readTerrainProfileInWorker).not.toHaveBeenCalled();
  });

  it("preserves authorization behavior", async () => {
    mocks.hasPerms.mockReturnValue(false);
    const response = await supertest(app)
      .post("/api/v1/terrain-profile?missionId=42")
      .send(validBody);
    expect(response.status).toBe(401);
    expect(mocks.getAutomergeMissionHandle).not.toHaveBeenCalled();
    expect(mocks.apiRoute).toHaveBeenCalledWith({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "terrain-profile",
      appUsername: "terrain-test",
      missionId: 42,
      message: "Unauthorized",
    });
  });

  it("logs missing missions", async () => {
    mocks.getAutomergeMissionHandle.mockResolvedValue(undefined);

    const response = await supertest(app)
      .post("/api/v1/terrain-profile?missionId=42")
      .send(validBody);

    expect(response.status).toBe(404);
    expect(mocks.apiRoute).toHaveBeenCalledWith({
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 404,
      routeName: "terrain-profile",
      appUsername: "terrain-test",
      missionId: 42,
      message: "Mission 42 not found",
    });
  });
});

it("returns an owned entity's disk-cached profile without sampling the DEM", async () => {
  const { cachedTerrainProfile } = await import("server/terrain/terrainProfileCache");
  mocks.hasPerms.mockReturnValue(true);
  mocks.readTerrainProfileInWorker.mockClear();
  mocks.debug.mockClear();
  mocks.getAutomergeMissionHandle.mockResolvedValue({
    isDeleted: () => false,
    doc: () => ({
      demFilePath: "Data/trusted.tif",
      demResolution: 5,
      traverses: { [validBody.entityKey]: {} },
    }),
  });
  vi.mocked(cachedTerrainProfile).mockImplementation(async ({ onCacheStatus }) => {
    onCacheStatus?.("hit");
    return { elevationsMeters: [[10, 20]], terrainSlopesDegrees: [[1, 2]] };
  });
  const response = await supertest(app)
    .post("/api/v1/terrain-profile?missionId=42")
    .send(validBody);
  expect(response.status).toBe(200);
  expect(cachedTerrainProfile).toHaveBeenCalledWith(
    expect.objectContaining({ missionId: 42, entity: validBody.entityKey })
  );
  expect(mocks.readTerrainProfileInWorker).not.toHaveBeenCalled();
  expect(mocks.debug).not.toHaveBeenCalled();
});

it("samples drag previews without the disk cache under a separate coalescing key", async () => {
  const { cachedTerrainProfile } = await import("server/terrain/terrainProfileCache");
  mocks.hasPerms.mockReturnValue(true);
  vi.mocked(cachedTerrainProfile).mockClear();
  mocks.getAutomergeMissionHandle.mockResolvedValue({
    isDeleted: () => false,
    doc: () => ({
      demFilePath: "Data/trusted.tif",
      demResolution: 5,
      traverses: { [validBody.entityKey]: {} },
    }),
  });
  mocks.readTerrainProfileInWorker.mockResolvedValue({
    elevationsMeters: [[1, 2, 3, 4, 5]],
    terrainSlopesDegrees: [[1, 2, 3, 4, 5]],
  });
  const response = await supertest(app)
    .post("/api/v1/terrain-profile?missionId=42")
    .send({ ...validBody, preview: true });
  expect(response.status).toBe(200);
  expect(cachedTerrainProfile).not.toHaveBeenCalled();
  expect(mocks.readTerrainProfileInWorker).toHaveBeenCalledWith(
    expect.any(Object),
    validBody.path,
    [5],
    "42:traverse_abc-123:preview",
    false
  );
});

it("maps validation errors to 400 regardless of message case", async () => {
  const { cachedTerrainProfile } = await import("server/terrain/terrainProfileCache");
  mocks.hasPerms.mockReturnValue(true);
  mocks.getAutomergeMissionHandle.mockResolvedValue({
    isDeleted: () => false,
    doc: () => ({
      demFilePath: "Data/trusted.tif",
      demResolution: 5,
      traverses: { [validBody.entityKey]: {} },
    }),
  });
  vi.mocked(cachedTerrainProfile).mockRejectedValue(new Error("Invalid cache entity"));
  const response = await supertest(app)
    .post("/api/v1/terrain-profile?missionId=42")
    .send(validBody);
  expect(response.status).toBe(400);
});

describe("mission terrain profile batches", () => {
  const profile = { elevationsMeters: [[10, 20]], terrainSlopesDegrees: [[1, 2]] };
  let mission: Mission;
  let handle: DocHandle<Mission>;

  beforeEach(() => {
    vi.clearAllMocks();
    const traverse = generateBlankTraverse({
      uuid: "traverse",
      path: validBody.path,
      pathSegmentDistances: [20],
    });
    mission = generateBlankMission({
      id: 42,
      demFilePath: "Data/original.tif",
      demResolution: 5,
      traverses: { traverse },
    });
    handle = { doc: () => mission, isDeleted: () => false } as unknown as DocHandle<Mission>;
    vi.mocked(cachedTerrainProfile).mockImplementation(({ compute, onCacheStatus }) => {
      onCacheStatus?.("miss");
      return compute();
    });
    mocks.readTerrainProfileInWorker.mockReset().mockResolvedValue(profile);
  });

  it("loads 40 cold profiles with bounded concurrency and deduplicates entities", async () => {
    mission.traverses = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => {
        const uuid = `traverse${i}`;
        return [uuid, { ...mission.traverses.traverse, uuid }];
      })
    );
    let active = 0;
    let peak = 0;
    mocks.readTerrainProfileInWorker.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      try {
        if (active > 33) throw new RasterSamplingWorkerPoolUnavailableError("queue is full");
        await new Promise((resolve) => setTimeout(resolve, 0));
        return profile;
      } finally {
        active--;
      }
    });
    const uuids = Object.keys(mission.traverses);
    const profiles = await getMissionTerrainProfiles(42, handle, mission, [...uuids, uuids[0]]);
    expect(Object.keys(profiles)).toHaveLength(40);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
    expect(mocks.readTerrainProfileInWorker).toHaveBeenCalledTimes(40);
    expect(mocks.debug).toHaveBeenCalledTimes(1);
    expect(mocks.debug).toHaveBeenCalledWith({
      logId: "terrain-profile",
      missionId: 42,
      batchId: expect.any(String),
      logValue: expect.stringMatching(
        /^Batch 40 profiles > disk-cache hit=0 miss=40 bypass=0 errors=0 in [\d.]+ ms$/
      ),
    });
    for (const entry of Object.values(profiles)) {
      expect(entry.status).toBe("ready");
      expect(entry.profile).toEqual(profile);
    }
  });

  it("samples geometry and DEM metadata from the export snapshot", async () => {
    const snapshot = mission;
    mission = {
      ...mission,
      demFilePath: "Data/new.tif",
      demResolution: 10,
      traverses: {
        traverse: {
          ...mission.traverses.traverse,
          path: [
            { lat: 0, lng: 0 },
            { lat: 1, lng: 1 },
          ],
          pathSegmentDistances: [100],
        },
      },
    };
    const profiles = await getMissionTerrainProfiles(42, handle, snapshot, ["traverse"]);
    expect(profiles.traverse.path).toEqual(snapshot.traverses.traverse.path);
    expect(profiles.traverse.distances).toEqual([20]);
    expect(mocks.readTerrainProfileInWorker).toHaveBeenCalledWith(
      {
        absolutePath: path.resolve(
          process.env.STATIC_DIR ?? "",
          "missionFiles",
          "42",
          "Data/original.tif"
        ),
        expectedResolutionMeters: 5,
      },
      snapshot.traverses.traverse.path,
      [5],
      "42:traverse",
      false
    );
  });

  it("retries transient worker capacity failures", async () => {
    mocks.readTerrainProfileInWorker.mockRejectedValueOnce(
      new RasterSamplingWorkerPoolUnavailableError("Raster sampling worker queue is full")
    );
    const profiles = await getMissionTerrainProfiles(42, handle, mission, ["traverse"]);
    expect(mocks.readTerrainProfileInWorker).toHaveBeenCalledTimes(2);
    expect(profiles.traverse.status).toBe("ready");
    expect(profiles.traverse.profile).toEqual(profile);
  });

  it.each([
    [new RasterSamplingWorkerPoolUnavailableError("queue is full"), 3],
    [new RasterSamplingWorkerPoolSupersededError(), 1],
    [new Error("invalid raster"), 1],
  ])("bounds retries for %s", async (error, attempts) => {
    mocks.readTerrainProfileInWorker.mockRejectedValue(error);
    const profiles = await getMissionTerrainProfiles(42, handle, mission, ["traverse"]);
    expect(mocks.readTerrainProfileInWorker).toHaveBeenCalledTimes(attempts);
    expect(profiles.traverse.status).toBe("error");
    expect(profiles.traverse.profile).toBeNull();
  });
});
