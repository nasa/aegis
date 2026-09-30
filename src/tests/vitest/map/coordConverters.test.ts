/**
 * Tests for `createCoordConverters()` — the pure factory function that
 * converts between AEGISPoint (lat/lng degrees) and OL projected coordinates.
 */

import { describe, it, expect } from "vitest";
import {
  registerTestProjections,
  createTestCoordConverters,
  createEarthCoordConverters,
  SOUTH_POLE_POINT,
  LCROSS_POINT,
  SF_POINT,
} from "./helpers/olTestUtils";

// Register projections once before all tests
registerTestProjections();

describe("createCoordConverters", () => {
  describe("Lunar South Pole (IAU2000:30166)", () => {
    const converters = createTestCoordConverters();

    it("round-trips a south pole point", () => {
      const coord = converters.toMapCoord(SOUTH_POLE_POINT);
      const result = converters.toAegisPoint(coord);
      expect(result.lat).toBeCloseTo(SOUTH_POLE_POINT.lat, 4);
      expect(result.lng).toBeCloseTo(SOUTH_POLE_POINT.lng, 4);
    });

    it("round-trips the LCROSS impact site", () => {
      const coord = converters.toMapCoord(LCROSS_POINT);
      const result = converters.toAegisPoint(coord);
      expect(result.lat).toBeCloseTo(LCROSS_POINT.lat, 4);
      expect(result.lng).toBeCloseTo(LCROSS_POINT.lng, 4);
    });

    it("handles null-ish lat/lng gracefully", () => {
      const coord = converters.toMapCoord({ lat: null, lng: null } as unknown as AEGISPoint);
      expect(coord).toEqual([0, 0]);
    });
  });

  describe("Earth / EPSG:3857 (Web Mercator)", () => {
    const converters = createEarthCoordConverters();

    it("converts San Francisco to projected coords", () => {
      const [x, y] = converters.toMapCoord(SF_POINT);
      // Web Mercator x ≈ -13627665, y ≈ 4547675
      expect(x).toBeCloseTo(-13627665, -2);
      expect(y).toBeCloseTo(4547675, -2);
    });

    it("round-trips San Francisco", () => {
      const coord = converters.toMapCoord(SF_POINT);
      const result = converters.toAegisPoint(coord);
      expect(result.lat).toBeCloseTo(SF_POINT.lat, 4);
      expect(result.lng).toBeCloseTo(SF_POINT.lng, 4);
    });
  });
});
