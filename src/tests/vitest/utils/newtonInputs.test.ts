import {
  canonicalNewtonRequest,
  newtonInputSignature,
  planetFromRadius,
  roundNewtonCoord,
} from "utils/newtonInputs";

const A: AEGISPoint = { lat: -84.223397, lng: 33.5021945 };
const B: AEGISPoint = { lat: -84.22158866054008, lng: 33.529543847174324 };

describe("roundNewtonCoord", () => {
  it("rounds to 1e-7 degrees", () => {
    expect(roundNewtonCoord(33.529543847174324)).toBe(33.5295438);
    expect(roundNewtonCoord(-84.22158866054008)).toBe(-84.2215887);
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

describe("newtonInputSignature", () => {
  it("is equal for waypoints that differ by less than the rounding", () => {
    const nudged = { lat: A.lat + 2e-9, lng: A.lng - 3e-9 };
    expect(newtonInputSignature("moon", [nudged, B])).toBe(newtonInputSignature("moon", [A, B]));
  });

  it("ignores parameter order and treats null as omitted", () => {
    expect(newtonInputSignature("moon", [A, B], { slopeLimit: 10, slopeBufferM: 2 })).toBe(
      newtonInputSignature("moon", [A, B], { slopeBufferM: 2, slopeLimit: 10 })
    );
    expect(newtonInputSignature("moon", [A, B], { slopeLimit: null })).toBe(
      newtonInputSignature("moon", [A, B])
    );
  });

  it("differs by planet, order, intermediate points and parameters", () => {
    const signatures = new Set([
      newtonInputSignature("moon", [A, B]),
      newtonInputSignature("earth", [A, B]),
      newtonInputSignature("moon", [B, A]),
      newtonInputSignature("moon", [A, { lat: -84.222, lng: 33.51 }, B]),
      newtonInputSignature("moon", [A, B], { slopeLimit: 10 }),
    ]);
    expect(signatures.size).toBe(5);
  });

  it("matches the server's canonical request for the same problem", () => {
    expect(newtonInputSignature("moon", [A, B], { slopeLimit: 10 })).toBe(
      canonicalNewtonRequest({
        planet: "moon",
        method: "astar",
        waypoints: [
          [33.5021945, -84.223397],
          [33.5295438, -84.2215887],
        ],
        slope_limit: 10,
      })
    );
  });
});
