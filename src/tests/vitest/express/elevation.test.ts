const mocks = vi.hoisted(() => ({
  getAutomergeMissionHandle: vi.fn(),
  hasPerms: vi.fn(),
  readElevationProfileInWorker: vi.fn(),
  resolveMissionDemPath: vi.fn(),
  getRasterSamplingWorkerPoolSnapshot: vi.fn(),
}));

vi.mock("server/express/routes/missionAutomerge", () => ({
  getAutomergeMissionHandle: mocks.getAutomergeMissionHandle,
}));
vi.mock("utils/permissions", () => ({ hasPerms: mocks.hasPerms }));
vi.mock("server/elevation/readElevationProfile", () => ({
  readElevationProfileInWorker: mocks.readElevationProfileInWorker,
}));
vi.mock("server/raster/rasterSamplingWorkerPool", () => ({
  RasterSamplingWorkerPoolUnavailableError: class extends Error {
    constructor(
      message: string,
      readonly code = "RASTER_SAMPLING_BUSY",
      readonly retryAfterMs?: number
    ) {
      super(message);
    }
  },
  getRasterSamplingWorkerPoolSnapshot: mocks.getRasterSamplingWorkerPoolSnapshot,
}));
vi.mock("server/elevation/resolveMissionDem", () => ({
  resolveMissionDemPath: mocks.resolveMissionDemPath,
}));

import express from "express";
import supertest from "supertest";

import elevationRouter from "server/express/routes/elevation";

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.session = {
    appUser: {
      username: "elevation-test",
      isAdmin: false,
      isSuperAdmin: false,
      permissionList: [],
    },
  } as unknown as typeof req.session;
  next();
});
app.use("/api/v1/elevation", elevationRouter);

describe("native elevation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasPerms.mockReturnValue(true);
    mocks.getAutomergeMissionHandle.mockResolvedValue({
      doc: () => ({ demFilePath: "Data/trusted.tif", demResolution: 5 }),
    });
    mocks.resolveMissionDemPath.mockResolvedValue("/static/missionFiles/42/Data/trusted.tif");
    mocks.getRasterSamplingWorkerPoolSnapshot.mockReturnValue({
      queueDepth: 0,
      queuedWeight: 0,
      activeWorkers: 1,
    });
    mocks.readElevationProfileInWorker.mockResolvedValue({
      elevations: [[100, 101, 102, 103]],
      samplesRead: 4,
      blocksRead: 1,
      workerId: 1,
      queueDurationMs: 1,
      executionDurationMs: 2,
    });
  });

  it("uses the authorized mission metadata and ignores spoofed body raster settings", async () => {
    const response = await supertest(app)
      .post("/api/v1/elevation?missionId=42")
      .send({
        missionId: 999,
        demFilepath: "../../spoofed.tif",
        resolutionMeters: 1,
        radius: 1737400,
        path: [
          { lat: -85, lng: 10 },
          { lat: -85.1, lng: 10.1 },
        ],
        pathSegmentDistances: [20],
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "success",
      data: [[100, 101, 102, 103]],
      message: "Elevation profile sampled",
    });
    expect(mocks.getAutomergeMissionHandle).toHaveBeenCalledWith(42);
    expect(mocks.resolveMissionDemPath).toHaveBeenCalledWith(
      expect.any(String),
      42,
      "Data/trusted.tif"
    );
    expect(mocks.readElevationProfileInWorker).toHaveBeenCalledWith(
      { absolutePath: "/static/missionFiles/42/Data/trusted.tif" },
      expect.any(Array),
      [4],
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("rejects malformed path data before raster sampling", async () => {
    const response = await supertest(app)
      .post("/api/v1/elevation?missionId=42")
      .send({
        path: [{ lat: Number.NaN, lng: 10 }],
        pathSegmentDistances: [],
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("ELEVATION_INVALID_REQUEST");
    expect(mocks.readElevationProfileInWorker).not.toHaveBeenCalled();
  });

  it("preserves authorization failure behavior", async () => {
    mocks.hasPerms.mockReturnValue(false);

    const response = await supertest(app).post("/api/v1/elevation?missionId=42").send({});

    expect(response.status).toBe(401);
    expect(mocks.getAutomergeMissionHandle).not.toHaveBeenCalled();
  });

  it("rejects a partially numeric mission ID before authorization", async () => {
    const response = await supertest(app).post("/api/v1/elevation?missionId=42junk").send({});

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("ELEVATION_INVALID_REQUEST");
    expect(mocks.hasPerms).not.toHaveBeenCalled();
  });

  it("rejects an invalid configured DEM resolution", async () => {
    mocks.getAutomergeMissionHandle.mockResolvedValue({
      doc: () => ({ demFilePath: "Data/trusted.tif", demResolution: 0 }),
    });

    const response = await supertest(app)
      .post("/api/v1/elevation?missionId=42")
      .send({
        path: [
          { lat: -85, lng: 10 },
          { lat: -85.1, lng: 10.1 },
        ],
        pathSegmentDistances: [20],
      });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("ELEVATION_DEM_UNAVAILABLE");
    expect(mocks.readElevationProfileInWorker).not.toHaveBeenCalled();
  });

  it("rejects excessive sample cost before worker invocation", async () => {
    const response = await supertest(app)
      .post("/api/v1/elevation?missionId=42")
      .send({
        path: [
          { lat: -85, lng: 10 },
          { lat: -85.1, lng: 10.1 },
        ],
        pathSegmentDistances: [500_005],
      });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("ELEVATION_TOO_MANY_SAMPLES");
    expect(mocks.readElevationProfileInWorker).not.toHaveBeenCalled();
  });

  it("returns retry metadata for global saturation", async () => {
    const BusyError = (await import("server/raster/rasterSamplingWorkerPool"))
      .RasterSamplingWorkerPoolUnavailableError;
    mocks.readElevationProfileInWorker.mockRejectedValue(
      new BusyError("queue full", "RASTER_SAMPLING_BUSY", 250)
    );

    const response = await supertest(app)
      .post("/api/v1/elevation?missionId=42")
      .send({
        path: [
          { lat: -85, lng: 10 },
          { lat: -85.1, lng: 10.1 },
        ],
        pathSegmentDistances: [20],
      });

    expect(response.status).toBe(503);
    expect(response.headers["retry-after"]).toBe("1");
    expect(response.body).toMatchObject({ code: "ELEVATION_BUSY", retryAfterMs: 250 });
  });
});
