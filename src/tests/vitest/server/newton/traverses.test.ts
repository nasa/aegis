// @vitest-environment node
const newton = vi.hoisted(() => ({
  newtonCancelTraverse: vi.fn(),
  newtonPostTraverse: vi.fn(),
  newtonGetTraverse: vi.fn(),
}));
vi.mock("server/newton/v1/http-newton", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...newton,
}));

import { buildTraverseProblem } from "server/newton/v1/convert";
import {
  cancelNewtonTraverse,
  getNewtonTraverseResult,
  mapWithConcurrency,
  simplifyToleranceM,
  submitNewtonTraverse,
  toNewtonTraverseResult,
} from "server/newton/traverses";
import { newtonInputSignature } from "utils/newtonInputs";

const ID = "0b8a0c2e-6c51-4f7e-9a59-6d7f3f2d1c11";
const START: AEGISPoint = { lat: -84.223397, lng: 33.5021945 };
const GOAL: AEGISPoint = { lat: -84.2215887, lng: 33.5295438 };
const HASH = `v1:${"a".repeat(64)}`;

const SLOPE_MAP: Newton.MapInfo = {
  name: "ms3_slope",
  planet: "moon",
  type: "slope",
  crs: "",
  extent: [0, 0, 1, 1],
  resolution: [1, 1],
};

function problem(slopeLimit?: number) {
  const built = buildTraverseProblem({ planet: "moon", waypoints: [START, GOAL], slopeLimit });
  if (built.kind === "invalid") throw new Error(built.message);
  return built.problem;
}

/** A straight raw path with about one vertex per metre. */
function rawPath(n = 101): Newton.LineString {
  return {
    type: "LineString",
    coordinates: Array.from({ length: n }, (_, i) => [
      START.lng + ((GOAL.lng - START.lng) * i) / (n - 1),
      START.lat + ((GOAL.lat - START.lat) * i) / (n - 1),
    ]),
  };
}

/** Newton's `GET /traverses/:id`, with the stored problem echoed back as Newton does. */
const traverse = (
  status: Newton.WorkStatus,
  extra: Partial<Newton.Traverse> = {}
): Newton.Traverse => ({
  traverse_problem: {
    planet: "moon",
    waypoints: problem().waypoints,
    slope_limit: 20,
    slope_buffer: null,
    slope_buffer_m: null,
    method: "astar",
    vehicle: null,
  },
  method: "astar",
  status,
  cancel_requested: false,
  runtime: status === "succeeded" ? 5000 : null,
  path: status === "succeeded" ? rawPath() : null,
  map_info: status === "succeeded" ? [SLOPE_MAP] : [],
  request_hash: HASH,
  effective_problem: { slope_limit: 20 },
  ...extra,
});

const transient = {
  kind: "transient",
  status: 502,
  reason: "non_json",
  message: "<html>Bad Gateway</html>",
} as const;

afterEach(() => vi.resetAllMocks());

describe("submitNewtonTraverse", () => {
  test("returns Newton's id, reuse and the signature of the request sent", async () => {
    newton.newtonPostTraverse.mockResolvedValue({
      kind: "ok",
      status: 202,
      data: { traverseId: ID, requestHash: HASH, reuse: "cached" },
    });
    const sent = problem(15);
    await expect(submitNewtonTraverse(sent)).resolves.toEqual({
      status: "success",
      message: "Newton traverse submitted",
      data: {
        traverseId: ID,
        requestHash: HASH,
        reuse: "cached",
        inputSignature: newtonInputSignature("moon", [START, GOAL], { slopeLimit: 15 }),
      },
    });
    expect(newton.newtonPostTraverse).toHaveBeenCalledWith(sent);
  });

  test("keeps Newton's status and error for a rejected request", async () => {
    const error: Newton.Error = { code: "no_slope_map", message: "No slope map", details: [] };
    newton.newtonPostTraverse.mockResolvedValue({ kind: "rejected", status: 400, error });
    await expect(submitNewtonTraverse(problem())).resolves.toEqual({
      status: "error",
      message: "No slope map",
      httpStatus: 400,
      error,
    });
  });

  test("answers 503 when Newton is unreachable, including proxy pages", async () => {
    newton.newtonPostTraverse.mockResolvedValue(transient);
    await expect(submitNewtonTraverse(problem())).resolves.toMatchObject({
      status: "error",
      message: "Newton is unavailable",
      httpStatus: 503,
    });
    newton.newtonPostTraverse.mockResolvedValue({ ...transient, reason: "disabled" });
    await expect(submitNewtonTraverse(problem())).resolves.toMatchObject({
      message: "Newton is not configured",
      httpStatus: 503,
    });
  });
});

