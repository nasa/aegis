const mocks = vi.hoisted(() => ({
  getAutomergeMissionHandle: vi.fn(),
  hasPerms: vi.fn(),
  readAbsoluteSlopeProfileInWorker: vi.fn(),
  resolveMissionAbsoluteSlopePath: vi.fn(),
}));

vi.mock("server/express/routes/missionAutomerge", () => ({
  getAutomergeMissionHandle: mocks.getAutomergeMissionHandle,
}));
vi.mock("utils/permissions", () => ({ hasPerms: mocks.hasPerms }));
vi.mock("server/slope/readAbsoluteSlopeProfile", () => ({
  readAbsoluteSlopeProfileInWorker: mocks.readAbsoluteSlopeProfileInWorker,
}));
vi.mock("server/raster/rasterSamplingWorkerPool", () => ({
  RasterSamplingWorkerPoolUnavailableError: class extends Error {},
}));
vi.mock("server/elevation/resolveMissionDem", () => ({
  resolveMissionAbsoluteSlopePath: mocks.resolveMissionAbsoluteSlopePath,
}));

import express from "express";
import supertest from "supertest";

import absoluteSlopeRouter from "server/express/routes/absoluteSlope";

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.session = {
    appUser: {
      username: "slope-test",
      isAdmin: false,
      isSuperAdmin: false,
      permissionList: [],
    },
  } as unknown as typeof req.session;
  next();
});
app.use("/api/v1/absolute-slope", absoluteSlopeRouter);

describe("absolute slope route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasPerms.mockReturnValue(true);
    mocks.getAutomergeMissionHandle.mockResolvedValue({
      doc: () => ({
        absoluteSlopeFilePath: "Data/slope_degrees_uint16_cog.tif",
        demResolution: 5,
      }),
    });
    mocks.resolveMissionAbsoluteSlopePath.mockResolvedValue("/trusted/slope.tif");
    mocks.readAbsoluteSlopeProfileInWorker.mockResolvedValue({
      absoluteSlopes: [[1.25, null, 3.5, 4.75]],
      samplesRead: 4,
      blocksRead: 1,
      workerId: 1,
      queueDurationMs: 1,
      executionDurationMs: 2,
    });
  });

  it("uses mission configuration and returns an aligned decoded profile", async () => {
    const response = await supertest(app)
      .post("/api/v1/absolute-slope?missionId=50")
      .send({
        path: [
          { lat: -85, lng: 10 },
          { lat: -85.1, lng: 10.1 },
        ],
        pathSegmentDistances: [20],
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([[1.25, null, 3.5, 4.75]]);
    expect(mocks.resolveMissionAbsoluteSlopePath).toHaveBeenCalledWith(
      expect.any(String),
      50,
      "Data/slope_degrees_uint16_cog.tif"
    );
    expect(mocks.readAbsoluteSlopeProfileInWorker).toHaveBeenCalledWith(
      { absolutePath: "/trusted/slope.tif" },
      expect.any(Array),
      [4]
    );
  });

  it("rejects requests when no slope raster is configured", async () => {
    mocks.getAutomergeMissionHandle.mockResolvedValue({
      doc: () => ({ absoluteSlopeFilePath: "", demResolution: 5 }),
    });
    mocks.resolveMissionAbsoluteSlopePath.mockRejectedValue(
      new Error("Mission does not have absolute slope raster configured")
    );

    const response = await supertest(app)
      .post("/api/v1/absolute-slope?missionId=50")
      .send({
        path: [
          { lat: -85, lng: 10 },
          { lat: -85.1, lng: 10.1 },
        ],
        pathSegmentDistances: [20],
      });

    expect(response.status).toBe(400);
    expect(mocks.readAbsoluteSlopeProfileInWorker).not.toHaveBeenCalled();
  });
});
