/**
 * Browser-mode tests for `emojiRenderer.ts`
 *
 * WHY BROWSER MODE?
 * jsdom's canvas implementation is a stub — `getContext("2d")` returns null
 * or a no-op context that produces all-zero pixel data. These tests verify
 * that emoji glyphs are actually drawn (non-zero pixels), which requires a
 * real GPU-backed 2D canvas context.
 *
 * Run with: npm run test:vitest:browser
 * (Uses Playwright/Chromium headless via @vitest/browser)
 */

import { describe, it, expect } from "vitest";
import {
  renderEmojiToCanvas,
  renderLanderIconToCanvas,
} from "components/interface/map/utils/emojiRenderer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Count non-transparent pixels in a canvas.
 * A real render will have many; a blank canvas has zero.
 */
/** Expected device-pixel backing-store dimension for a given logical size. */
function devicePx(logical: number): number {
  return Math.round(logical * (window.devicePixelRatio || 1));
}

function countNonTransparentPixels(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d")!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  // Alpha channel is every 4th byte (index 3, 7, 11, ...)
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) count++;
  }
  return count;
}

/** Alpha-weighted centroid (device px) of the painted pixels. */
function alphaCentroid(canvas: HTMLCanvasElement): { cx: number; cy: number } {
  const ctx = canvas.getContext("2d")!;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let sx = 0;
  let sy = 0;
  let sa = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      sx += x * a;
      sy += y * a;
      sa += a;
    }
  }
  return { cx: sx / sa, cy: sy / sa };
}

// ---------------------------------------------------------------------------
// renderEmojiToCanvas
// ---------------------------------------------------------------------------

describe("renderEmojiToCanvas", () => {
  // Clear the module-level cache between tests by reloading — not possible
  // directly, but individual cache misses are fine since we use unique keys.

  it("canvas is backed at the requested size × devicePixelRatio", () => {
    const canvas = renderEmojiToCanvas("1f4cd", 48);
    expect(canvas.width).toBe(devicePx(48));
    expect(canvas.height).toBe(devicePx(48));
  });

  it("renders actual pixels (not a blank canvas)", () => {
    const canvas = renderEmojiToCanvas("1f4cd", 32);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    const nonEmpty = countNonTransparentPixels(canvas);
    // A rendered pin emoji should paint many pixels
    expect(nonEmpty).toBeGreaterThan(20);
  });

  it("caches results — returns same canvas for identical inputs", () => {
    const first = renderEmojiToCanvas("2b50", 32); // ⭐
    const second = renderEmojiToCanvas("2b50", 32);
    expect(first).toBe(second); // strict reference equality
  });

  it("different sizes produce different canvases", () => {
    const small = renderEmojiToCanvas("2b50", 24);
    const large = renderEmojiToCanvas("2b50", 48);
    expect(small).not.toBe(large);
  });

  it("handles a literal emoji character (not a hex code)", () => {
    const canvas = renderEmojiToCanvas("🚀", 32);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    const nonEmpty = countNonTransparentPixels(canvas);
    expect(nonEmpty).toBeGreaterThan(20);
  });

  it("handles multi-codepoint emoji sequences (e.g. 1f468-200d-1f680)", () => {
    // 👨‍🚀 (astronaut) — family emoji joined with ZWJ
    const canvas = renderEmojiToCanvas("1f468-200d-1f680", 40);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.width).toBe(devicePx(40));
  });

  it("centers the glyph on the canvas so it stays concentric with a ring", () => {
    // A symmetric glyph's painted centroid should land on the canvas center.
    // Before ink-box centering, `textBaseline` left the glyph sitting ~2–5px
    // high, offsetting station markers from their green in-progress ring.
    const size = 34;
    const canvas = renderEmojiToCanvas("2b1c", size); // ⬜ white square
    const { cx, cy } = alphaCentroid(canvas);
    const center = canvas.width / 2;
    const dpr = window.devicePixelRatio || 1;
    // Allow ~1.5 logical px slack for antialiasing and glyph asymmetry.
    expect(Math.abs(cx - center) / dpr).toBeLessThan(1.5);
    expect(Math.abs(cy - center) / dpr).toBeLessThan(1.5);
  });
});

// ---------------------------------------------------------------------------
// renderLanderIconToCanvas
// ---------------------------------------------------------------------------

describe("renderLanderIconToCanvas", () => {
  it("canvas is backed at size × devicePixelRatio and returns an HTMLCanvasElement", async () => {
    const canvas = await renderLanderIconToCanvas(50);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.width).toBe(devicePx(50));
    expect(canvas.height).toBe(devicePx(50));
  });

  it("caches results — second call resolves to same canvas", async () => {
    const first = await renderLanderIconToCanvas(36);
    const second = await renderLanderIconToCanvas(36);
    expect(first).toBe(second);
  });
});
