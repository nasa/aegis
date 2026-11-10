// @vitest-environment node
const mocks = vi.hoisted(() => ({
  emssTokenIsValid: vi.fn(),
  hasPerms: vi.fn(),
  getAutomergeMissionHandle: vi.fn(),
  apiRoute: vi.fn(),
  debug: vi.fn(),
  requestNewtonTraverse: vi.fn(),
  newtonQueueCounts: vi.fn(),
  isNewtonEnabled: vi.fn(),
  newtonHealth: vi.fn(),
}));

vi.mock("utils/permissions", () => ({
  emssTokenIsValid: mocks.emssTokenIsValid,
  hasPerms: mocks.hasPerms,
}));
vi.mock("server/express/routes/missionAutomerge", () => ({
  getAutomergeMissionHandle: mocks.getAutomergeMissionHandle,
}));
vi.mock("utils/logging/serverLogger", () => ({
  serverLogger: { apiRoute: mocks.apiRoute, debug: mocks.debug },
}));
vi.mock("server/newton/traverseCache", () => ({
  requestNewtonTraverse: mocks.requestNewtonTraverse,
  newtonQueueCounts: mocks.newtonQueueCounts,
  isNewtonEnabled: mocks.isNewtonEnabled,
  newtonCacheSettings: () => ({ maxInFlight: 1 }),
}));
vi.mock("server/newton/v1/http-newton", () => ({ newtonHealth: mocks.newtonHealth }));

import express from "express";
import supertest from "supertest";

import newtonRouter, { NEWTON_MAX_BATCH, NEWTON_MAX_WAYPOINTS } from "server/express/routes/newton";

let appUser: Partial<AppUser> | undefined;
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.session = { appUser } as unknown as typeof req.session;
  next();
});
app.use("/api/v1/newton", newtonRouter);

const waypoints: AEGISPoint[] = [
  { lat: -84.2233970004, lng: 33.5021945 },
  { lat: -84.2215887, lng: 33.5295438 },
];
const ROW_UUID = "0b8a0c2e-6c51-4f7e-9a59-6d7f3f2d1c11";
const row = { uuid: ROW_UUID, status: "pending" } as NewtonTraverseRow;
const ONE = "/api/v1/newton/traverses?missionId=7";
const BATCH = "/api/v1/newton/traverses/batch?missionId=7";

let planetRadius: number | null;

beforeEach(() => {
  vi.clearAllMocks();
  appUser = { username: "newton-test", permissionList: [] };
  planetRadius = 1_737_400;
  mocks.emssTokenIsValid.mockReturnValue(false);
  mocks.hasPerms.mockReturnValue(true);
  mocks.isNewtonEnabled.mockReturnValue(true);
  mocks.getAutomergeMissionHandle.mockImplementation(async () => ({
    doc: () => ({ planetRadius }),
  }));
  mocks.requestNewtonTraverse.mockImplementation(async (_problem, _caller, options) => {
    options?.onCacheStatus?.("hit");
    return row;
  });
});

