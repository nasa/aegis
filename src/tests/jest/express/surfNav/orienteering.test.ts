import {
  xy_from_range_bearing,
  range_bearing_from_xy,
  haversine,
} from "../../../../utils/surf-nav/orienteering";

describe("Surf-nav orienteering tests", () => {
  describe("xy_from_range_bearing", () => {
    it("Q1", () => {
      const result = xy_from_range_bearing(0.5, Math.sqrt(3) / 2, 1, 30);
      expect(Math.abs(result.x - 0)).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(result.y - 0)).toBeLessThanOrEqual(1e-3);
    });

    it("Q2", () => {
      const result = xy_from_range_bearing(-0.5, Math.sqrt(3) / 2, 1, 330);
      expect(Math.abs(result.x - 0)).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(result.y - 0)).toBeLessThanOrEqual(1e-3);
    });

    it("Q3", () => {
      const result = xy_from_range_bearing(-Math.sqrt(3) / 2, -0.5, 1, 240);
      expect(Math.abs(result.x - 0)).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(result.y - 0)).toBeLessThanOrEqual(1e-3);
    });

    it("Q4", () => {
      const result = xy_from_range_bearing(Math.sqrt(3) / 2, -0.5, 1, 120);
      expect(Math.abs(result.x - 0)).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(result.y - 0)).toBeLessThanOrEqual(1e-3);
    });

    it("North", () => {
      const result = xy_from_range_bearing(0, 1, 1, 0);
      expect(Math.abs(result.x - 0)).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(result.y - 0)).toBeLessThanOrEqual(1e-3);
    });

    it("East", () => {
      const result = xy_from_range_bearing(1, 0, 1, 90);
      expect(Math.abs(result.x - 0)).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(result.y - 0)).toBeLessThanOrEqual(1e-3);
    });

    it("South", () => {
      const result = xy_from_range_bearing(0, -1, 1, 180);
      expect(Math.abs(result.x - 0)).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(result.y - 0)).toBeLessThanOrEqual(1e-3);
    });

    it("West", () => {
      const result = xy_from_range_bearing(-1, 0, 1, 270);
      expect(Math.abs(result.x - 0)).toBeLessThanOrEqual(1e-3);
      expect(Math.abs(result.y - 0)).toBeLessThanOrEqual(1e-3);
    });
  });

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

  describe("haversine", () => {
    it("Poles", () => {
      const range = haversine(90, 0, -90, 0, 1737.4); // Moon's mean radius in km
      expect(Math.abs(range - Math.PI * 1737.4)).toBeLessThanOrEqual(1e-3);
    });
  });
});
