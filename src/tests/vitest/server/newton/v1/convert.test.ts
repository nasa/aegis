import {
  aegisPointsToLineString,
  aegisPointToLonLat,
  buildTraverseProblem,
  isComparableHash,
  lineStringToAegisPoints,
  planetFromRadius,
  roundNewtonCoord,
} from "server/newton/v1/convert";

const A: AEGISPoint = { lat: -84.223397, lng: 33.5021945 };
const B: AEGISPoint = { lat: -84.22158866054008, lng: 33.529543847174324 };

describe("rounding and points", () => {
  it("rounds to 1e-7 degrees", () => {
    expect(roundNewtonCoord(33.529543847174324)).toBe(33.5295438);
    expect(roundNewtonCoord(-84.22158866054008)).toBe(-84.2215887);
  });

  it("converts AEGIS points to rounded [lon, lat]", () => {
    expect(aegisPointToLonLat(B)).toEqual([33.5295438, -84.2215887]);
  });

  it.each([null, undefined, { lat: null, lng: 1 }, { lat: 1, lng: Number.NaN }])(
    "returns null for unlocated %j",
    (point) => {
      expect(aegisPointToLonLat(point as AEGISPoint | null)).toBeNull();
    }
  );
});

describe("GeoJSON", () => {
  it("round-trips a LineString", () => {
    const line = aegisPointsToLineString([A, B]);
    expect(line).toEqual({
      type: "LineString",
      coordinates: [
        [33.5021945, -84.223397],
        [33.5295438, -84.2215887],
      ],
    });
    expect(lineStringToAegisPoints(line)).toEqual([
      { lat: -84.223397, lng: 33.5021945 },
      { lat: -84.2215887, lng: 33.5295438 },
    ]);
  });

  it("returns [] for missing or malformed input", () => {
    expect(lineStringToAegisPoints(null)).toEqual([]);
    expect(
      lineStringToAegisPoints({ type: "Point", coordinates: [] } as unknown as Newton.LineString)
    ).toEqual([]);
    expect(lineStringToAegisPoints({ type: "LineString", coordinates: [[1]] })).toEqual([]);
    expect(lineStringToAegisPoints({ type: "LineString", coordinates: [[1, Number.NaN]] })).toEqual(
      []
    );
  });

  it("ignores altitude in coordinates", () => {
    expect(lineStringToAegisPoints({ type: "LineString", coordinates: [[1, 2, 3]] })).toEqual([
      { lat: 2, lng: 1 },
    ]);
  });
});

describe("planetFromRadius", () => {
  it.each([
    [1737400, "moon"],
    [1737100, "moon"],
    [null, "moon"],
    [6371000, "earth"],
    [6378137, "earth"],
    [3389500, null],
    [0, null],
    [Number.NaN, null],
  ])("%s → %s", (radius, planet) => {
    expect(planetFromRadius(radius)).toBe(planet);
  });
});

describe("isComparableHash", () => {
  it("accepts v1 hashes only", () => {
    expect(isComparableHash(`v1:${"a".repeat(64)}`)).toBe(true);
    expect(isComparableHash(null)).toBe(false);
    expect(isComparableHash(undefined)).toBe(false);
    expect(isComparableHash("a".repeat(64))).toBe(false);
    expect(isComparableHash(`v2:${"a".repeat(64)}`)).toBe(false);
    expect(isComparableHash("v1:short")).toBe(false);
  });
});

describe("buildTraverseProblem", () => {
  it("builds a minimal A* problem with rounded waypoints", () => {
    expect(buildTraverseProblem({ planet: "moon", waypoints: [A, B] })).toEqual({
      kind: "ok",
      problem: {
        planet: "moon",
        method: "astar",
        waypoints: [
          [33.5021945, -84.223397],
          [33.5295438, -84.2215887],
        ],
      },
    });
  });

  it("keeps intermediate waypoints in order", () => {
    const mid: AEGISPoint = { lat: -84.222, lng: 33.51 };
    const result = buildTraverseProblem({ planet: "moon", waypoints: [A, mid, B] });
    expect(result.kind === "ok" && result.problem.waypoints).toEqual([
      [33.5021945, -84.223397],
      [33.51, -84.222],
      [33.5295438, -84.2215887],
    ]);
  });

  it("adds slope parameters only when set", () => {
    const result = buildTraverseProblem({
      planet: "moon",
      waypoints: [A, B],
      slopeLimit: 10,
      slopeBufferM: 0,
      slopeBufferMUnused: 5,
    } as NewtonTraverseRequest);
    expect(result.kind === "ok" && result.problem).toEqual({
      planet: "moon",
      method: "astar",
      waypoints: [
        [33.5021945, -84.223397],
        [33.5295438, -84.2215887],
      ],
      slope_limit: 10,
      slope_buffer_m: 0,
    });
  });

  it("never emits fields outside the allow-list", () => {
    const sneaky = {
      planet: "moon",
      waypoints: [A, B],
      slopeLimit: null,
      obstacle_maps: ["x"],
      slope_buffer_px: 2,
      obstacle_buffer_px: 2,
      vehicle: { max_turn_angle: 30 },
    } as unknown as NewtonTraverseRequest;
    const result = buildTraverseProblem(sneaky);
    expect(result.kind === "ok" && Object.keys(result.problem).sort()).toEqual([
      "method",
      "planet",
      "waypoints",
    ]);
  });

  it.each([
    [{ planet: "mars", waypoints: [A, B] }, /planet/],
    [{ planet: "moon", waypoints: [A] }, /at least 2/],
    [{ planet: "moon", waypoints: [A, { lat: null, lng: 1 }] }, /waypoint 1 has no location/],
    [{ planet: "moon", waypoints: [A, { lat: 95, lng: 1 }] }, /latitude/],
    [{ planet: "moon", waypoints: [A, B], slopeLimit: 0 }, /slopeLimit/],
    [{ planet: "moon", waypoints: [A, B], slopeLimit: 91 }, /slopeLimit/],
    [{ planet: "moon", waypoints: [A, B], slopeBufferM: -1 }, /slopeBufferM/],
  ])("rejects %j", (request, message) => {
    const result = buildTraverseProblem(request as NewtonTraverseRequest);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.message).toMatch(message);
  });
});
