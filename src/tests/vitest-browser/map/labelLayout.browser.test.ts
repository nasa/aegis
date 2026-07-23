/**
 * Browser-mode tests for `utils/labelLayout.ts` — `measureLabelText()`.
 *
 * The unit test version of this file (jsdom) only covers the null-context
 * fallback. Here we exercise the real `<canvas>` measurement path.
 */

import { describe, it, expect } from "vitest";
import { measureLabelText } from "components/interface/map/utils/labelLayout";

describe("measureLabelText (browser)", () => {
  it("returns positive width and font-size+padding height for a non-empty string", () => {
    const result = measureLabelText("Station 1", 14);
    expect(result).not.toBeNull();
    expect(result!.width).toBeGreaterThan(12); // includes 12px padding
    expect(result!.height).toBe(14 + 8);
  });

  it("longer strings have larger widths", () => {
    const short = measureLabelText("X", 14)!;
    const long = measureLabelText("XXXXXXXXXX", 14)!;
    expect(long.width).toBeGreaterThan(short.width);
  });

  it("respects custom font sizes via the height formula", () => {
    expect(measureLabelText("X", 18)!.height).toBe(18 + 8);
    expect(measureLabelText("X", 24)!.height).toBe(24 + 8);
  });
});
