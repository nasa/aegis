// @vitest-environment node
const mocks = vi.hoisted(() => ({
  emssTokenIsValid: vi.fn(),
  apiRoute: vi.fn(),
  requestNewtonTraverse: vi.fn(),
  readNewtonTraverse: vi.fn(),
  newtonQueueCounts: vi.fn(),
  isNewtonEnabled: vi.fn(),
  newtonHealth: vi.fn(),
}));

vi.mock("utils/permissions", () => ({ emssTokenIsValid: mocks.emssTokenIsValid }));
vi.mock("utils/logging/serverLogger", () => ({ serverLogger: { apiRoute: mocks.apiRoute } }));
vi.mock("server/newton/traverseCache", () => ({
  requestNewtonTraverse: mocks.requestNewtonTraverse,
  readNewtonTraverse: mocks.readNewtonTraverse,
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

beforeEach(() => {
  vi.clearAllMocks();
  appUser = {
    username: "newton-test",
    permissionList: [{ missionId: 7, permissions: { view: true, edit: false } }],
  };
  mocks.emssTokenIsValid.mockReturnValue(false);
  mocks.isNewtonEnabled.mockReturnValue(true);
  mocks.requestNewtonTraverse.mockResolvedValue(row);
});

describe("POST /traverses", () => {
  it("builds the request from the planet and the allow-listed params", async () => {
    const response = await supertest(app)
      .post("/api/v1/newton/traverses")
      .send({ planet: "moon", waypoints, params: { slopeLimit: 20 } });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "success", data: row });
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
      { username: "newton-test" }
    );
  });

  it("passes earth through", async () => {
    await supertest(app).post("/api/v1/newton/traverses").send({ planet: "earth", waypoints });
    expect(mocks.requestNewtonTraverse.mock.calls[0][0].planet).toBe("earth");
  });

  it.each([
    [{ waypoints }],
    [{ planet: "mars", waypoints }],
    [{ planet: "moon" }],
    [{ planet: "moon", waypoints: waypoints.slice(0, 1) }],
    [{ planet: "moon", waypoints, params: { method: "dijkstra" } }],
    [{ planet: "moon", waypoints, params: { slopeLimit: "20" } }],
    [
      {
        planet: "moon",
        waypoints: Array.from({ length: NEWTON_MAX_WAYPOINTS + 1 }, () => waypoints[0]),
      },
    ],
  ])("rejects %j with 400", async (body) => {
    const response = await supertest(app).post("/api/v1/newton/traverses").send(body);
    expect(response.status).toBe(400);
    expect(mocks.requestNewtonTraverse).not.toHaveBeenCalled();
  });

  it("is 401 without a session that can view a mission, and passes with EMSS_TOKEN", async () => {
    appUser = { username: "nobody", permissionList: [] };
    const denied = await supertest(app)
      .post("/api/v1/newton/traverses")
      .send({ planet: "moon", waypoints });
    expect(denied.status).toBe(401);
    expect(mocks.requestNewtonTraverse).not.toHaveBeenCalled();

    appUser = undefined;
    mocks.emssTokenIsValid.mockReturnValue(true);
    const allowed = await supertest(app)
      .post("/api/v1/newton/traverses")
      .set("emss-token", "secret")
      .send({ planet: "moon", waypoints });
    expect(allowed.status).toBe(200);
    expect(mocks.requestNewtonTraverse).toHaveBeenCalledWith(expect.any(Object), {
      username: undefined,
    });
  });

  it("allows a super admin with no mission permissions", async () => {
    appUser = { username: "root", isSuperAdmin: true, permissionList: [] };
    const response = await supertest(app)
      .post("/api/v1/newton/traverses")
      .send({ planet: "moon", waypoints });
    expect(response.status).toBe(200);
  });

  it("is 503 when Newton isn't configured", async () => {
    mocks.isNewtonEnabled.mockReturnValue(false);
    const response = await supertest(app)
      .post("/api/v1/newton/traverses")
      .send({ planet: "moon", waypoints });
    expect(response.status).toBe(503);
  });

  it("is 500 when the cache throws", async () => {
    mocks.requestNewtonTraverse.mockRejectedValue(new Error("db down"));
    const response = await supertest(app)
      .post("/api/v1/newton/traverses")
      .send({ planet: "moon", waypoints });
    expect(response.status).toBe(500);
    expect(response.body.message).not.toContain("db down");
    expect(mocks.apiRoute).toHaveBeenCalledWith(expect.objectContaining({ logLevel: "error" }));
  });
});

describe("POST /traverses/batch", () => {
  it("answers each request on its own, in order", async () => {
    mocks.requestNewtonTraverse
      .mockResolvedValueOnce(row)
      .mockRejectedValueOnce(new Error("db down"));
    const response = await supertest(app)
      .post("/api/v1/newton/traverses/batch")
      .send({
        planet: "moon",
        requests: [{ waypoints }, { waypoints: [] }, { waypoints: [...waypoints].reverse() }],
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { status: "success", data: row },
      { status: "error", message: expect.stringMatching(/waypoint/i) },
      { status: "error", message: "Newton traverse request failed" },
    ]);
    expect(mocks.requestNewtonTraverse).toHaveBeenCalledTimes(2);
  });

  it("is 400 for a missing or unsupported planet", async () => {
    for (const planet of [undefined, "mars"]) {
      const response = await supertest(app)
        .post("/api/v1/newton/traverses/batch")
        .send({ planet, requests: [{ waypoints }] });
      expect(response.status).toBe(400);
    }
    expect(mocks.requestNewtonTraverse).not.toHaveBeenCalled();
  });

  it.each([[[]], [Array.from({ length: NEWTON_MAX_BATCH + 1 }, () => ({ waypoints }))], ["x"]])(
    "rejects requests %#",
    async (requests) => {
      const response = await supertest(app)
        .post("/api/v1/newton/traverses/batch")
        .send({ planet: "moon", requests });
      expect(response.status).toBe(400);
    }
  );
});

describe("GET /traverses/:uuid", () => {
  it("returns the row and passes ?raw=1 through", async () => {
    mocks.readNewtonTraverse.mockResolvedValue(row);
    const response = await supertest(app).get(`/api/v1/newton/traverses/${ROW_UUID}?raw=1`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(row);
    expect(mocks.readNewtonTraverse).toHaveBeenCalledWith(ROW_UUID, { raw: true });
  });

  it("is 404 for an unknown row and 400 for a malformed uuid", async () => {
    mocks.readNewtonTraverse.mockResolvedValue(null);
    expect((await supertest(app).get(`/api/v1/newton/traverses/${ROW_UUID}`)).status).toBe(404);
    expect((await supertest(app).get("/api/v1/newton/traverses/not-a-uuid")).status).toBe(400);
  });

  it("is 401 for a user who can view no mission, unless they hold the EMSS token", async () => {
    appUser = { username: "nobody", permissionList: [] };
    mocks.readNewtonTraverse.mockResolvedValue(row);
    expect((await supertest(app).get(`/api/v1/newton/traverses/${ROW_UUID}`)).status).toBe(401);

    appUser = undefined;
    mocks.emssTokenIsValid.mockReturnValue(true);
    const response = await supertest(app)
      .get(`/api/v1/newton/traverses/${ROW_UUID}`)
      .set("emss-token", "secret");
    expect(response.status).toBe(200);
  });
});

describe("GET /health", () => {
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