describe("toNewtonTraverseResult", () => {
  test("simplifies a successful path and snaps it to the waypoints", () => {
    const result = toNewtonTraverseResult(ID, traverse("succeeded"), true);
    expect(result).toMatchObject({
      traverseId: ID,
      status: "succeeded",
      cancelRequested: false,
      params: { slopeLimit: 20 },
      requestHash: HASH,
      rawVertexCount: 101,
      mapInfo: [{ name: "ms3_slope", type: "slope", resolution: [1, 1] }],
      runtimeMs: 5000,
      error: null,
    });
    expect(result.waypoints).toHaveLength(2);
    expect(result.path).toHaveLength(2);
    expect(result.path[0]).toEqual(result.waypoints[0]);
    expect(result.path[1]).toEqual(result.waypoints[1]);
    expect(result.segmentDistances).toHaveLength(1);
    expect(result.rawPath).toHaveLength(101);
  });

  test("returns no raw path unless asked", () => {
    expect(toNewtonTraverseResult(ID, traverse("succeeded"))).not.toHaveProperty("rawPath");
  });

  test("passes through an unfinished or failed job", () => {
    expect(toNewtonTraverseResult(ID, traverse("pending"))).toMatchObject({
      status: "pending",
      path: null,
      segmentDistances: null,
      rawVertexCount: null,
      runtimeMs: null,
    });
    const error: Newton.Error = { code: "no_path", message: "No path", details: [] };
    expect(toNewtonTraverseResult(ID, traverse("failed", { error }))).toMatchObject({
      status: "failed",
      error,
    });
    expect(
      toNewtonTraverseResult(ID, traverse("in_progress", { cancel_requested: true }))
    ).toMatchObject({ status: "in_progress", cancelRequested: true });
  });

  test("fails a success that carries no usable path", () => {
    expect(toNewtonTraverseResult(ID, traverse("succeeded", { path: rawPath(1) }))).toMatchObject({
      status: "failed",
      path: null,
      error: { code: "invalid_path" },
    });
  });
});

describe("getNewtonTraverseResult", () => {
  test("converts Newton's job", async () => {
    newton.newtonGetTraverse.mockResolvedValue({
      kind: "ok",
      status: 200,
      data: traverse("in_progress"),
    });
    await expect(getNewtonTraverseResult(ID)).resolves.toMatchObject({
      status: "success",
      data: { traverseId: ID, status: "in_progress" },
    });
    expect(newton.newtonGetTraverse).toHaveBeenCalledWith(ID);
  });

  test("answers 404 for a job Newton doesn't know", async () => {
    const error: Newton.Error = { code: "not_found", message: "Traverse not found", details: [] };
    newton.newtonGetTraverse.mockResolvedValue({ kind: "rejected", status: 404, error });
    await expect(getNewtonTraverseResult(ID)).resolves.toMatchObject({
      status: "error",
      httpStatus: 404,
      error,
    });
  });
});

describe("cancelNewtonTraverse", () => {
  test("returns Newton's status after a cancel", async () => {
    newton.newtonCancelTraverse.mockResolvedValue({
      kind: "ok",
      status: 202,
      data: { status: "cancelled", cancel_requested: true },
    });
    await expect(cancelNewtonTraverse(ID)).resolves.toMatchObject({
      status: "success",
      data: { status: "cancelled" },
    });
  });

  test.each([404, 409])("treats Newton's %i as nothing to cancel", async (status) => {
    newton.newtonCancelTraverse.mockResolvedValue({
      kind: "rejected",
      status,
      error: { code: "x", message: "x", details: [] },
    });
    await expect(cancelNewtonTraverse(ID)).resolves.toEqual({
      status: "success",
      message: "Nothing to cancel",
      data: { status: null },
    });
  });

  test("answers 503 when Newton is unreachable", async () => {
    newton.newtonCancelTraverse.mockResolvedValue(transient);
    await expect(cancelNewtonTraverse(ID)).resolves.toMatchObject({
      status: "error",
      httpStatus: 503,
    });
  });
});

describe("simplifyToleranceM", () => {
  test("is half the slope map's resolution, or 0.5 m without one", () => {
    expect(simplifyToleranceM([{ ...SLOPE_MAP, resolution: [5, 5] }])).toBe(2.5);
    expect(simplifyToleranceM([{ ...SLOPE_MAP, type: "dem" as Newton.MapType }])).toBe(0.5);
    expect(simplifyToleranceM(null)).toBe(0.5);
  });
});

describe("mapWithConcurrency", () => {
  test("keeps the order and never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const results = await mapWithConcurrency([5, 1, 4, 2, 3, 0], 2, async (ms, index) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      running -= 1;
      return index;
    });
    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
  });

  test("handles an empty list", async () => {
    await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toEqual([]);
  });
});
