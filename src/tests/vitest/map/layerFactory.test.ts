/**
 * Tests for `utils/layers/layerFactory.ts` — `createOlLayer`, `createCogLayer`,
 * and `buildVectorStyleFn`.
 *
 * These tests exercise the pure factory:  given a sublayer descriptor it
 * returns the right kind of OL layer with the right source URL, projection,
 * and `properties` (name / uuid / sublayerType). No real DOM/canvas required.
 */

import { describe, it, expect, vi } from "vitest";
import TileLayer from "ol/layer/Tile";
import VectorTileLayer from "ol/layer/VectorTile";
import WebGLTileLayer from "ol/layer/WebGLTile";
import { VectorImage as VectorImageLayer } from "ol/layer";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import { Point, LineString, Polygon } from "ol/geom";
import { Style } from "ol/style";
import {
  createOlLayer,
  createCogLayer,
  buildVectorStyleFn,
  withAlpha,
  type LayerFactoryInput,
  type TileGridConfig,
} from "components/interface/map/utils/layers/layerFactory";
import { generateBlankSublayer } from "store/storeUtils/sublayer";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";
import { registerTestProjections, LUNAR_PROJ_CODE } from "./helpers/olTestUtils";

registerTestProjections();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStyle(overrides: Partial<MapSublayerStyle> = {}): MapSublayerStyle {
  return {
    opacity: 1,
    contrast: 1,
    brightness: 1,
    saturation: 1,
    blendMode: "normal",
    color: "#3399CC",
    weight: 2,
    fillColor: "#3399CC",
    fillOpacity: 0.5,
    isDashed: false,
    dashLen: 4,
    altColor: "#FFFFFF",
    altOpacity: 1,
    ...overrides,
  };
}

function makeTimeInfo(): TimeLayerInfo {
  return {
    datetime: "2026-01-01T00:00:00.000Z",
    dirName: "2026-01-01",
    lowerBound: "2026-01-01T00:00:00.000Z",
    upperBound: "2026-01-15T00:00:00.000Z",
  };
}

function makeSublayerToDraw(overrides: Partial<Sublayer> = {}): SublayerToDraw {
  return { ...generateBlankSublayer(overrides), chosenTimeLayer: makeTimeInfo() };
}

function makeInput(overrides: Partial<LayerFactoryInput> = {}): LayerFactoryInput {
  return {
    sublayer: makeSublayerToDraw(),
    missionId: 42,
    projCode: LUNAR_PROJ_CODE,
    style: makeStyle(),
    projConfig: null,
    ...overrides,
  };
}

const PROJ_CONFIG_FULL: TileGridConfig = {
  projResUnitsPerPixel: 12800,
  projResZoomLevel: 0,
  projOriginX: -1000000,
  projOriginY: -1000000,
  projBoundsMinX: -1000000,
  projBoundsMinY: -1000000,
  projBoundsMaxX: 1000000,
  projBoundsMaxY: 1000000,
};

// ---------------------------------------------------------------------------
// createOlLayer — tile sublayers
// ---------------------------------------------------------------------------

