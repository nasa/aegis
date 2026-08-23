const mocks = vi.hoisted(() => ({
  getAutomergeMissionHandle: vi.fn(),
  hasPerms: vi.fn(),
  readTerrainProfileInWorker: vi.fn(),
  resolveMissionDemPath: vi.fn(),
}));

vi.mock("server/express/routes/missionAutomerge", () => ({
  getAutomergeMissionHandle: mocks.getAutomergeMissionHandle,
}));
vi.mock("utils/permissions", () => ({ hasPerms: mocks.hasPerms }));
vi.mock("server/terrain/readTerrainProfile", () => ({
  readTerrainProfileInWorker: mocks.readTerrainProfileInWorker,
}));
vi.mock("server/elevation/resolveMissionDem", () => ({
  resolveMissionDemPath: mocks.resolveMissionDemPath,
}));
vi.mock("server/raster/rasterSamplingWorkerPool", () => ({
  RasterSamplingWorkerPoolUnavailableError: class extends Error {},
  RasterSamplingWorkerPoolSupersededError: class extends Error {},
}));

import express from "express";
import supertest from "supertest";

import terrainProfileRouter from "server/express/routes/terrainProfile";
import { MAX_RASTER_PROFILE_SAMPLES } from "server/raster/constants";

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
      doc: () => ({ demFilePath: "Data/trusted.tif", demResolution: 5 }),
    });
    mocks.resolveMissionDemPath.mockResolvedValue("/static/missionFiles/42/Data/trusted.tif");
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
    expect(mocks.resolveMissionDemPath).toHaveBeenCalledWith(
      expect.any(String),
      42,
      "Data/trusted.tif"
    );
    expect(mocks.readTerrainProfileInWorker).toHaveBeenCalledWith(
      {
        absolutePath: "/static/missionFiles/42/Data/trusted.tif",
        expectedResolutionMeters: 5,
      },
      validBody.path,
      [5],
      "42:traverse_abc-123"
    );
  });

  it("retains both coincident endpoints for a zero-length segment", async () => {
    await supertest(app)
      .post("/api/v1/terrain-profile?missionId=42")
      .send({ ...validBody, pathSegmentDistances: [0] });

    expect(mocks.readTerrainProfileInWorker).toHaveBeenCalledWith(
      expect.any(Object),
      validBody.path,
      [2],
      "42:traverse_abc-123"
    );
  });

  it("allows requests without a coalescing entity key", async () => {
    const { entityKey: _, ...body } = validBody;
    await supertest(app).post("/api/v1/terrain-profile?missionId=42").send(body);

    expect(mocks.readTerrainProfileInWorker).toHaveBeenCalledWith(
      expect.any(Object),
      body.path,
      [5],
      undefined
    );
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
  ])("rejects %s before queueing", async (_name, url, body) => {
    const response = await supertest(app).post(url).send(body);
    expect(response.status).toBe(400);
    expect(mocks.readTerrainProfileInWorker).not.toHaveBeenCalled();
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
  });
});
