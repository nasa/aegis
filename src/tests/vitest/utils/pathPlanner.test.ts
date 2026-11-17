import {
  isPathPlanRowCurrent,
  pathPlanErrorFromResponse,
  pathPlanErrorFromRow,
} from "utils/pathPlanner";
import { newtonInputSignature } from "utils/newtonInputs";

const start = { lat: 1, lng: 2 };
const goal = { lat: 1, lng: 2.01 };

const failedRow = (error: NewtonTraverseError, status: NewtonTraverseStatus = "failed") =>
  ({ status, error }) as NewtonTraverseRow;

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

describe("isPathPlanRowCurrent", () => {
  const signature = newtonInputSignature("moon", [start, goal], {});
  const plan = (rowSignature: string | null, params: NewtonTraverseParams = {}) => {
    const request: PathPlanRequest = {
      status: "ready",
      inputSignature: signature,
      error: null,
      row: rowSignature ? ({ inputSignature: rowSignature } as NewtonTraverseRow) : null,
    };
    return { start, goal, params, request };
  };

  test("matches the row's signature to the plan's inputs", () => {
    expect(isPathPlanRowCurrent(plan(signature), 1737400)).toBe(true);
    expect(isPathPlanRowCurrent(plan(signature, { slopeLimit: 10 }), 1737400)).toBe(false);
    expect(isPathPlanRowCurrent(plan(null), 1737400)).toBe(false);
    expect(isPathPlanRowCurrent(plan(signature), 3389500)).toBe(false);
  });
});
