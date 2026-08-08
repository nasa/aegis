import { describe, expect, it } from "vitest";

import { migrateLegacyHaloStyle } from "store/storeUtils/preset";

type LegacyHaloStyle = MapSublayerStyle & {
  labelStrokeColor?: string;
  labelStrokeOpacity?: number;
  labelStrokeWidth?: number;
};

describe("migrateLegacyHaloStyle", () => {
  it("maps legacy label stroke properties to halo properties idempotently", () => {
    const legacyStyle = {
      labelStrokeColor: "#000000",
      labelStrokeOpacity: 0.85,
      labelStrokeWidth: 2,
    } as LegacyHaloStyle;

    migrateLegacyHaloStyle(legacyStyle);
    migrateLegacyHaloStyle(legacyStyle);

    expect(legacyStyle).toMatchObject({
      labelHaloColor: "#000000",
      labelHaloOpacity: 0.85,
      labelHaloWidth: 2,
    });
    expect(legacyStyle).not.toHaveProperty("labelStrokeColor");
    expect(legacyStyle).not.toHaveProperty("labelStrokeOpacity");
    expect(legacyStyle).not.toHaveProperty("labelStrokeWidth");
  });

  it("preserves existing halo properties", () => {
    const mixedStyle = {
      labelHaloColor: "#FFFFFF",
      labelHaloOpacity: 0.5,
      labelHaloWidth: 3,
      labelStrokeColor: "#000000",
      labelStrokeOpacity: 0.85,
      labelStrokeWidth: 2,
    } as LegacyHaloStyle;

    migrateLegacyHaloStyle(mixedStyle);

    expect(mixedStyle).toMatchObject({
      labelHaloColor: "#FFFFFF",
      labelHaloOpacity: 0.5,
      labelHaloWidth: 3,
    });
    expect(mixedStyle).not.toHaveProperty("labelStrokeColor");
    expect(mixedStyle).not.toHaveProperty("labelStrokeOpacity");
    expect(mixedStyle).not.toHaveProperty("labelStrokeWidth");
  });
});
