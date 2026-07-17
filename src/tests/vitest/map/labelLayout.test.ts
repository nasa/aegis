/**
 * Tests for `utils/labelLayout.ts` —
 *   - `computeLabelOpacities()` (overlap-based dimming)
 *   - `measureLabelText()` (canvas text measurement)
 */

import { describe, it, expect } from "vitest";
import {
  computeLabelOpacities,
  measureLabelText,
  type LabelDescriptor,
} from "components/interface/map/utils/labelLayout";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLabel(overrides: Partial<LabelDescriptor>): LabelDescriptor {
  return {
    id: "default",
    labelPx: [0, 0],
    textWidth: 50,
    textHeight: 20,
    priority: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeLabelOpacities
// ---------------------------------------------------------------------------

describe("computeLabelOpacities", () => {
  it("returns full opacity for non-overlapping labels", () => {
    const labels = [
      makeLabel({ id: "a", labelPx: [0, 0] }),
      makeLabel({ id: "b", labelPx: [500, 0] }),
    ];
    const result = computeLabelOpacities(labels);
    for (const r of result) {
      expect(r.opacity).toBe(1.0);
    }
  });

  it("dims a lower-priority label that fully overlaps a higher-priority one", () => {
    // Same position; "a" higher priority (lower number)
    const labels = [
      makeLabel({ id: "a", priority: 0, labelPx: [100, 100] }),
      makeLabel({ id: "b", priority: 2, labelPx: [100, 100] }),
    ];
    const result = computeLabelOpacities(labels);
    const aOpacity = result.find((r) => r.id === "a")!.opacity;
    const bOpacity = result.find((r) => r.id === "b")!.opacity;

    // Highest-priority always full opacity
    expect(aOpacity).toBe(1.0);
    // Fully covered → minimum opacity (0.2)
    expect(bOpacity).toBeCloseTo(0.2, 5);
  });

  it("does not dim higher-priority labels even when overlapped by later inputs", () => {
    // "a" has lower priority number = higher priority; "b" overlaps "a" but
    // is processed AFTER (higher number = lower priority).
    const labels = [
      makeLabel({ id: "b", priority: 3, labelPx: [100, 100] }),
      makeLabel({ id: "a", priority: 0, labelPx: [100, 100] }),
    ];
    const result = computeLabelOpacities(labels);
    expect(result.find((r) => r.id === "a")!.opacity).toBe(1.0);
  });

  it("uses union (not sum) of higher-priority overlap when three labels stack", () => {
    // Two higher-priority labels each fully cover the same half of the target.
    // Sum-of-overlaps would report 100% coverage; union should report ~50%.
    const labels = [
      // Two priority-0 rects, both occupying x=[-25..25], y=[-10..10] — the
      // SAME left half of the target rect below.
      makeLabel({ id: "h1", priority: 0, labelPx: [0, 0], textWidth: 50, textHeight: 20 }),
      makeLabel({ id: "h2", priority: 0, labelPx: [0, 0], textWidth: 50, textHeight: 20 }),
      // Target at +25 → its left half (x=0..25) is fully covered by h1 & h2,
      // its right half (x=25..50) is uncovered. True union coverage ≈ 0.5.
      makeLabel({ id: "t", priority: 2, labelPx: [25, 0], textWidth: 50, textHeight: 20 }),
    ];
    const result = computeLabelOpacities(labels);
    const tOpacity = result.find((r) => r.id === "t")!.opacity;
    // Half-covered: opacity = 1 - 0.5 * (1 - 0.2) = 0.6 (±~5% sampling tolerance)
    expect(tOpacity).toBeGreaterThan(0.5);
    expect(tOpacity).toBeLessThan(0.7);
  });

  it("partial overlap produces partial dimming between MIN_OPACITY and 1", () => {
    // "b" overlaps about half of "a" since boxes are width=50 height=20
    const labels = [
      makeLabel({ id: "a", priority: 0, labelPx: [0, 0], textWidth: 50, textHeight: 20 }),
      makeLabel({ id: "b", priority: 2, labelPx: [25, 0], textWidth: 50, textHeight: 20 }),
    ];
    const result = computeLabelOpacities(labels);
    const bOpacity = result.find((r) => r.id === "b")!.opacity;
    expect(bOpacity).toBeGreaterThan(0.2);
    expect(bOpacity).toBeLessThan(1.0);
  });

  it("handles empty input", () => {
    expect(computeLabelOpacities([])).toEqual([]);
  });

  it("handles a single label", () => {
    const result = computeLabelOpacities([makeLabel({ id: "solo" })]);
    expect(result).toEqual([{ id: "solo", opacity: 1.0 }]);
  });

  it("handles zero-area label without dividing by zero", () => {
    const result = computeLabelOpacities([
      makeLabel({ id: "a", priority: 0, labelPx: [0, 0] }),
      makeLabel({ id: "b", priority: 1, textWidth: 0, textHeight: 0, labelPx: [0, 0] }),
    ]);
    const bOpacity = result.find((r) => r.id === "b")!.opacity;
    expect(Number.isFinite(bOpacity)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// measureLabelText
// ---------------------------------------------------------------------------

describe("measureLabelText", () => {
  // jsdom's <canvas> getContext("2d") returns null, so measureLabelText
  // returns null here. That's the contract: callers must handle null.
  // The actual rendering branch is exercised in the browser-mode test.

  it("returns null when no 2D canvas context is available (jsdom)", () => {
    expect(measureLabelText("Station A1", 14)).toBeNull();
  });

  it("does not throw on empty string", () => {
    expect(() => measureLabelText("", 14)).not.toThrow();
  });
});
