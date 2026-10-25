/**
 * Browser-mode tests for `utils/labelLayout.ts` — `measureLabelText()`.
 *
 * The unit test version of this file (jsdom) only covers the null-context
 * fallback. Here we exercise the real `<canvas>` measurement path.
 */

import { describe, it, expect } from "vitest";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { measureLabelText } from "components/interface/map/utils/labelLayout";
import { createMarkerLabelStyle } from "components/interface/map/utils/styles/markerLabels";

function renderedLabelCanvas(name: string, fontSize: number): HTMLCanvasElement {
  const feature = new Feature(new Point([0, 0]));
  feature.set("name", name);
  feature.set("labelType", "station");
  const style = createMarkerLabelStyle(fontSize)(feature, 1);
  const labelStyle = Array.isArray(style) ? style[style.length - 1] : style;
  return labelStyle!.getImage()!.getImage(1) as HTMLCanvasElement;
}

describe("measureLabelText (browser)", () => {
  it("measures bounds that contain a rendered single-line label", () => {
    const result = measureLabelText("Station 1", 14);
    expect(result).not.toBeNull();
    expect(result!.width).toBeGreaterThan(12); // includes 12px padding
    const canvas = renderedLabelCanvas("Station 1", 14);
    const dpr = window.devicePixelRatio || 1;
    expect(canvas.width / dpr).toBeGreaterThanOrEqual(result!.width);
    expect(canvas.width / dpr).toBeLessThan(result!.width + 1);
    expect(canvas.height / dpr).toBeGreaterThanOrEqual(result!.height);
    expect(canvas.height / dpr).toBeLessThan(result!.height + 1);
  });

  it("longer strings have larger widths", () => {
    const short = measureLabelText("X", 14)!;
    const long = measureLabelText("XXXXXXXXXX", 14)!;
    expect(long.width).toBeGreaterThan(short.width);
  });

  it("matches rendered single- and multiline bounds at different font sizes", () => {
    for (const fontSize of [10, 14, 18, 24]) {
      for (const name of ["X", "Line one\nLine two"]) {
        const measured = measureLabelText(name, fontSize)!;
        const canvas = renderedLabelCanvas(name, fontSize);
        const dpr = window.devicePixelRatio || 1;
        expect(canvas.width / dpr).toBeGreaterThanOrEqual(measured.width);
        expect(canvas.width / dpr).toBeLessThan(measured.width + 1);
        expect(canvas.height / dpr).toBeGreaterThanOrEqual(measured.height);
        expect(canvas.height / dpr).toBeLessThan(measured.height + 1);
      }
      const single = measureLabelText("X", fontSize)!;
      const multiline = measureLabelText("Line one\nLine two", fontSize)!;
      expect(multiline.height).toBeGreaterThan(single.height);
    }
  });
});
