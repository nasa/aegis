// @vitest-environment node
const mocks = vi.hoisted(() => ({
  emssTokenIsValid: vi.fn(),
  hasPerms: vi.fn(),
  getAutomergeMissionHandle: vi.fn(),
  apiRoute: vi.fn(),
  debug: vi.fn(),
  submitNewtonTraverse: vi.fn(),
  getNewtonTraverseResult: vi.fn(),
  cancelNewtonTraverse: vi.fn(),
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
vi.mock("server/newton/traverses", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  submitNewtonTraverse: mocks.submitNewtonTraverse,
  getNewtonTraverseResult: mocks.getNewtonTraverseResult,
  cancelNewtonTraverse: mocks.cancelNewtonTraverse,
  isNewtonEnabled: mocks.isNewtonEnabled,
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
const ID = "0b8a0c2e-6c51-4f7e-9a59-6d7f3f2d1c11";
const ID2 = "1c9b1d3f-7d62-4a8f-8b6a-7e8a4e3e2d22";
const submitted: NewtonTraverseSubmitResponse = {
  status: "success",
  message: "Newton traverse submitted",
  data: { traverseId: ID, inputSignature: "sig", requestHash: null, reuse: "new" },
};
const POST = "/api/v1/newton/traverses?missionId=7";
const getUrl = (ids: string, extra = "") =>
  `/api/v1/newton/traverses?missionId=7&ids=${ids}${extra}`;
const deleteUrl = (id: string) => `/api/v1/newton/traverses/${id}?missionId=7`;

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
  mocks.submitNewtonTraverse.mockResolvedValue(submitted);
});

describe("POST /traverses", () => {
  it("builds each request from the mission's planet and the allow-listed params", async () => {
    const response = await supertest(app)
      .post(POST)
      .send({ traverses: [{ waypoints, params: { slopeLimit: 20 } }] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "success",
      message: "Newton traverses",
      data: [submitted],
    });
    expect(mocks.hasPerms).toHaveBeenCalledWith(
      expect.objectContaining({ missionId: 7, permission: "view" })
    );
    expect(mocks.getAutomergeMissionHandle).toHaveBeenCalledWith(7);
    expect(mocks.submitNewtonTraverse).toHaveBeenCalledWith({
      planet: "moon",
      method: "astar",
      waypoints: [
        [33.5021945, -84.223397],
        [33.5295438, -84.2215887],
      ],
      slope_limit: 20,
    });
  });

  it("reads earth from planetRadius", async () => {
    planetRadius = 6_371_000;
    await supertest(app)
      .post(POST)
      .send({ traverses: [{ waypoints }] });
    expect(mocks.submitNewtonTraverse.mock.calls[0][0].planet).toBe("earth");
  });

  it("is 400 for a mission whose planet Newton doesn't support", async () => {
    planetRadius = 3_389_500;
    const response = await supertest(app)
      .post(POST)
      .send({ traverses: [{ waypoints }] });
    expect(response.status).toBe(400);
    expect(mocks.submitNewtonTraverse).not.toHaveBeenCalled();
  });

  it("answers each entry on its own, in order, with per-entry httpStatus", async () => {
    const unavailable = { status: "error", message: "Newton is unavailable", httpStatus: 503 };
    mocks.submitNewtonTraverse
      .mockResolvedValueOnce(submitted)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(unavailable);
    const response = await supertest(app)
      .post(POST)
      .send({
        traverses: [
          { waypoints },
          { waypoints: [] },
          { waypoints: [...waypoints].reverse() },
          { waypoints },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      submitted,
      { status: "error", message: expect.stringMatching(/waypoint/i), httpStatus: 400 },
      { status: "error", message: "Newton traverse request failed", httpStatus: 500 },
      unavailable,
    ]);
    expect(mocks.submitNewtonTraverse).toHaveBeenCalledTimes(3);
    expect(mocks.apiRoute).toHaveBeenCalledWith(expect.objectContaining({ logLevel: "error" }));
  });

  it.each([
    [{ waypoints: waypoints.slice(0, 1) }],
    [{ waypoints, params: { method: "dijkstra" } }],
    [{ waypoints, params: { slopeLimit: "20" } }],
    [{ waypoints, params: "x" }],
    [{ waypoints: Array.from({ length: NEWTON_MAX_WAYPOINTS + 1 }, () => waypoints[0]) }],
  ])("rejects entry %j with 400", async (entry) => {
    const response = await supertest(app)
      .post(POST)
      .send({ traverses: [entry] });
    expect(response.body.data).toEqual([expect.objectContaining({ httpStatus: 400 })]);
    expect(mocks.submitNewtonTraverse).not.toHaveBeenCalled();
  });

  it("logs one summary per batch with reuse counts", async () => {
    mocks.submitNewtonTraverse
      .mockResolvedValueOnce(submitted)
      .mockResolvedValueOnce({ ...submitted, data: { ...submitted.data, reuse: "cached" } });
    await supertest(app)
      .post(POST)
      .send({ traverses: [{ waypoints }, { waypoints }, { waypoints: [] }] });
    expect(mocks.debug).toHaveBeenCalledTimes(1);
    expect(mocks.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        logId: "newton:postTraverses:submittedNewtonTraverses",
        missionId: 7,
        logValue: expect.stringContaining("new=1 cached=1 error_400=1"),
      })
    );
  });

  it.each([[[]], [Array.from({ length: NEWTON_MAX_BATCH + 1 }, () => ({ waypoints }))], ["x"]])(
    "rejects traverses %#",
    async (traverses) => {
      const response = await supertest(app).post(POST).send({ traverses });
      expect(response.status).toBe(400);
    }
  );

  it.each(["", "?missionId=abc", "?missionId=0"])("is 400 for missionId %j", async (query) => {
    const response = await supertest(app)
      .post(`/api/v1/newton/traverses${query}`)
      .send({ traverses: [{ waypoints }] });
    expect(response.status).toBe(400);
    expect(mocks.hasPerms).not.toHaveBeenCalled();
  });

  it("is 401 without view on the mission, and passes the EMSS token to hasPerms", async () => {
    mocks.hasPerms.mockReturnValue(false);
    const denied = await supertest(app)
      .post(POST)
      .send({ traverses: [{ waypoints }] });
    expect(denied.status).toBe(401);
    expect(mocks.getAutomergeMissionHandle).not.toHaveBeenCalled();

    mocks.hasPerms.mockImplementation(({ emssToken }) => emssToken === "secret");
    appUser = undefined;
    const allowed = await supertest(app)
      .post(POST)
      .set("emss-token", "secret")
      .send({ traverses: [{ waypoints }] });
    expect(allowed.status).toBe(200);
  });

  it("is 404 when the mission doc is missing", async () => {
    mocks.getAutomergeMissionHandle.mockResolvedValue(null);
    const response = await supertest(app)
      .post(POST)
      .send({ traverses: [{ waypoints }] });
    expect(response.status).toBe(404);
  });

  it("is 503 when Newton isn't configured", async () => {
    mocks.isNewtonEnabled.mockReturnValue(false);
    const response = await supertest(app)
      .post(POST)
      .send({ traverses: [{ waypoints }] });
    expect(response.status).toBe(503);
  });
});

describe("GET /traverses", () => {
  it("returns each job in order, raw only when asked", async () => {
    mocks.getNewtonTraverseResult.mockImplementation(async (id: string, raw: boolean) => ({
      status: "success",
      message: "Newton traverse",
      data: { traverseId: id, raw },
    }));
    const response = await supertest(app).get(getUrl(`${ID},${ID2}`));
    expect(response.status).toBe(200);
    expect(response.body.data.map((entry: { data: unknown }) => entry.data)).toEqual([
      { traverseId: ID, raw: false },
      { traverseId: ID2, raw: false },
    ]);

    await supertest(app).get(getUrl(ID, "&raw=1"));
    expect(mocks.getNewtonTraverseResult).toHaveBeenLastCalledWith(ID, true);
  });

  it.each([
    "",
    "not-a-uuid",
    `${ID},../health`,
    Array(NEWTON_MAX_BATCH + 1)
      .fill(ID)
      .join(","),
  ])("is 400 for ids %#", async (ids) => {
    const response = await supertest(app).get(getUrl(ids));
    expect(response.status).toBe(400);
    expect(mocks.getNewtonTraverseResult).not.toHaveBeenCalled();
  });

  it("is 401 without view on the mission", async () => {
    mocks.hasPerms.mockReturnValue(false);
    expect((await supertest(app).get(getUrl(ID))).status).toBe(401);
    expect(mocks.getNewtonTraverseResult).not.toHaveBeenCalled();
  });
});

describe("DELETE /traverses/:traverseId", () => {
  it("cancels the job", async () => {
    const cancelled = {
      status: "success",
      message: "Cancel requested",
      data: { status: "cancelled" },
    };
    mocks.cancelNewtonTraverse.mockResolvedValue(cancelled);
    const response = await supertest(app).delete(deleteUrl(ID));
    expect(response.status).toBe(200);
    expect(response.body).toEqual(cancelled);
    expect(mocks.cancelNewtonTraverse).toHaveBeenCalledWith(ID);
  });

  it("answers Newton's failure status", async () => {
    mocks.cancelNewtonTraverse.mockResolvedValue({
      status: "error",
      message: "Newton is unavailable",
      httpStatus: 503,
    });
    expect((await supertest(app).delete(deleteUrl(ID))).status).toBe(503);
  });

  it("is 400 for an invalid id and 401 without view", async () => {
    expect((await supertest(app).delete(deleteUrl("nope"))).status).toBe(400);
    mocks.hasPerms.mockReturnValue(false);
    expect((await supertest(app).delete(deleteUrl(ID))).status).toBe(401);
    expect(mocks.cancelNewtonTraverse).not.toHaveBeenCalled();
  });
});

describe("GET /health", () => {
  beforeEach(() => {
    appUser = { username: "root", isSuperAdmin: true, permissionList: [] };
  });

  it("reports Newton's health", async () => {
    mocks.newtonHealth.mockResolvedValue({ kind: "ok", status: 200, data: { status: "ok" } });
    const response = await supertest(app).get("/api/v1/newton/health");
    expect(response.body.data).toEqual({
      enabled: true,
      newton: { status: "ok" },
      newtonError: null,
    });
  });

  it("is refused to a plain viewer, and allowed with the EMSS token", async () => {
    appUser = {
      username: "viewer",
      permissionList: [{ missionId: 7, permissions: { view: true, edit: false } }],
    };
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
    const response = await supertest(app).get("/api/v1/newton/health");
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ newton: null, newtonError: "fetch failed" });
  });

  it("doesn't call Newton when it isn't configured", async () => {
    mocks.isNewtonEnabled.mockReturnValue(false);
    const response = await supertest(app).get("/api/v1/newton/health");
    expect(response.body.data).toMatchObject({ enabled: false, newtonError: null });
    expect(mocks.newtonHealth).not.toHaveBeenCalled();
  });
});
