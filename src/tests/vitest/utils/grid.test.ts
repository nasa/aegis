import { getGrid } from "http-client/grid";
import {
  clearLoadedGrid,
  getGridBaseSpacingMeters,
  getServerFileGrid,
  loadAndReturnGrid,
} from "utils/mapping/grid";
import { getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";

vi.mock("http-client/grid", () => ({
  getGrid: vi.fn(),
}));

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

describe("getServerFileGrid", () => {
  const grid = makeGrid([
    [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.01 },
    ],
  ]);

  // Load through the real public path so these tests exercise the same module
  // state the app uses, rather than a test-only setter.
  const load = async (data: MissionGrid) => {
    vi.mocked(getGrid).mockResolvedValue({ status: "success", message: "", data });
    await loadAndReturnGrid(1);
  };

  afterEach(() => {
    clearLoadedGrid();
    vi.mocked(getGrid).mockReset();
  });

  test("returns the loaded grid in server-file mode", async () => {
    await load(grid);
    expect(getServerFileGrid("server-file")).toBe(grid);
  });

  test("returns null in dynamic-lgrs mode even when a grid is loaded", async () => {
    await load(grid);
    expect(getServerFileGrid("dynamic-lgrs")).toBeNull();
  });

  test("returns null in none mode even when a grid is loaded", async () => {
    await load(grid);
    expect(getServerFileGrid("none")).toBeNull();
  });

  test("returns null in server-file mode before the coordinate file loads", () => {
    expect(getServerFileGrid("server-file")).toBeNull();
  });

  test("returns null in server-file mode when the loaded grid has no coordinates", async () => {
    await load({ ...grid, coordinates: [] });
    expect(getServerFileGrid("server-file")).toBeNull();
  });
});
