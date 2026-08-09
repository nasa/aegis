/*
 * The following test cases should EXACTLY match the test cases from the surf_nav repo
 * They should ONLY be changed to match tests in the surf_nav repo.
 * You can access these tests in the surf_nav repo at:
 * https://gitlab.fit.nasa.gov/cm-artemis-integration/cm-ehp/surf-nav
 *
 * and the file these tests are in is:
 * https://gitlab.fit.nasa.gov/cm-artemis-integration/cm-ehp/surf-nav/-/blob/main/surf_nav/nav_tools/test/test_orienteering.py?ref_type=heads
 *
 * The following test cases are also EXPORT CONTROLLED! Authorization is required to export or reuse these items
 */

import { range_bearing_from_xy } from "../../../../utils/surf-nav/orienteering";

describe("Surf-nav orienteering tests", () => {
  describe("range_bearing_from_xy", () => {
    it("Q1", () => {
      const result = range_bearing_from_xy(0, 0, 1, 1);
      expect(Math.abs(result.range - Math.sqrt(2))).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(result.bearing - 225)).toBeLessThanOrEqual(1e-3);
    });

    it("Q2", () => {
      const result = range_bearing_from_xy(0, 0, -1, 1);
      expect(Math.abs(result.range - Math.sqrt(2))).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(result.bearing - 135)).toBeLessThanOrEqual(1e-3);
    });

    it("Q3", () => {
      const result = range_bearing_from_xy(0, 0, -1, -1);
      expect(Math.abs(result.range - Math.sqrt(2))).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(result.bearing - 45)).toBeLessThanOrEqual(1e-3);
    });

    it("Q4", () => {
      const result = range_bearing_from_xy(0, 0, 1, -1);
      expect(Math.abs(result.range - Math.sqrt(2))).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(result.bearing - 315)).toBeLessThanOrEqual(1e-3);
    });

    it("East", () => {
      const result = range_bearing_from_xy(0, 0, 1, 0);
      expect(Math.abs(result.range - 1)).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(result.bearing - 270)).toBeLessThanOrEqual(1e-3);
    });

    it("North", () => {
      const result = range_bearing_from_xy(0, 0, 0, 1);
      expect(Math.abs(result.range - 1)).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(result.bearing - 180)).toBeLessThanOrEqual(1e-3);
    });

    it("West", () => {
      const result = range_bearing_from_xy(0, 0, -1, 0);
      expect(Math.abs(result.range - 1)).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(result.bearing - 90)).toBeLessThanOrEqual(1e-3);
    });

    it("South", () => {
      const result = range_bearing_from_xy(0, 0, 0, -1);
      expect(Math.abs(result.range - 1)).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(result.bearing - 0)).toBeLessThanOrEqual(1e-3);
    });
  });
});
