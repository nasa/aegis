/**
 * Tests for `visualStyleApplicator.ts` — buildCSSFilter (pure function).
 *
 * We test the pure `buildCSSFilter` function which has no DOM/OL dependency.
 * The `applyVisualStyle`/`clearVisualStyle` functions interact with OL layer
 * canvas elements and are better tested in browser mode.
 */

import { describe, it, expect } from "vitest";
import { buildCSSFilter } from "components/interface/map/utils/visualStyleApplicator";

/** Helper to create a minimal MapSublayerStyle with defaults */
function makeStyle(overrides: Partial<MapSublayerStyle> = {}): MapSublayerStyle {
  return {
    opacity: 1,
    contrast: 1,
    brightness: 1,
    saturation: 1,
    blendMode: "normal",
    color: "#000000",
    weight: 1,
    fillColor: "#000000",
    fillOpacity: 1,
    isDashed: false,
    dashLen: 0,
    altColor: "#000000",
    altOpacity: 1,
    ...overrides,
  };
}

describe("buildCSSFilter", () => {
  it('returns "none" when all values are default', () => {
    expect(buildCSSFilter(makeStyle())).toBe("none");
  });

  it("applies brightness filter", () => {
    const result = buildCSSFilter(makeStyle({ brightness: 1.5 }));
    expect(result).toBe("brightness(1.5)");
  });

  it("applies contrast filter", () => {
    const result = buildCSSFilter(makeStyle({ contrast: 0.8 }));
    expect(result).toBe("contrast(0.8)");
  });

  it("applies saturation filter", () => {
    const result = buildCSSFilter(makeStyle({ saturation: 2 }));
    expect(result).toBe("saturate(2)");
  });

  it("composes multiple filters correctly", () => {
    const result = buildCSSFilter(makeStyle({ brightness: 1.2, contrast: 0.9, saturation: 1.5 }));
    expect(result).toBe("brightness(1.2) contrast(0.9) saturate(1.5)");
  });

  it('returns "none" for undefined filter values', () => {
    const style = makeStyle();
    style.brightness = undefined;
    style.contrast = undefined;
    style.saturation = undefined;
    expect(buildCSSFilter(style)).toBe("none");
  });

  it("ignores brightness when equal to 1", () => {
    const result = buildCSSFilter(makeStyle({ brightness: 1, contrast: 0.5 }));
    expect(result).toBe("contrast(0.5)");
    expect(result).not.toContain("brightness");
  });
});
