import {
  getGridBaseSpacingMeters,
  getGridRenderMode,
  resolveMissionGrid,
} from "utils/mapping/grid";
import { getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";

const makeGrid = (points: { lat: number; lng: number }[][]): MissionGrid => ({
  gridDefinition: {
    numRows: points.length,
    numCols: points[0]?.length ?? 0,
    name: "test",
    fileName: "test.json",
  },
  coordinates: points.map((row, r) =>
    row.map((coord, c) => ({ id: r * 100 + c, index: { row: r, col: c }, coordinates: coord }))
  ),
});

describe("getGridBaseSpacingMeters", () => {
  const radius = 1737400; // moon

  test("returns the geodesic distance between two adjacent columns", () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0, lng: 0.01 };
    const grid = makeGrid([[a, b]]);
    const expected = getDistanceBetweenTwoCoordinates(a, b, radius);
    expect(getGridBaseSpacingMeters(grid, radius)).toBeCloseTo(expected, 5);
  });

  test("returns 0 when there are fewer than two columns", () => {
    const grid = makeGrid([[{ lat: 0, lng: 0 }]]);
    expect(getGridBaseSpacingMeters(grid, radius)).toBe(0);
  });

  test("returns 0 when planetRadius is missing", () => {
    const grid = makeGrid([
      [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.01 },
      ],
    ]);
    expect(getGridBaseSpacingMeters(grid, 0)).toBe(0);
  });

  test("returns 0 for a null/empty grid", () => {
    expect(getGridBaseSpacingMeters(null as unknown as MissionGrid, radius)).toBe(0);
  });
});

describe("resolveMissionGrid", () => {
  const serverGrid = makeGrid([
    [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.01 },
    ],
  ]);
  const serverFileGrid = serverGrid.gridDefinition;

  test("defaults existing missions without a mode to server-file", () => {
    expect(getGridRenderMode({})).toBe("server-file");
    expect(resolveMissionGrid({ serverFileGrid }, serverGrid)).toEqual({
      kind: "server-file",
      grid: serverGrid,
    });
  });

  test("resolves dynamic mode without exposing an uploaded matrix", () => {
    expect(
      resolveMissionGrid({ serverFileGrid, gridRenderMode: "dynamic-lgrs" }, serverGrid)
    ).toEqual({ kind: "dynamic-lgrs" });
  });

  test("resolves an absent server-file grid to none", () => {
    expect(
      resolveMissionGrid({ serverFileGrid: null, gridRenderMode: "server-file" }, serverGrid)
    ).toEqual({ kind: "none" });
  });
});