describe("createOlLayer", () => {
  describe("tile sublayer", () => {
    it("creates a TileLayer with an XYZ source", () => {
      const input = makeInput({
        sublayer: makeSublayerToDraw({
          type: "tile",
          name: "Basemap",
          path: "basemap",
          tilePattern: "{z}/{x}/{y}.png",
          tileFormat: "xyz",
        }),
      });

      const layer = createOlLayer(input);
      expect(layer).toBeInstanceOf(TileLayer);
      const source = (layer as TileLayer<XYZ>).getSource();
      expect(source).toBeInstanceOf(XYZ);
    });

    it("sets layer properties (name, uuid, sublayerType)", () => {
      const sublayer = makeSublayerToDraw({
        type: "tile",
        name: "Basemap",
        path: "basemap",
        tilePattern: "{z}/{x}/{y}.png",
      });
      const layer = createOlLayer(makeInput({ sublayer }))!;

      expect(layer.get("name")).toBe("Basemap");
      expect(layer.get("uuid")).toBe(sublayer.uuid);
      expect(layer.get("sublayerType")).toBe("tile");
    });

    it("uses XYZ url with mission-relative path", () => {
      const layer = createOlLayer(
        makeInput({
          missionId: 42,
          sublayer: makeSublayerToDraw({
            type: "tile",
            path: "basemap",
            tilePattern: "{z}/{x}/{y}.png",
            tileFormat: "xyz",
          }),
        })
      ) as TileLayer<XYZ>;
      const urls = layer.getSource()!.getUrls();
      // XYZ source stores the URL template
      expect(urls).toBeTruthy();
      expect(urls!.some((u) => u.includes("/static/missionFiles/42/Layers/basemap/"))).toBe(true);
    });

    it("uses external URL as-is when path starts with http(s)", () => {
      const layer = createOlLayer(
        makeInput({
          sublayer: makeSublayerToDraw({
            type: "tile",
            path: "https://tiles.example.com",
            tilePattern: "{z}/{x}/{y}.png",
            tileFormat: "xyz",
          }),
        })
      ) as TileLayer<XYZ>;
      const urls = layer.getSource()!.getUrls();
      expect(urls!.some((u) => u.startsWith("https://tiles.example.com/"))).toBe(true);
    });

    it("applies TMS y-flip via standard {-y} substitution when no custom tile grid", () => {
      const layer = createOlLayer(
        makeInput({
          sublayer: makeSublayerToDraw({
            type: "tile",
            path: "tms",
            tilePattern: "{z}/{x}/{y}.png",
            tileFormat: "tms",
          }),
        })
      ) as TileLayer<XYZ>;
      const urls = layer.getSource()!.getUrls();
      // The {y} placeholder should have been replaced with {-y}
      expect(urls!.some((u) => u.includes("{-y}"))).toBe(true);
      expect(urls!.some((u) => u.endsWith("{z}/{x}/{y}.png"))).toBe(false);
    });

    it("applies TMS y-flip via tileUrlFunction when custom tile grid is present", () => {
      const layer = createOlLayer(
        makeInput({
          projConfig: PROJ_CONFIG_FULL,
          sublayer: makeSublayerToDraw({
            type: "tile",
            path: "tms",
            tilePattern: "{z}/{x}/{y}.png",
            tileFormat: "tms",
            maxNativeZoom: 5,
          }),
        })
      ) as TileLayer<XYZ>;

      const source = layer.getSource()!;
      // urls is null when a tileUrlFunction was set
      expect(source.getUrls()).toBeNull();

      // Probe the function — at z=2 the maxY should flip the y coord.
      const urlFn = source.getTileUrlFunction();
      const url = urlFn([2, 0, 0], 1, source.getProjection()!);
      expect(url).toContain("/2/0/");
      // y was flipped (not 0)
      expect(url).not.toMatch(/\/2\/0\/0\.png$/);
    });

    it("disables interpolation (nearest-neighbor square pixels when over-zoomed)", () => {
      const layer = createOlLayer(
        makeInput({
          sublayer: makeSublayerToDraw({
            type: "tile",
            path: "basemap",
            tilePattern: "{z}/{x}/{y}.png",
          }),
        })
      ) as TileLayer<XYZ>;
      expect(layer.getSource()!.getInterpolate()).toBe(false);
    });

    it("propagates min/maxNativeZoom to the source", () => {
      const layer = createOlLayer(
        makeInput({
          sublayer: makeSublayerToDraw({
            type: "tile",
            path: "z",
            tilePattern: "{z}/{x}/{y}.png",
            minNativeZoom: 3,
            maxNativeZoom: 8,
          }),
        })
      ) as TileLayer<XYZ>;
      const tileGrid = layer.getSource()!.getTileGrid()!;
      expect(tileGrid.getMinZoom()).toBe(3);
      expect(tileGrid.getMaxZoom()).toBe(8);
    });
  });

  // ---------------------------------------------------------------------------
  // createOlLayer — vector sublayers (GeoJSON)
  // ---------------------------------------------------------------------------

  describe("vector (GeoJSON) sublayer", () => {
    it("creates a VectorImageLayer with a VectorSource", () => {
      const layer = createOlLayer(
        makeInput({
          sublayer: makeSublayerToDraw({
            type: "vector",
            path: "contours.geojson",
            name: "Contours",
          }),
        })
      );
      expect(layer).toBeInstanceOf(VectorImageLayer);
      const source = (layer as VectorImageLayer).getSource();
      expect(source).toBeInstanceOf(VectorSource);
    });

    it("sets sublayerType=vector and name/uuid properties", () => {
      const sublayer = makeSublayerToDraw({
        type: "vector",
        path: "contours.geojson",
        name: "Contours",
      });
      const layer = createOlLayer(makeInput({ sublayer }))!;
      expect(layer.get("sublayerType")).toBe("vector");
      expect(layer.get("name")).toBe("Contours");
      expect(layer.get("uuid")).toBe(sublayer.uuid);
    });

    it("declutter is OFF (intentional — see factory docs)", () => {
      const layer = createOlLayer(
        makeInput({
          sublayer: makeSublayerToDraw({
            type: "vector",
            path: "contours.geojson",
          }),
        })
      ) as VectorImageLayer;
      expect(layer.getDeclutter()).toBeFalsy();
    });

    it("uses Data path for the source URL", () => {
      const layer = createOlLayer(
        makeInput({
          missionId: 42,
          sublayer: makeSublayerToDraw({
            type: "vector",
            path: "contours.geojson",
          }),
        })
      ) as VectorImageLayer;
      const url = layer.getSource()!.getUrl() as string;
      expect(url).toBe("/static/missionFiles/42/Data/contours.geojson");
    });

    it("uses external path as-is for vector sources", () => {
      const layer = createOlLayer(
        makeInput({
          sublayer: makeSublayerToDraw({
            type: "vector",
            path: "https://example.com/contours.geojson",
          }),
        })
      ) as VectorImageLayer;
      const url = layer.getSource()!.getUrl() as string;
      expect(url).toBe("https://example.com/contours.geojson");
    });
  });

  // ---------------------------------------------------------------------------
  // createOlLayer — vector-tile (PMTiles)
  // ---------------------------------------------------------------------------

  describe("vector-tile (PMTiles) sublayer", () => {
    it("creates a VectorTileLayer", () => {
      const layer = createOlLayer(
        makeInput({
          sublayer: makeSublayerToDraw({
            type: "vector-tile",
            path: "vt",
            tilePattern: "{z}/{x}/{y}.pbf",
          }),
        })
      );
      expect(layer).toBeInstanceOf(VectorTileLayer);
    });

    it("stores PMTiles deferred-init properties for async source attach", () => {
      const layer = createOlLayer(
        makeInput({
          missionId: 42,
          sublayer: makeSublayerToDraw({
            type: "vector-tile",
            path: "vt/contours.pmtiles",
            tilePattern: "",
          }),
        })
      )!;
      expect(layer.get("sublayerType")).toBe("vector-tile");
      expect(layer.get("_pmtilesUrl")).toBe("/static/missionFiles/42/Layers/vt/contours.pmtiles");
      expect(layer.get("_projCode")).toBe(LUNAR_PROJ_CODE);
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown type
  // ---------------------------------------------------------------------------

  it("returns null and warns for unknown sublayer type", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const layer = createOlLayer(
      makeInput({
        sublayer: makeSublayerToDraw({
          type: "mystery" as unknown as Sublayer["type"],
        }),
      })
    );
    expect(layer).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// createCogLayer
// ---------------------------------------------------------------------------

describe("createCogLayer", () => {
  it("creates a WebGLTileLayer with sublayerType=cog", () => {
    // Stub fetch so the GeoTIFF source's eager remote read doesn't spam stderr.
    const fetchStub = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise(() => undefined));
    try {
      const sublayer = makeSublayerToDraw({
        type: "tile",
        path: "elevation.tif",
        name: "Elevation",
      });
      const layer = createCogLayer(makeInput({ sublayer }));
      expect(layer).toBeInstanceOf(WebGLTileLayer);
      expect(layer.get("sublayerType")).toBe("cog");
      expect(layer.get("name")).toBe("Elevation");
      expect(layer.get("uuid")).toBe(sublayer.uuid);
      expect(layer.getSource()!.getInterpolate()).toBe(false);
      expect(layer.getClassName()).toBe(`ol-layer-${sublayer.uuid}`);
    } finally {
      fetchStub.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// buildVectorStyleFn
// ---------------------------------------------------------------------------

describe("buildVectorStyleFn", () => {
  it("returns a function that produces a Style for any geometry", () => {
    const fn = buildVectorStyleFn(makeStyle());
    const feature = new Feature(new Point([0, 0]));
    const style = fn(feature, 0);
    expect(style).toBeInstanceOf(Style);
  });

  it("uses style.color and style.weight for the stroke", () => {
    const fn = buildVectorStyleFn(makeStyle({ color: "#ff0000", weight: 5 }));
    const style = fn(
      new Feature(
        new LineString([
          [0, 0],
          [10, 10],
        ])
      ),
      0
    );
    const stroke = style.getStroke()!;
    expect(stroke.getColor()).toBe("#ff0000");
    expect(stroke.getWidth()).toBe(5);
  });

  it("applies dashed stroke when style.isDashed is true", () => {
    const fn = buildVectorStyleFn(makeStyle({ isDashed: true, dashLen: 6 }));
    const style = fn(
      new Feature(
        new LineString([
          [0, 0],
          [10, 10],
        ])
      ),
      0
    );
    expect(style.getStroke()!.getLineDash()).toEqual([6, 6]);
  });

  it("applies fill only for polygons", () => {
    const fn = buildVectorStyleFn(makeStyle({ fillColor: "#00ff00", fillOpacity: 0.5 }));
    const polyStyle = fn(
      new Feature(
        new Polygon([
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ])
      ),
      0
    );
    const lineStyle = fn(
      new Feature(
        new LineString([
          [0, 0],
          [10, 10],
        ])
      ),
      0
    );
    expect(polyStyle.getFill()).not.toBeNull();
    expect(lineStyle.getFill()).toBeNull();
  });

  it("converts hex fillColor to rgba with the configured fillOpacity", () => {
    const fn = buildVectorStyleFn(makeStyle({ fillColor: "#3399cc", fillOpacity: 0.25 }));
    const style = fn(
      new Feature(
        new Polygon([
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ])
      ),
      0
    );
    const fillColor = style.getFill()!.getColor() as string;
    expect(fillColor).toBe("rgba(51,153,204,0.25)");
  });

  it("resolves prop:<name> fillColor from feature properties", () => {
    const fn = buildVectorStyleFn(makeStyle({ fillColor: "prop:color", fillOpacity: 1 }));
    const feat = new Feature(
      new Polygon([
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ])
    );
    feat.set("color", "#abcdef");
    const style = fn(feat, 0);
    const fillColor = style.getFill()!.getColor() as string;
    expect(fillColor).toBe("rgba(171,205,239,1)");
  });

  it("renders a text label when feature has 'name' property", () => {
    const fn = buildVectorStyleFn(makeStyle());
    const feat = new Feature(new Point([0, 0]));
    feat.set("name", "Crater A");
    const text = fn(feat, 0).getText();
    expect(text).not.toBeNull();
    expect(text!.getText()).toBe("Crater A");
  });

  it("prefers 'elevation' label over 'name' when both are present", () => {
    const fn = buildVectorStyleFn(makeStyle());
    const feat = new Feature(new Point([0, 0]));
    feat.set("name", "ignored");
    feat.set("elevation", 1234);
    const text = fn(feat, 0).getText();
    expect(text!.getText()).toBe("1234");
  });

  it("renders no text when feature has no name and no elevation", () => {
    const fn = buildVectorStyleFn(makeStyle());
    const text = fn(new Feature(new Point([0, 0])), 0).getText();
    expect(text).toBeFalsy();
  });

  it("labels contour features from the 'elev' property", () => {
    const fn = buildVectorStyleFn(makeStyle());
    const feat = new Feature(new Point([0, 0]));
    feat.set("elev", 5800);
    expect(fn(feat, 0).getText()!.getText()).toBe("5800");
  });

  it("labels delivered contour GeoJSONs from the 'Contour' property", () => {
    const fn = buildVectorStyleFn(makeStyle());
    const feat = new Feature(new Point([0, 0]));
    feat.set("Contour", 6100);
    expect(fn(feat, 0).getText()!.getText()).toBe("6100");
  });

  it("prefers a generic 'label' property over elevation and name", () => {
    const fn = buildVectorStyleFn(makeStyle());
    const feat = new Feature(new Point([0, 0]));
    feat.set("name", "ignored");
    feat.set("elev", 5800);
    feat.set("label", "Rim");
    expect(fn(feat, 0).getText()!.getText()).toBe("Rim");
  });

  it("suppresses labels when style.showLabels is false", () => {
    const fn = buildVectorStyleFn(makeStyle({ showLabels: false }));
    const feat = new Feature(new Point([0, 0]));
    feat.set("elev", 5800);
    expect(fn(feat, 0).getText()).toBeFalsy();
  });

  it("still labels when style.showLabels is undefined (legacy default)", () => {
    const fn = buildVectorStyleFn(makeStyle({ showLabels: undefined }));
    const feat = new Feature(new Point([0, 0]));
    feat.set("elev", 5800);
    expect(fn(feat, 0).getText()!.getText()).toBe("5800");
  });

  it("uses shared defaults for label halo styling when preset fields are missing", () => {
    const fn = buildVectorStyleFn(makeStyle());
    const feat = new Feature(new Point([0, 0]));
    feat.set("name", "Crater A");

    const text = fn(feat, 0).getText()!;

    expect(text.getFill()!.getColor()).toBe(defaultSublayerStyle.labelColor);
    expect(text.getStroke()!.getColor()).toBe(
      withAlpha(defaultSublayerStyle.labelHaloColor, defaultSublayerStyle.labelHaloOpacity)
    );
    expect(text.getStroke()!.getWidth()).toBe(defaultSublayerStyle.labelHaloWidth);
  });

  it("uses 'line' placement for LineString labels and 'point' for others", () => {
    const fn = buildVectorStyleFn(makeStyle());
    const lineFeat = new Feature(
      new LineString([
        [0, 0],
        [10, 0],
      ])
    );
    lineFeat.set("name", "Path");
    const pointFeat = new Feature(new Point([0, 0]));
    pointFeat.set("name", "Spot");

    expect(fn(lineFeat, 0).getText()!.getPlacement()).toBe("line");
    expect(fn(pointFeat, 0).getText()!.getPlacement()).toBe("point");
  });
});
