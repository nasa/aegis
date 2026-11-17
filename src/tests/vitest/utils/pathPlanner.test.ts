import {
  isPathPlanRowCurrent,
  pathLengthMeters,
  pathPlanPointName,
  pathPlanErrorFromResponse,
  pathPlanErrorFromRow,
} from "utils/pathPlanner";
import { newtonInputSignature } from "utils/newtonInputs";

const start = { lat: 1, lng: 2 };
const goal = { lat: 1, lng: 2.01 };
const mid = { lat: 1.005, lng: 2.005 };

const failedRow = (
  error: NewtonTraverseError,
  status: NewtonTraverseStatus = "failed",
  waypoints: AEGISPoint[] = [start, goal]
) => ({ status, error, waypoints }) as NewtonTraverseRow;

describe("pathPlanErrorFromRow", () => {
  test("succeeded rows have no error", () => {
    expect(pathPlanErrorFromRow({ status: "succeeded" } as NewtonTraverseRow)).toBeNull();
  });

  test.each([
    ["no_slope_map", "Outside Newton coverage", false],
    ["no_path", "No route between start and goal", false],
    ["timeout", "Newton took too long", true],
  ])("%s", (code, message, retryable) => {
    expect(pathPlanErrorFromRow(failedRow({ code, message: "x", details: [] }))).toEqual({
      message,
      retryable,
      blockedWaypoints: [],
    });
  });

  test("names each blocked point", () => {
    const error = pathPlanErrorFromRow(
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
    const error = pathPlanErrorFromRow(
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
      pathPlanErrorFromRow(
        failedRow({ code: "no_path", message: "x", details }, "failed", [start, mid, goal])
      ).message;
    expect(noPath([{ from_waypoint: 1, to_waypoint: 2 }])).toBe(
      "No route between Midpoint 1 and Goal"
    );
    expect(noPath([])).toBe("No route between the points");
  });

  test("unknown codes include Newton's message", () => {
    expect(
      pathPlanErrorFromRow(failedRow({ code: "internal", message: "boom", details: [] })).message
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

describe("isPathPlanRowCurrent", () => {
  const signature = newtonInputSignature("moon", [start, goal], {});
  const plan = (rowSignature: string | null, params: NewtonTraverseParams = {}) => {
    const request: PathPlanRequest = {
      status: "ready",
      inputSignature: signature,
      error: null,
      row: rowSignature ? ({ inputSignature: rowSignature } as NewtonTraverseRow) : null,
      pathRow: null,
    };
    return { points: [start, goal], params, request };
  };

  test("matches the row's signature to the plan's inputs", () => {
    expect(isPathPlanRowCurrent(plan(signature), 1737400)).toBe(true);
    expect(isPathPlanRowCurrent(plan(signature, { slopeLimit: 10 }), 1737400)).toBe(false);
    expect(isPathPlanRowCurrent(plan(null), 1737400)).toBe(false);
    expect(isPathPlanRowCurrent(plan(signature), 3389500)).toBe(false);
    expect(isPathPlanRowCurrent({ ...plan(signature), points: [start, mid, goal] }, 1737400)).toBe(
      false
    );
  });
});
