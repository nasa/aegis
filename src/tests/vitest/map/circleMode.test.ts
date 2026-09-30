/**
 * Tests for `utils/layers/circleMode.ts` —
 *   - `switchCircleMode()` (mode transitions preserve common props, sensible defaults)
 */

import { describe, it, expect } from "vitest";
import { switchCircleMode } from "components/interface/map/utils/layers/circleMode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSolid(overrides: Partial<SolidCircleConfig> = {}): SolidCircleConfig {
  return {
    mode: "solid",
    visible: true,
    radius: 1000,
    showLabel: true,
    labelText: "1km",
    labelColor: "#ff0000",
    zIndex: 8,
    stroke: { color: "#ff8800", width: 2 },
    ...overrides,
  };
}

function makeDashed(overrides: Partial<DashedCircleConfig> = {}): DashedCircleConfig {
  return {
    mode: "dashed",
    visible: true,
    radius: 2000,
    showLabel: false,
    labelText: "",
    labelColor: "#00ff00",
    zIndex: 9,
    stroke: { color: "#00ff00", width: 1.5, segmentPx: 50, ratio: 1 },
    ...overrides,
  };
}

function makeCheckerboard(
  overrides: Partial<CheckerboardCircleConfig> = {}
): CheckerboardCircleConfig {
  return {
    mode: "checkerboard",
    visible: true,
    radius: 5000,
    showLabel: true,
    labelText: "5km",
    labelColor: "#ffffff",
    zIndex: 7,
    stroke: {
      segmentPx: 50,
      ratio: 1,
      innerThickness: 4,
      outerThickness: 4,
      innerColor: "#000000",
      outerColor: "#000000",
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// switchCircleMode
// ---------------------------------------------------------------------------

describe("switchCircleMode", () => {
  it("returns the SAME object reference when target mode equals current mode", () => {
    const c = makeSolid();
    expect(switchCircleMode(c, "solid")).toBe(c);
  });

  it("preserves common config (visible, radius, showLabel, labelText, labelColor, zIndex) across mode switches", () => {
    const c = makeSolid({
      visible: false,
      radius: 1234,
      showLabel: true,
      labelText: "xx",
      labelColor: "#abcdef",
      zIndex: 17,
    });

    for (const target of ["dashed", "checkerboard"] as const) {
      const next = switchCircleMode(c, target);
      expect(next.visible).toBe(false);
      expect(next.radius).toBe(1234);
      expect(next.showLabel).toBe(true);
      expect(next.labelText).toBe("xx");
      expect(next.labelColor).toBe("#abcdef");
      expect(next.zIndex).toBe(17);
      expect(next.mode).toBe(target);
    }
  });

  it("solid → dashed carries color/width into the dashed stroke and adds segment defaults", () => {
    const c = makeSolid({ stroke: { color: "#abcdef", width: 4 } });
    const next = switchCircleMode(c, "dashed") as DashedCircleConfig;
    expect(next.mode).toBe("dashed");
    expect(next.stroke.color).toBe("#abcdef");
    expect(next.stroke.width).toBe(4);
    expect(next.stroke.segmentPx).toBe(50);
    expect(next.stroke.ratio).toBe(1);
  });

  it("dashed → solid keeps color/width and drops segment fields", () => {
    const c = makeDashed({ stroke: { color: "#aabbcc", width: 2, segmentPx: 100, ratio: 2 } });
    const next = switchCircleMode(c, "solid") as SolidCircleConfig;
    expect(next.mode).toBe("solid");
    expect(next.stroke).toEqual({ color: "#aabbcc", width: 2 });
  });

  it("→ checkerboard discards solid stroke and emits checkerboard-shaped stroke fields", () => {
    const c = makeSolid({ stroke: { color: "#ff0000", width: 9 } });
    const next = switchCircleMode(c, "checkerboard") as CheckerboardCircleConfig;
    expect(next.mode).toBe("checkerboard");
    // Structural check — checkerboard stroke uses inner/outer color+thickness,
    // not the simple color/width pair from the source solid stroke.
    expect(next.stroke).toEqual(
      expect.objectContaining({
        segmentPx: expect.any(Number),
        ratio: expect.any(Number),
        innerThickness: expect.any(Number),
        outerThickness: expect.any(Number),
        innerColor: expect.any(String),
        outerColor: expect.any(String),
      })
    );
    expect(next.stroke).not.toHaveProperty("color");
    expect(next.stroke).not.toHaveProperty("width");
  });

  it.each([
    { labelColor: "#fedcba", expectedColor: "#fedcba", desc: "uses labelColor" },
    { labelColor: "", expectedColor: "#ff0000", desc: "falls back when labelColor is empty" },
  ])("checkerboard → solid $desc as the stroke color", ({ labelColor, expectedColor }) => {
    const c = makeCheckerboard({ labelColor });
    const next = switchCircleMode(c, "solid") as SolidCircleConfig;
    expect(next.stroke.color).toBe(expectedColor);
    expect(next.stroke.width).toBeGreaterThan(0);
  });

  it("checkerboard → dashed picks up labelColor for the line color", () => {
    const c = makeCheckerboard({ labelColor: "#112233" });
    const next = switchCircleMode(c, "dashed") as DashedCircleConfig;
    expect(next.stroke.color).toBe("#112233");
    expect(next.stroke.width).toBe(1.5);
    expect(next.stroke.segmentPx).toBe(50);
    expect(next.stroke.ratio).toBe(1);
  });
});