describe("POST /traverses", () => {
  it("builds the request from the mission's planet and the allow-listed params", async () => {
    const response = await supertest(app)
      .post(ONE)
      .send({ waypoints, params: { slopeLimit: 20 } });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "success", data: row });
    expect(mocks.hasPerms).toHaveBeenCalledWith(
      expect.objectContaining({ missionId: 7, permission: "view" })
    );
    expect(mocks.getAutomergeMissionHandle).toHaveBeenCalledWith(7);
    expect(mocks.requestNewtonTraverse).toHaveBeenCalledWith(
      {
        planet: "moon",
        method: "astar",
        waypoints: [
          [33.5021945, -84.223397],
          [33.5295438, -84.2215887],
        ],
        slope_limit: 20,
      },
      { username: "newton-test", missionId: 7 },
      { raw: false }
    );
  });

  it("reads earth from planetRadius and passes raw through", async () => {
    planetRadius = 6_371_000;
    await supertest(app).post(ONE).send({ waypoints, raw: true });
    const [problem, , options] = mocks.requestNewtonTraverse.mock.calls[0];
    expect(problem.planet).toBe("earth");
    expect(options).toEqual({ raw: true });
  });

  it("is 400 for a mission whose planet Newton doesn't support", async () => {
    planetRadius = 3_389_500;
    const response = await supertest(app).post(ONE).send({ waypoints });
    expect(response.status).toBe(400);
    expect(mocks.requestNewtonTraverse).not.toHaveBeenCalled();
  });

  it.each([
    [{}],
    [{ waypoints: waypoints.slice(0, 1) }],
    [{ waypoints, params: { method: "dijkstra" } }],
    [{ waypoints, params: { slopeLimit: "20" } }],
    [{ waypoints, raw: "1" }],
    [{ waypoints: Array.from({ length: NEWTON_MAX_WAYPOINTS + 1 }, () => waypoints[0]) }],
  ])("rejects %j with 400", async (body) => {
    const response = await supertest(app).post(ONE).send(body);
    expect(response.status).toBe(400);
    expect(mocks.requestNewtonTraverse).not.toHaveBeenCalled();
  });

  it.each(["", "?missionId=abc", "?missionId=0"])("is 400 for missionId %j", async (query) => {
    const response = await supertest(app)
      .post(`/api/v1/newton/traverses${query}`)
      .send({ waypoints });
    expect(response.status).toBe(400);
    expect(mocks.hasPerms).not.toHaveBeenCalled();
  });

  it("is 401 without view on the mission, and passes the EMSS token to hasPerms", async () => {
    mocks.hasPerms.mockReturnValue(false);
    const denied = await supertest(app).post(ONE).send({ waypoints });
    expect(denied.status).toBe(401);
    expect(mocks.getAutomergeMissionHandle).not.toHaveBeenCalled();

    mocks.hasPerms.mockImplementation(({ emssToken }) => emssToken === "secret");
    appUser = undefined;
    const allowed = await supertest(app).post(ONE).set("emss-token", "secret").send({ waypoints });
    expect(allowed.status).toBe(200);
    expect(mocks.requestNewtonTraverse).toHaveBeenCalledWith(
      expect.any(Object),
      { username: undefined, missionId: 7 },
      expect.any(Object)
    );
  });

  it("is 404 when the mission doc is missing", async () => {
    mocks.getAutomergeMissionHandle.mockResolvedValue(null);
    const response = await supertest(app).post(ONE).send({ waypoints });
    expect(response.status).toBe(404);
  });

  it("is 503 when Newton isn't configured", async () => {
    mocks.isNewtonEnabled.mockReturnValue(false);
    const response = await supertest(app).post(ONE).send({ waypoints });
    expect(response.status).toBe(503);
  });

  it("is 500 when the cache throws", async () => {
    mocks.requestNewtonTraverse.mockRejectedValue(new Error("db down"));
    const response = await supertest(app).post(ONE).send({ waypoints });
    expect(response.status).toBe(500);
    expect(response.body.message).not.toContain("db down");
    expect(mocks.apiRoute).toHaveBeenCalledWith(expect.objectContaining({ logLevel: "error" }));
  });
});

