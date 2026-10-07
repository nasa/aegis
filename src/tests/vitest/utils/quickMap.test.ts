import { describe, expect, it } from "vitest";
import {
  QUICKMAP_URL_BUDGET,
  buildQuickMapLink,
  createQuickMapLinkState,
  createQuickMapRexPositionLinkState,
  hasQuickMapDistinctLineCoordinates,
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
  it("encodes the live QuickMap 3D state and geometry boundaries", () => {
    const { url, includedGeometryCount, omittedGeometryCount } = buildQuickMapLink(
      baseUrl,
      linkState
    );

    expect(url.searchParams.get("proj")).toBe("22");
    expect(url.searchParams.get("center")).toBe("180,-89.9");
    expect(url.searchParams.get("resolution")).toBe("5");
    expect(url.searchParams.get("stack")).toBe("66,3921");
    expect(url.searchParams.get("features")).toBe("180,-89.9|-180,-89.9,-179.9,-89.8");
    expect(includedGeometryCount).toBe(2);
    expect(omittedGeometryCount).toBe(0);
  });

  it("includes a timestamp when supplied", () => {
    const { url } = buildQuickMapLink(baseUrl, {
      ...linkState,
      time: "1971-02-05T00:00:00.000Z",
    });

    expect(url.searchParams.get("time")).toBe("1971-02-05T00:00:00.000Z");
  });

  it("includes a bounded playback range only when both ends are supplied", () => {
    const { url } = buildQuickMapLink(baseUrl, {
      ...linkState,
      startTime: "1971-02-05T00:00:00.000Z",
      stopTime: "1971-02-05T06:30:00.000Z",
    });

    expect(url.searchParams.get("startTime")).toBe("1971-02-05T00:00:00.000Z");
    expect(url.searchParams.get("stopTime")).toBe("1971-02-05T06:30:00.000Z");
  });

  it("does not send an incomplete playback range", () => {
    const { url } = buildQuickMapLink(baseUrl, {
      ...linkState,
      startTime: "1971-02-05T00:00:00.000Z",
    });

    expect(url.searchParams.has("startTime")).toBe(false);
    expect(url.searchParams.has("stopTime")).toBe(false);
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

    expect(url.searchParams.get("features")).toBe("10,-80,11,-80,10,-81,10,-80");
  });

  it("serializes QuickMap feature properties with the geometry", () => {
    const { url } = buildQuickMapLink(baseUrl, {
      ...linkState,
      geometries: [
        {
          type: "Point",
          coordinates: [10, -80],
          properties: { title: "Lander", "marker-color": "#ffffff" },
        },
      ],
    });

    expect(url.searchParams.get("features")).toBe(
      '10,-80@@{"properties":{"title":"Lander","marker-color":"#ffffff"}}'
    );
  });

  it("includes additional points before station and traverse geometry", () => {
    const state = createQuickMapLinkState({
      center: { lat: -89.9, lng: 180 },
      additionalPoints: [
        {
          location: { lat: -89.9, lng: 180 },
          properties: { title: "Lander", "marker-color": "#ffffff" },
        },
      ],
    });

    expect(state.geometries).toEqual([
      {
        type: "Point",
        coordinates: [180, -89.9],
        properties: { title: "Lander", "marker-color": "#ffffff" },
      },
    ]);
  });

  it("keeps EVA traverses separate and transfers each traverse color", () => {
    const state = createQuickMapLinkState({
      center: { lat: -89.9, lng: 180 },
      defaultTraverseColor: "#0000ff",
      traverses: [
        {
          uuid: "outbound",
          name: "Outbound",
          color: "#ff0000",
          path: [
            { lat: -89.9, lng: 180 },
            { lat: -89.91, lng: 179.9 },
          ],
        } as Traverse,
        {
          uuid: "return",
          name: "Return",
          path: [
            { lat: -89.91, lng: 179.9 },
            { lat: -89.92, lng: 179.8 },
          ],
        } as Traverse,
      ],
    });

    expect(state.geometries).toEqual([
      {
        type: "LineString",
        coordinates: [
          [180, -89.9],
          [179.9, -89.91],
        ],
        properties: { title: "Outbound", stroke: "#ff0000", "stroke-width": "3" },
      },
      {
        type: "LineString",
        coordinates: [
          [179.9, -89.91],
          [179.8, -89.92],
        ],
        properties: { title: "Return", stroke: "#0000ff", "stroke-width": "3" },
      },
    ]);
  });

  it("uses position type order to color REX POS circles and traverses", () => {
    const ev1: PosType = {
      uuid: "ev1",
      abbr: "1",
      name: "EV1",
      icon: "",
      pathColor: "#ff0000",
    };
    const ev2: PosType = {
      uuid: "ev2",
      abbr: "2",
      name: "EV2",
      icon: "",
      pathColor: "#ffffff",
    };
    const cart: PosType = {
      uuid: "cart",
      abbr: "C",
      name: "Cart",
      icon: "",
      pathColor: "#aaaaaa",
    };
    const rex = {
      posTypes: [ev1, ev2, cart],
      posEntries: [
        {
          uuid: "all-types",
          location: { lat: -89.9, lng: 100 },
          petSeconds: 20,
          posTypeUuids: [cart.uuid, ev2.uuid, ev1.uuid],
          createdAt: 20,
        },
        {
          uuid: "ev2-cart",
          location: { lat: -89.91, lng: 101 },
          petSeconds: 10,
          posTypeUuids: [cart.uuid, ev2.uuid],
          createdAt: 10,
        },
        {
          uuid: "cart-only",
          location: { lat: -89.92, lng: 102 },
          petSeconds: 30,
          posTypeUuids: [cart.uuid],
          createdAt: 30,
        },
      ],
    } as Rex;

    const state = createQuickMapRexPositionLinkState({
      rex,
      landerLocation: { lat: -89.89, lng: 99 },
    });

    expect(state).not.toBeNull();
    expect(state?.center).toEqual({ lat: -89.92, lng: 102 });
    expect(state?.geometries).toEqual([
      {
        type: "Point",
        coordinates: [99, -89.89],
        properties: { title: "Lander", "marker-color": "#ffffff" },
      },
      {
        type: "LineString",
        coordinates: [
          [101, -89.91],
          [100, -89.9],
        ],
        properties: { title: "EV2", stroke: "#ffffff", "stroke-width": "3" },
      },
      {
        type: "LineString",
        coordinates: [
          [101, -89.91],
          [100, -89.9],
          [102, -89.92],
        ],
        properties: { title: "Cart", stroke: "#aaaaaa", "stroke-width": "3" },
      },
      {
        type: "Point",
        coordinates: [101, -89.91],
        properties: { title: "EV2", "marker-symbol": "circle", "marker-color": "#ffffff" },
      },
      {
        type: "Point",
        coordinates: [100, -89.9],
        properties: { title: "EV1", "marker-symbol": "circle", "marker-color": "#ff0000" },
      },
      {
        type: "Point",
        coordinates: [102, -89.92],
        properties: { title: "Cart", "marker-symbol": "circle", "marker-color": "#aaaaaa" },
      },
    ]);
  });

  it("centers on the latest position in chronological PET order", () => {
    const posType: PosType = {
      uuid: "eva",
      abbr: "E",
      name: "EVA",
      icon: "",
      pathColor: "#ff0000",
    };
    const state = createQuickMapRexPositionLinkState({
      rex: {
        posTypes: [posType],
        posEntries: [
          {
            uuid: "later-created",
            location: { lat: -89.9, lng: 100 },
            petSeconds: 10,
            posTypeUuids: [posType.uuid],
            createdAt: 20,
          },
          {
            uuid: "later-pet",
            location: { lat: -89.91, lng: 101 },
            petSeconds: 20,
            posTypeUuids: [posType.uuid],
            createdAt: 10,
          },
        ],
      } as Rex,
      landerLocation: null,
    });

    expect(state?.center).toEqual({ lat: -89.91, lng: 101 });
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

  it("omits generated traverse paths with no distinct coordinates", () => {
    const state = createQuickMapLinkState({
      center: { lat: -89.9, lng: 180 },
      traverses: [
        {
          uuid: "stationary-traverse",
          name: "Stationary traverse",
          path: [
            { lat: -89.9, lng: 180 },
            { lat: -89.9, lng: 180 },
          ],
        } as Traverse,
      ],
    });

    expect(
      hasQuickMapDistinctLineCoordinates([
        [180, -89.9],
        [180, -89.9],
      ])
    ).toBe(false);
    expect(state.geometries).toEqual([]);
  });

  it("omits trailing geometry that exceeds the URL budget", () => {
    const { url, includedGeometryCount, omittedGeometryCount } = buildQuickMapLink(baseUrl, {
      ...linkState,
      geometries: [
        linkState.geometries[0],
        {
          type: "Point",
          coordinates: [-179.9, -89.8],
          properties: { description: "x".repeat(QUICKMAP_URL_BUDGET) },
        },
      ],
    });

    expect(url.searchParams.get("features")).toBe("180,-89.9");
    expect(includedGeometryCount).toBe(1);
    expect(omittedGeometryCount).toBe(1);
  });
});
