import {
  isPathPlanResultCurrent,
  newtonCoverageMessage,
  newtonCoverageTooltip,
  pathLengthMeters,
  pathPlanPointName,
  pathPlanErrorFromResponse,
  pathPlanErrorFromResult,
} from "utils/pathPlanner";
import { newtonInputSignature } from "utils/newtonInputs";

const start = { lat: 1, lng: 2 };
const goal = { lat: 1, lng: 2.01 };
const mid = { lat: 1.005, lng: 2.005 };

const failedRow = (
  error: NewtonTraverseError,
  status: NewtonTraverseStatus = "failed",
  waypoints: AEGISPoint[] = [start, goal]
) => ({ status, error, waypoints });

describe("pathPlanErrorFromResult", () => {
  test("succeeded rows have no error", () => {
    expect(pathPlanErrorFromResult({ status: "succeeded", error: null, waypoints: [] })).toBeNull();
  });

  test.each([
    ["no_slope_map", "Outside Newton coverage", false],
    ["no_path", "No route between start and goal", false],
  ])("%s", (code, message, retryable) => {
    expect(pathPlanErrorFromResult(failedRow({ code, message: "x", details: [] }))).toEqual({
      message,
      retryable,
      blockedWaypoints: [],
    });
  });

  test("names each blocked point", () => {
    const error = pathPlanErrorFromResult(
      failedRow({
        code: "waypoint_not_traversable",
        message: "x",
        details: [{ waypoint: 0 }, { waypoint: 1 }],
      })
    );
    expect(error.message).toBe("Start and Goal are on steep or blocked terrain");
    expect(error.blockedWaypoints).toEqual([0, 1]);
  });

  test("names blocked midpoints by their position in the request", () => {
    const error = pathPlanErrorFromResult(
      failedRow(
        {
          code: "waypoint_not_traversable",
          message: "x",
          details: [{ waypoint: 0 }, { waypoint: 2 }, { waypoint: 3 }],
        },
        "failed",
        [start, mid, mid, goal]
      )
    );
    expect(error.message).toBe("Start, Midpoint 2 and Goal are on steep or blocked terrain");
    expect(error.blockedWaypoints).toEqual([0, 2, 3]);
  });

  test("names the leg with no route when there are midpoints", () => {
    const noPath = (details: Record<string, unknown>[]) =>
      pathPlanErrorFromResult(
        failedRow({ code: "no_path", message: "x", details }, "failed", [start, mid, goal])
      ).message;
    expect(noPath([{ from_waypoint: 1, to_waypoint: 2 }])).toBe(
      "No route between Midpoint 1 and Goal"
    );
    expect(noPath([])).toBe("No route between the points");
  });

  test("a cancelled job can be retried", () => {
    expect(pathPlanErrorFromResult(failedRow(null, "cancelled"))).toMatchObject({
      message: "Newton cancelled the request",
      retryable: true,
    });
  });

  test("unknown codes include Newton's message", () => {
    expect(
      pathPlanErrorFromResult(failedRow({ code: "internal", message: "boom", details: [] })).message
    ).toBe("Newton failed: boom");
  });
});

describe("pathPlanErrorFromResponse", () => {
  test.each([
    [401, "You don't have access to this mission", false],
    [400, "bad slope", false],
    [503, "Newton unavailable, try again", true],
    [undefined, "Newton unavailable, try again", true],
  ])("HTTP %s", (httpStatus, message, retryable) => {
    expect(
      pathPlanErrorFromResponse({ status: "failure", message: "bad slope", httpStatus })
    ).toMatchObject({ message, retryable });
  });
});

describe("point names and lengths", () => {
  test("names the start, midpoints and goal", () => {
    expect([0, 1, 2, 3].map((index) => pathPlanPointName(index, 4))).toEqual([
      "Start",
      "Midpoint 1",
      "Midpoint 2",
      "Goal",
    ]);
    expect(pathPlanPointName(1, 2)).toBe("Goal");
  });

  test("sums the legs through every point", () => {
    const direct = pathLengthMeters([start, goal], 1737400);
    expect(pathLengthMeters([start, mid, goal], 1737400)).toBeGreaterThan(direct);
    expect(pathLengthMeters([start], 1737400)).toBe(0);
  });
});

describe("isPathPlanResultCurrent", () => {
  const signature = newtonInputSignature("moon", [start, goal], {});
  const plan = (resultSignature: string | null, params: NewtonTraverseParams = {}) => {
    const request: PathPlanRequest = {
      status: "ready",
      inputSignature: signature,
      traverseId: "t1",
      error: null,
      result: resultSignature ? ({ inputSignature: resultSignature } as PathPlanResult) : null,
      pathResult: null,
    };
    return { points: [start, goal], params, request };
  };

  test("matches the result's signature to the plan's inputs", () => {
    expect(isPathPlanResultCurrent(plan(signature), 1737400)).toBe(true);
    expect(isPathPlanResultCurrent(plan(signature, { slopeLimit: 10 }), 1737400)).toBe(false);
    expect(isPathPlanResultCurrent(plan(null), 1737400)).toBe(false);
    expect(isPathPlanResultCurrent(plan(signature), 3389500)).toBe(false);
    expect(
      isPathPlanResultCurrent({ ...plan(signature), points: [start, mid, goal] }, 1737400)
    ).toBe(false);
  });
});

describe("newtonCoverageMessage", () => {
  const ready = (reason: NewtonCoverageReason): PathPlannerCoverage => ({
    key: "k",
    status: "ready",
    coverage: {
      supported: reason === "covered",
      reason,
      planet: "moon",
      probedBy: null,
      maps: [],
    },
  });

  test.each([
    [null, "checking Newton coverage…"],
    [
      { key: "k", status: "checking", coverage: null } as PathPlannerCoverage,
      "checking Newton coverage…",
    ],
    [
      { key: "k", status: "error", coverage: null } as PathPlannerCoverage,
      "Newton is not available",
    ],
    [ready("no_slope_map"), "Newton has no slope map for this mission's area"],
    [ready("unsupported_planet"), "Newton doesn't support this mission's planet"],
    [ready("no_area"), "this mission has no DEM or lander location to check"],
    [ready("disabled"), "Newton is not configured"],
  ])("%#", (coverage, message) => {
    expect(newtonCoverageMessage(coverage)).toBe(message);
  });
});

describe("newtonCoverageTooltip", () => {
  const covered: PathPlannerCoverage = {
    key: "k",
    status: "ready",
    coverage: {
      supported: true,
      reason: "covered",
      planet: "moon",
      probedBy: "dem_extent",
      maps: [],
    },
  };

  test("names the tool alone when Newton covers the area", () => {
    expect(newtonCoverageTooltip(covered)).toBe("Newton Path Planner (experimental)");
  });

  test("names why the tool is unavailable", () => {
    expect(newtonCoverageTooltip(null)).toBe(
      "Newton Path Planner (experimental): checking Newton coverage…"
    );
  });
});
