import { generateBlankMission } from "store/storeUtils/mission";
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
    expect(getGridRenderMode(generateBlankMission())).toBe("server-file");
    expect(resolveMissionGrid(generateBlankMission({ serverFileGrid }), serverGrid)).toEqual({
      kind: "server-file",
      grid: serverGrid,
    });
  });

  test("automatically selects dynamic LGRS without requiring a saved mode or projection", () => {
    expect(
      resolveMissionGrid(
        generateBlankMission({
          serverFileGrid,
          landerLocation: { lat: -85, lng: 0 },
          projIsCustom: false,
          projProj4String: "",
        }),
        serverGrid
      )
    ).toEqual({ kind: "dynamic-lgrs" });
  });

  test("resolves an absent server-file grid to none", () => {
    expect(resolveMissionGrid(generateBlankMission({ serverFileGrid: null }), serverGrid)).toEqual({
      kind: "none",
    });
  });

  test.each([
    { planet: "earth" as Planet, lat: -85 },
    { planet: "mars" as Planet, lat: -85 },
    { planet: "moon" as Planet, lat: -80 },
  ])("falls back to the uploaded grid outside the supported LGRS cap: %s", ({ planet, lat }) => {
    const mission = generateBlankMission({
      planet,
      landerLocation: { lat, lng: 0 },
      serverFileGrid,
      projIsCustom: true,
      projProj4String:
        "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs",
    });
    expect(resolveMissionGrid(mission, serverGrid)).toEqual({
      kind: "server-file",
      grid: serverGrid,
    });
  });
});
