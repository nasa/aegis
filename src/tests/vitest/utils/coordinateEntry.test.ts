import {
  formatCoordinateEntry,
  getCoordinateEntryHint,
  parseCoordinateEntry,
} from "utils/coordinateEntry";
import { findGlobalGridCoordsFromPoint, findGridCellCenterByName } from "utils/mapping/geoMath";
import { getSouthLpsDisplayCoordinate } from "utils/lgrs/southLps";

const RADIUS = 1737400;
const latLngOnly: CoordinateEntryContext = {
  usingLGRSCoordinates: false,
  dynamicLgrs: false,
  serverGrid: null,
  planetRadius: RADIUS,
  landerLocation: null,
};

// A 4 x 4 grid of points 0.01° apart; each point is named after its row/column.
const makeGrid = (): MissionGridPoint[][] =>
  Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (__, col) => ({
      id: row * 10 + col,
      index: { row, col },
      coordinates: { lat: 0.03 - row * 0.01, lng: col * 0.01 },
      name: `R${row}C${col}`,
    }))
  );

describe("parseCoordinateEntry", () => {
  it("accepts lat, lng at full precision, including zero", () => {
    expect(parseCoordinateEntry("-89.123456789, 45.987654321", latLngOnly).location).toEqual({
      lat: -89.123456789,
      lng: 45.987654321,
    });
    expect(parseCoordinateEntry("0 0", latLngOnly).location).toEqual({ lat: 0, lng: 0 });
  });

  it("rejects out-of-range and unrecognized input", () => {
    expect(parseCoordinateEntry("-91, 0", latLngOnly).error).toMatch(/Latitude/);
    expect(parseCoordinateEntry("BKL K12 L34", latLngOnly).error).toMatch(/lat, lng/);
    expect(parseCoordinateEntry("  ", latLngOnly).error).toBeTruthy();
  });

  it("round-trips LGRS labels in the mission's presentation", () => {
    const point = { lat: -89.5, lng: 45.2 };
    for (const dynamicLgrs of [true, false]) {
      const context = {
        ...latLngOnly,
        usingLGRSCoordinates: true,
        dynamicLgrs,
        landerLocation: point,
      };
      const text = formatCoordinateEntry(point, context);
      expect(text).toBe(getSouthLpsDisplayCoordinate(point, dynamicLgrs ? "full" : "condensed"));
      const parsed = parseCoordinateEntry(text, context).location;
      expect(formatCoordinateEntry(parsed, context)).toBe(text);
    }
    const lgrs = { ...latLngOnly, usingLGRSCoordinates: true, dynamicLgrs: true };
    expect(parseCoordinateEntry("not a label", lgrs).error).toMatch(/LGRS/);
  });

  it("resolves a server-grid cell name to its centre and rejects unknown or edge cells", () => {
    const grid = makeGrid();
    const context = { ...latLngOnly, serverGrid: grid };
    const center = parseCoordinateEntry("r2c1", context).location;
    expect(center.lat).toBeCloseTo(0.015, 9);
    expect(center.lng).toBeCloseTo(0.015, 9);
    expect(findGlobalGridCoordsFromPoint(grid, center, RADIUS)).toBe("R2C1");
    expect(formatCoordinateEntry(center, context)).toBe("R2C1");
    expect(parseCoordinateEntry("R9C9", context).error).toMatch(/grid cell/);
    expect(findGridCellCenterByName(grid, "R0C0", RADIUS)).toBeNull();
  });

  it("describes the accepted syntax", () => {
    expect(getCoordinateEntryHint(latLngOnly)).toMatch(/lat, lng/);
    expect(getCoordinateEntryHint({ ...latLngOnly, usingLGRSCoordinates: true })).toMatch(/LGRS/);
  });
});
