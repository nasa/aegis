import paper from "paper";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { drawSlopeBand, drawSlopeSeparator } from "utils/paperSlope";

describe("drawSlopeBand", () => {
  beforeEach(() => paper.setup(document.createElement("canvas")));
  afterEach(() => paper.project.remove());

  it("leaves intervals touching null samples transparent without bridging", () => {
    const group = new paper.Group();
    drawSlopeBand(
      group,
      [
        { xPixel: 0, yPixel: 0, val: 2, distanceMeters: 0, slopeDegrees: 2 },
        { xPixel: 10, yPixel: 0, val: 0, distanceMeters: 10, slopeDegrees: null },
        { xPixel: 20, yPixel: 0, val: 4, distanceMeters: 20, slopeDegrees: 4 },
      ],
      0,
      10
    );
    expect(group.children).toHaveLength(0);
  });

  it("draws signed grades using their magnitude", () => {
    const group = new paper.Group();
    drawSlopeBand(
      group,
      [
        { xPixel: 0, yPixel: 0, val: -4, distanceMeters: 0, slopeDegrees: -4 },
        { xPixel: 20, yPixel: 0, val: -4, distanceMeters: 20, slopeDegrees: -4 },
      ],
      0,
      10
    );
    expect(group.children).toHaveLength(1);
    expect(group.children[0].className).toBe("Path");
  });

  it("uses white for the colorblind graph's zero-to-two-degree class", () => {
    const group = new paper.Group();
    drawSlopeBand(
      group,
      [
        { xPixel: 0, yPixel: 0, val: 1, distanceMeters: 0, slopeDegrees: 1 },
        { xPixel: 20, yPixel: 0, val: 1, distanceMeters: 20, slopeDegrees: 1 },
      ],
      0,
      10,
      Infinity,
      "colorblind"
    );

    const band = group.children[0] as paper.Path;
    expect(band.fillColor.toCSS(true)).toBe("#ffffff");
  });

  it("draws a one-pixel separator between slope rows using the given color", () => {
    const group = new paper.Group();
    drawSlopeSeparator(group, 4, 24, 10, new paper.Color("#616574"));

    expect(group.children).toHaveLength(1);
    const separator = group.children[0] as paper.Path;
    expect(separator.strokeWidth).toBe(1);
    expect(separator.strokeColor.toCSS(true)).toBe("#616574");
    expect([separator.firstSegment.point.x, separator.firstSegment.point.y]).toEqual([4, 10]);
    expect([separator.lastSegment.point.x, separator.lastSegment.point.y]).toEqual([24, 10]);
  });
});
