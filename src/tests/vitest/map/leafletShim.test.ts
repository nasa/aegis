/**
 * Tests for `leafletShim.ts` — `buildLegacyResolutions()` function.
 */

import { describe, it, expect } from "vitest";
import { buildLegacyResolutions } from "components/interface/map/utils/parsers/leafletShim";

describe("buildLegacyResolutions", () => {
  it("defaults to 32 zoom levels", () => {
    const resolutions = buildLegacyResolutions(12800, 0);
    expect(resolutions).toHaveLength(32);
  });

  it("first resolution equals unitsPerPixel * 2^zoomLevel", () => {
    // zoomLevel=0 → baseRes = 12800 * 2^0 = 12800
    expect(buildLegacyResolutions(12800, 0, 5)[0]).toBe(12800);

    // zoomLevel=2 → baseRes = 12800 * 2^2 = 51200
    expect(buildLegacyResolutions(12800, 2, 5)[0]).toBe(51200);
  });

  it("each subsequent resolution is half the previous", () => {
    const resolutions = buildLegacyResolutions(12800, 0, 8);
    for (let i = 1; i < resolutions.length; i++) {
      expect(resolutions[i]).toBeCloseTo(resolutions[i - 1] / 2);
    }
  });

  it("handles null zoomLevel (defaults to 0)", () => {
    const resolutions = buildLegacyResolutions(12800, null, 5);
    expect(resolutions[0]).toBe(12800);
  });

  it("produces the exact values the original Leaflet code would", () => {
    // Reference values from Leaflet CRS: unitsPerPixel=12800, zoomLevel=0
    const resolutions = buildLegacyResolutions(12800, 0, 6);
    expect(resolutions).toEqual([12800, 6400, 3200, 1600, 800, 400]);
  });
});