describe("POST /traverses/batch", () => {
  it("answers each request on its own, in order, with per-entry httpStatus", async () => {
    mocks.requestNewtonTraverse
      .mockImplementationOnce(async (_p, _c, options) => {
        options.onCacheStatus("submitted");
        return row;
      })
      .mockRejectedValueOnce(new Error("db down"));
    const response = await supertest(app)
      .post(BATCH)
      .send({
        traverses: [{ waypoints }, { waypoints: [] }, { waypoints: [...waypoints].reverse() }],
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { status: "success", message: "Newton traverse", data: row },
      { status: "error", message: expect.stringMatching(/waypoint/i), httpStatus: 400 },
      { status: "error", message: "Newton traverse request failed", httpStatus: 500 },
    ]);
    expect(mocks.requestNewtonTraverse).toHaveBeenCalledTimes(2);
  });

  it("sets raw only on its own entry", async () => {
    await supertest(app)
      .post(BATCH)
      .send({ traverses: [{ waypoints }, { waypoints, raw: true }] });
    expect(mocks.requestNewtonTraverse.mock.calls.map((call) => call[2].raw)).toEqual([
      false,
      true,
    ]);
  });

  it("logs one summary per batch with cache counts", async () => {
    mocks.requestNewtonTraverse
      .mockImplementationOnce(async (_p, _c, options) => {
        options.onCacheStatus("hit");
        return row;
      })
      .mockImplementationOnce(async (_p, _c, options) => {
        options.onCacheStatus("pending");
        return row;
      });
    await supertest(app)
      .post(BATCH)
      .send({ traverses: [{ waypoints }, { waypoints }, { waypoints: [] }] });
    expect(mocks.debug).toHaveBeenCalledTimes(1);
    expect(mocks.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        logId: "newton:requestNewtonTraverses:batchCompletedWithCacheStatistics",
        missionId: 7,
        logValue: expect.stringContaining("hit=1 pending=1 submitted=0 errors=1"),
      })
    );
  });

  it.each([[[]], [Array.from({ length: NEWTON_MAX_BATCH + 1 }, () => ({ waypoints }))], ["x"]])(
    "rejects traverses %#",
    async (traverses) => {
      const response = await supertest(app).post(BATCH).send({ traverses });
      expect(response.status).toBe(400);
    }
  );

  it("is 401 without view on the mission", async () => {
    mocks.hasPerms.mockReturnValue(false);
    const response = await supertest(app)
      .post(BATCH)
      .send({ traverses: [{ waypoints }] });
    expect(response.status).toBe(401);
  });
});

describe("GET /health", () => {
  beforeEach(() => {
    appUser = { username: "root", isSuperAdmin: true, permissionList: [] };
  });

  it("reports Newton's health and the queue counts", async () => {
    mocks.newtonHealth.mockResolvedValue({ kind: "ok", status: 200, data: { status: "ok" } });
    mocks.newtonQueueCounts.mockResolvedValue({ pending: 1, succeeded: 4 });
    const response = await supertest(app).get("/api/v1/newton/health");
    expect(response.body.data).toEqual({
      enabled: true,
      newton: { status: "ok" },
      newtonError: null,
      maxInFlight: 1,
      counts: { pending: 1, succeeded: 4 },
    });
  });

  it("is refused to a plain viewer, and allowed with the EMSS token", async () => {
    appUser = {
      username: "viewer",
      permissionList: [{ missionId: 7, permissions: { view: true, edit: false } }],
    };
    mocks.newtonQueueCounts.mockResolvedValue({});
    mocks.newtonHealth.mockResolvedValue({ kind: "ok", status: 200, data: { status: "ok" } });
    expect((await supertest(app).get("/api/v1/newton/health")).status).toBe(401);

    mocks.emssTokenIsValid.mockImplementation((token) => token === "secret");
    const response = await supertest(app).get("/api/v1/newton/health").set("emss-token", "secret");
    expect(response.status).toBe(200);
  });

  it("reports an unreachable Newton without failing", async () => {
    mocks.newtonHealth.mockResolvedValue({
      kind: "transient",
      status: null,
      reason: "network",
      message: "fetch failed",
    });
    mocks.newtonQueueCounts.mockResolvedValue({});
    const response = await supertest(app).get("/api/v1/newton/health");
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ newton: null, newtonError: "fetch failed" });
  });

  it("doesn't call Newton when it isn't configured", async () => {
    mocks.isNewtonEnabled.mockReturnValue(false);
    mocks.newtonQueueCounts.mockResolvedValue({});
    const response = await supertest(app).get("/api/v1/newton/health");
    expect(response.body.data).toMatchObject({ enabled: false, newtonError: null });
    expect(mocks.newtonHealth).not.toHaveBeenCalled();
  });
});
