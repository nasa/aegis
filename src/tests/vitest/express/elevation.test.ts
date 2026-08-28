import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  getAutomergeMissionHandle: vi.fn(),
  hasPerms: vi.fn(),
  sampleRasterProfileInWorker: vi.fn(),
}));

vi.mock("server/express/routes/missionAutomerge", () => ({
  getAutomergeMissionHandle: mocks.getAutomergeMissionHandle,
}));
vi.mock("utils/permissions", () => ({ hasPerms: mocks.hasPerms }));
vi.mock("server/raster/rasterSamplingWorkerPool", () => ({
  RasterSamplingWorkerPoolUnavailableError: class extends Error {},
  sampleRasterProfileInWorker: mocks.sampleRasterProfileInWorker,
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
  let staticDirectory: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    staticDirectory = await mkdtemp(path.join(os.tmpdir(), "aegis-dem-"));
    vi.stubEnv("STATIC_DIR", staticDirectory);
    await mkdir(path.join(staticDirectory, "missionFiles", "42", "Data"), { recursive: true });
    await writeFile(path.join(staticDirectory, "missionFiles", "42", "Data", "trusted.tif"), "");
    mocks.hasPerms.mockReturnValue(true);
    mocks.getAutomergeMissionHandle.mockResolvedValue({
      doc: () => ({ demFilePath: "Data/trusted.tif", demResolution: 5 }),
    });
    mocks.sampleRasterProfileInWorker.mockResolvedValue({
      samples: [
        [
          { status: "value", value: 100 },
          { status: "value", value: 101 },
          { status: "value", value: 102 },
          { status: "value", value: 103 },
        ],
      ],
      samplesRead: 4,
      blocksRead: 1,
      workerId: 1,
      queueDurationMs: 1,
      executionDurationMs: 2,
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(staticDirectory, { recursive: true, force: true });
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
    expect(mocks.sampleRasterProfileInWorker).toHaveBeenCalledWith(
      { absolutePath: path.join(staticDirectory, "missionFiles", "42", "Data", "trusted.tif") },
      expect.any(Array),
      [4]
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
    expect(mocks.sampleRasterProfileInWorker).not.toHaveBeenCalled();
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

    expect(response.status).toBe(400);
    expect(mocks.sampleRasterProfileInWorker).not.toHaveBeenCalled();
  });

  it("maps missing raster samples to the legacy sentinel", async () => {
    mocks.sampleRasterProfileInWorker.mockResolvedValue({
      samples: [
        [
          { status: "value", value: 100 },
          { status: "missing", reason: "nodata" },
        ],
      ],
      samplesRead: 2,
      blocksRead: 1,
      workerId: 1,
      queueDurationMs: 1,
      executionDurationMs: 2,
    });

    const response = await supertest(app)
      .post("/api/v1/elevation?missionId=42")
      .send({
        path: [
          { lat: -85, lng: 10 },
          { lat: -85.1, lng: 10.1 },
        ],
        pathSegmentDistances: [5],
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([[100, -1100101]]);
  });

  it("rejects configured paths outside the mission Data directory", async () => {
    mocks.getAutomergeMissionHandle.mockResolvedValue({
      doc: () => ({ demFilePath: "other.tif", demResolution: 5 }),
    });
    await writeFile(path.join(staticDirectory, "missionFiles", "42", "other.tif"), "");

    const response = await supertest(app)
      .post("/api/v1/elevation?missionId=42")
      .send({
        path: [
          { lat: -85, lng: 10 },
          { lat: -85.1, lng: 10.1 },
        ],
        pathSegmentDistances: [5],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("Data directory");
  });

  it("rejects symlinks that escape the mission Data directory", async () => {
    const outside = path.join(staticDirectory, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "dem.tif"), "");
    await symlink(
      outside,
      path.join(staticDirectory, "missionFiles", "42", "Data", "linked"),
      "junction"
    );
    mocks.getAutomergeMissionHandle.mockResolvedValue({
      doc: () => ({ demFilePath: "Data/linked/dem.tif", demResolution: 5 }),
    });

    const response = await supertest(app)
      .post("/api/v1/elevation?missionId=42")
      .send({
        path: [
          { lat: -85, lng: 10 },
          { lat: -85.1, lng: 10.1 },
        ],
        pathSegmentDistances: [5],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("Data directory");
  });
});
