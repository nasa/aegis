import { describe, it, expect } from "vitest";
import Feature from "ol/Feature";
import { LineString } from "ol/geom";
import {
  createMajorContourStyle,
  createMinorContourStyle,
} from "components/interface/map/testMapPerformant/contours";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(elevation: number | null): Feature {
  const f = new Feature(
    new LineString([
      [0, 0],
      [10, 0],
    ])
  );
  if (elevation !== null) f.set("Contour", elevation);
  return f;
}

/** Compute the resolution that yields a given zoom for a given baseResolution. */
function resolutionAtZoom(baseRes: number, zoom: number): number {
  return baseRes / 2 ** zoom;
}

const BASE_RESOLUTION = 1000;

// ---------------------------------------------------------------------------
// Major contours
// ---------------------------------------------------------------------------

describe("createMajorContourStyle", () => {
  it("returns a Style with a stroke and no label at zoom 0", () => {
    const fn = createMajorContourStyle(BASE_RESOLUTION, true);
    const style = fn(makeFeature(1500), BASE_RESOLUTION); // zoom 0
    expect(style).toBeDefined();
    const stroke = style!.getStroke()!;
    // Color must be present and resemble an rgba; specific channel values are a
    // visual choice covered by manual review, not a contract worth pinning.
    expect(typeof stroke.getColor()).toBe("string");
    expect(stroke.getWidth()).toBeGreaterThan(0);
    expect(style!.getText()).toBeFalsy();
  });

  it("renders the elevation label when zoom > 7 and showLabels=true", () => {
    const fn = createMajorContourStyle(BASE_RESOLUTION, true);
    const res = resolutionAtZoom(BASE_RESOLUTION, 8);
    const style = fn(makeFeature(1234), res);
    const text = style!.getText()!;
    expect(text).toBeTruthy();
    expect(text.getText()).toBe("1234m");
    expect(text.getFill()).toBeTruthy();
  });

  it("does NOT render a label when showLabels=false even at high zoom", () => {
    const fn = createMajorContourStyle(BASE_RESOLUTION, false);
    const res = resolutionAtZoom(BASE_RESOLUTION, 10);
    const style = fn(makeFeature(1234), res);
    expect(style!.getText()).toBeFalsy();
  });

  it("does NOT render a label at exactly zoom 7 (threshold is strict >)", () => {
    const fn = createMajorContourStyle(BASE_RESOLUTION, true);
    const res = resolutionAtZoom(BASE_RESOLUTION, 7);
    const style = fn(makeFeature(1234), res);
    expect(style!.getText()).toBeFalsy();
  });

  it("does NOT render a label when elevation is missing/falsy", () => {
    const fn = createMajorContourStyle(BASE_RESOLUTION, true);
    const res = resolutionAtZoom(BASE_RESOLUTION, 8);
    const style = fn(makeFeature(null), res);
    expect(style!.getText()).toBeFalsy();
  });

  it("caches by (elevation, label-visible, floor(zoom)) — same key returns same Style", () => {
    const fn = createMajorContourStyle(BASE_RESOLUTION, true);
    const res = resolutionAtZoom(BASE_RESOLUTION, 8.5);
    const a = fn(makeFeature(1234), res);
    const b = fn(makeFeature(1234), res);
    expect(a).toBe(b);
    // Also verify different elevations produce different styles (distinct cache keys)
    const c = fn(makeFeature(5678), res);
    expect(c!.getText()!.getText()).toBe("5678m");
    expect(a!.getText()!.getText()).toBe("1234m");
  });
});

// ---------------------------------------------------------------------------
// Minor contours
// ---------------------------------------------------------------------------

describe("createMinorContourStyle", () => {
  it("returns a Style with a thinner stroke than majors at zoom 0", () => {
    const minorFn = createMinorContourStyle(BASE_RESOLUTION, true);
    const majorFn = createMajorContourStyle(BASE_RESOLUTION, true);
    const minor = minorFn(makeFeature(1500), BASE_RESOLUTION)!;
    const major = majorFn(makeFeature(1500), BASE_RESOLUTION)!;
    expect(minor.getStroke()!.getWidth()).toBeLessThan(major.getStroke()!.getWidth());
  });

  it("renders the elevation label when zoom > 9 and showLabels=true", () => {
    const fn = createMinorContourStyle(BASE_RESOLUTION, true);
    const res = resolutionAtZoom(BASE_RESOLUTION, 10);
    const style = fn(makeFeature(1234), res);
    const text = style!.getText()!;
    expect(text.getFill()).toBeTruthy();
    expect(text.getText()).toBe("1234m");
  });

  it("does NOT render a label at zoom 8 (threshold is > 9, higher than majors)", () => {
    const fn = createMinorContourStyle(BASE_RESOLUTION, true);
    const res = resolutionAtZoom(BASE_RESOLUTION, 8);
    const style = fn(makeFeature(1234), res);
    expect(style!.getText()).toBeFalsy();
  });

  it("uses smaller font (11px) than majors (12px)", () => {
    const minorFn = createMinorContourStyle(BASE_RESOLUTION, true);
    const majorFn = createMajorContourStyle(BASE_RESOLUTION, true);
    const res = resolutionAtZoom(BASE_RESOLUTION, 10);
    const minor = minorFn(makeFeature(1234), res)!.getText()!;
    const major = majorFn(makeFeature(1234), res)!.getText()!;
    expect(minor.getFont()).toContain("11px");
    expect(major.getFont()).toContain("12px");
  });
});
