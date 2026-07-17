/**
 * Browser-mode tests for `utils/styles/posMarker.ts`.
 *
 * WHY BROWSER MODE?
 * The POS marker style builder calls `renderEmojiToCanvas()` for non-EV
 * posTypes, which paints to a real `<canvas>` 2D context. jsdom's canvas
 * getContext returns null, so the styles can't be exercised there.
 */

import { describe, it, expect } from "vitest";
import Feature from "ol/Feature";
import { Point } from "ol/geom";
import { Icon } from "ol/style";
import type { Style } from "ol/style";
import { buildPosMarkerStyleFunction } from "components/interface/map/utils/styles/posMarker";
import type { PosMarkerIcon } from "components/interface/map/utils/styles/posMarker";
import { MODE_CONFIGS } from "components/interface/map/utils/modeConfig";

function makeFeature(posMarkers: PosMarkerIcon[], faded = false): Feature {
  const f = new Feature(new Point([0, 0]));
  f.set("posMarkers", posMarkers);
  f.set("faded", faded);
  return f;
}

function iconStyles(styles: Style[]): Icon[] {
  return styles.map((s) => s.getImage()).filter((img): img is Icon => img instanceof Icon);
}

describe("buildPosMarkerStyleFunction", () => {
  it("returns no styles when the feature has no posMarkers", () => {
    const fn = buildPosMarkerStyleFunction(MODE_CONFIGS.editor);
    expect(fn(makeFeature([]), 1)).toHaveLength(0);
  });

  it("renders one icon + one color bar per posType", () => {
    const fn = buildPosMarkerStyleFunction(MODE_CONFIGS.editor);
    const styles = fn(
      makeFeature([
        { emoji: "1f535", isEV: false, color: "#00aaff" },
        { emoji: "1f534", isEV: false, color: "#ff0000" },
      ]),
      1
    );
    // 2 icons + 2 bars
    expect(iconStyles(styles)).toHaveLength(4);
  });

  it("sizes emoji icons to the mode's evIconSize", () => {
    const fn = buildPosMarkerStyleFunction(MODE_CONFIGS.editor);
    const styles = fn(makeFeature([{ emoji: "1f535", isEV: false, color: "#00aaff" }]), 1);
    const icons = iconStyles(styles);
    // The icon (not the bar) is square at evIconSize
    const emojiIcon = icons.find((i) => i.getSize()?.[0] === i.getSize()?.[1]);
    expect(emojiIcon?.getSize()).toEqual([
      MODE_CONFIGS.editor.pos.evIconSize,
      MODE_CONFIGS.editor.pos.evIconSize,
    ]);
  });

  it("uses the astronaut SVG for EV posTypes", () => {
    const fn = buildPosMarkerStyleFunction(MODE_CONFIGS.editor);
    const styles = fn(makeFeature([{ emoji: "", isEV: true, color: "#00ff00" }]), 1);
    const icon = iconStyles(styles)[0];
    expect(icon.getSrc()).toContain("astronaut_outline.svg");
  });

  it("stacks the first posType on top (highest zIndex)", () => {
    const fn = buildPosMarkerStyleFunction(MODE_CONFIGS.editor);
    const styles = fn(
      makeFeature([
        { emoji: "1f535", isEV: false, color: "#00aaff" },
        { emoji: "1f534", isEV: false, color: "#ff0000" },
      ]),
      1
    );
    // Icon styles carry descending zIndex (100 - i); index 0 is highest.
    const iconZ = styles
      .filter((s) => s.getZIndex() === 100 || s.getZIndex() === 99)
      .map((s) => s.getZIndex());
    expect(Math.max(...iconZ)).toBe(100);
    expect(iconZ).toContain(99);
  });

  it("applies faded opacity to icons and bars", () => {
    const fn = buildPosMarkerStyleFunction(MODE_CONFIGS.editor);
    const styles = fn(makeFeature([{ emoji: "1f535", isEV: false, color: "#00aaff" }], true), 1);
    for (const icon of iconStyles(styles)) {
      expect(icon.getOpacity()).toBeCloseTo(0.4);
    }
  });
});
