import { describe, expect, it } from "vitest";
import {
  buildQuickMapLink,
  normalizeQuickMapLongitude,
  type QuickMapLinkState,
} from "utils/quickMap";

const baseUrl = "https://quickmap.example/";

const linkState: QuickMapLinkState = {
  center: { lat: -89.9, lng: 180 },
  resolutionMetersPerPixel: 5,
  layerIds: ["66", "3921"],
  geometries: [
    { type: "Point", coordinates: [180, -89.9] },
    {
      type: "LineString",
      coordinates: [
        [-180, -89.9],
        [-179.9, -89.8],
      ],
    },
  ],
};

describe("QuickMap URL adapter", () => {
  it("encodes the documented 3D state and geometry boundaries", () => {
    const { url, includedGeometryCount, omittedGeometryCount } = buildQuickMapLink(
      baseUrl,
      linkState
    );

    expect(url.searchParams.get("proj")).toBe("22");
    expect(url.searchParams.get("center")).toBe("180,-89.9");
    expect(url.searchParams.get("resolution")).toBe("5");
    expect(url.searchParams.get("stack")).toBe("66,3921");
    expect(url.searchParams.get("features")).toBe("180,-89.9|-180,-89.9;-179.9,-89.8");
    expect(includedGeometryCount).toBe(2);
    expect(omittedGeometryCount).toBe(0);
  });

  it("normalizes longitude at the antimeridian", () => {
    expect(normalizeQuickMapLongitude(540)).toBe(180);
    expect(normalizeQuickMapLongitude(-540)).toBe(-180);
  });

  it("closes polygon rings deliberately", () => {
    const { url } = buildQuickMapLink(baseUrl, {
      ...linkState,
      geometries: [
        {
          type: "Polygon",
          coordinates: [
            [10, -80],
            [11, -80],
            [10, -81],
          ],
        },
      ],
    });

    expect(url.searchParams.get("features")).toBe("10,-80;11,-80;10,-81;10,-80");
  });

  it("rejects malformed lines", () => {
    expect(() =>
      buildQuickMapLink(baseUrl, {
        ...linkState,
        geometries: [
          {
            type: "LineString",
            coordinates: [
              [10, -80],
              [10, -80],
            ],
          },
        ],
      })
    ).toThrow("QuickMap lines require at least two distinct points.");
  });

  it("omits trailing geometry that exceeds the URL budget", () => {
    const oneGeometryResult = buildQuickMapLink(baseUrl, {
      ...linkState,
      geometries: [linkState.geometries[0]],
    });
    const { url, includedGeometryCount, omittedGeometryCount } = buildQuickMapLink(
      baseUrl,
      linkState,
      { urlBudget: oneGeometryResult.url.toString().length }
    );

    expect(url.searchParams.get("features")).toBe("180,-89.9");
    expect(includedGeometryCount).toBe(1);
    expect(omittedGeometryCount).toBe(1);
  });
});
