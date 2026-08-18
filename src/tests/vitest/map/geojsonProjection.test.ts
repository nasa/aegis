/**
 * Tests for `utils/parsers/geojsonProjection.ts` — the CRS-aware GeoJSON source-projection
 * resolver used by `layerFactory.createVectorLayer` (see
 * `docs/MS3_20260812_VECTOR_IMPORT_AUDIT.md`, "Legacy GeoJSON rendering compatibility").
 */

import { describe, it, expect } from "vitest";
import {
  classifyCrsName,
  isWhollyDegreeBounded,
  resolveGeoJSONDataProjection,
  UnsupportedGeoJSONProjectionError,
} from "components/interface/map/utils/parsers/geojsonProjection";

const NATIVE_PROJ_CODE = "IAU2000:30166";

function fcWithCrs(name: string, coordinates: [number, number]) {
  return {
    type: "FeatureCollection",
    crs: { type: "name", properties: { name } },
    features: [{ type: "Feature", geometry: { type: "Point", coordinates }, properties: {} }],
  };
}

function fcNoCrs(coordinates: [number, number]) {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "Point", coordinates }, properties: {} }],
  };
}

describe("classifyCrsName", () => {
  it("classifies EPSG:4326 as geographic", () => {
    expect(classifyCrsName("EPSG:4326")).toBe("geographic");
  });
  it("classifies urn:ogc:def:crs:EPSG::4326 as geographic", () => {
    expect(classifyCrsName("urn:ogc:def:crs:EPSG::4326")).toBe("geographic");
  });
  it("classifies OGC:CRS84 as geographic", () => {
    expect(classifyCrsName("OGC:CRS84")).toBe("geographic");
  });
  it("classifies ESRI:104903 as geographic (lunar geographic)", () => {
    expect(classifyCrsName("ESRI:104903")).toBe("geographic");
  });
  it("classifies ESRI:103878 as projected (lunar south-pole stereographic)", () => {
    expect(classifyCrsName("ESRI:103878")).toBe("projected");
  });
  it("returns null for an unsupported/unknown CRS name", () => {
    expect(classifyCrsName("ESRI:99999")).toBeNull();
    expect(classifyCrsName("EPSG:14326")).toBeNull();
  });
  it("returns null for empty/undefined input", () => {
    expect(classifyCrsName(null)).toBeNull();
    expect(classifyCrsName(undefined)).toBeNull();
    expect(classifyCrsName("")).toBeNull();
  });
});

describe("isWhollyDegreeBounded", () => {
  it("true for a single degree-bounded point", () => {
    expect(isWhollyDegreeBounded(fcNoCrs([33.5, -84.2]))).toBe(true);
  });
  it("false for a projected-meter point", () => {
    expect(isWhollyDegreeBounded(fcNoCrs([96019.89, 146938.31]))).toBe(false);
  });
  it("true for an empty FeatureCollection (vacuous)", () => {
    expect(isWhollyDegreeBounded({ type: "FeatureCollection", features: [] })).toBe(true);
  });
  it("handles LineString/Polygon/MultiPolygon nesting", () => {
    const line = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [10, 20],
          [30, 40],
        ],
      },
    };
    expect(isWhollyDegreeBounded(line)).toBe(true);
    const polygon = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [10, 20],
            [30, 40],
            [50, 60],
            [10, 20],
          ],
        ],
      },
    };
    expect(isWhollyDegreeBounded(polygon)).toBe(true);
    const multiPolygon = {
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [10, 20],
              [30, 40],
              [50, 60],
              [10, 20],
            ],
          ],
        ],
      },
    };
    expect(isWhollyDegreeBounded(multiPolygon)).toBe(true);
  });
  it("handles GeometryCollection", () => {
    const gc = {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [10, 20] },
        { type: "Point", coordinates: [500000, 600000] },
      ],
    };
    expect(isWhollyDegreeBounded(gc)).toBe(false);
  });
});

describe("resolveGeoJSONDataProjection", () => {
  it("uses EPSG:4326 for a recognized geographic crs member", () => {
    const doc = fcWithCrs("EPSG:4326", [33.5, -84.2]);
    expect(resolveGeoJSONDataProjection(doc, NATIVE_PROJ_CODE)).toBe("EPSG:4326");
  });

  it("uses the native proj code for ESRI:103878", () => {
    const doc = fcWithCrs("ESRI:103878", [96019.89, 146938.31]);
    expect(resolveGeoJSONDataProjection(doc, NATIVE_PROJ_CODE)).toBe(NATIVE_PROJ_CODE);
  });

  it("uses EPSG:4326 for ESRI:104903 (lunar geographic)", () => {
    const doc = fcWithCrs("ESRI:104903", [33.5, -84.2]);
    expect(resolveGeoJSONDataProjection(doc, NATIVE_PROJ_CODE)).toBe("EPSG:4326");
  });

  it("throws for an unsupported embedded crs name", () => {
    const doc = fcWithCrs("ESRI:99999", [1, 1]);
    expect(() => resolveGeoJSONDataProjection(doc, NATIVE_PROJ_CODE)).toThrow(
      UnsupportedGeoJSONProjectionError
    );
  });

  it("throws for a malformed embedded crs member", () => {
    const doc = { ...fcNoCrs([1, 1]), crs: { type: "name", properties: {} } };
    expect(() => resolveGeoJSONDataProjection(doc, NATIVE_PROJ_CODE)).toThrow(
      UnsupportedGeoJSONProjectionError
    );
  });

  it("falls back to bounds classification when no crs member is present (geographic)", () => {
    const doc = fcNoCrs([33.5, -84.2]);
    expect(resolveGeoJSONDataProjection(doc, NATIVE_PROJ_CODE)).toBe("EPSG:4326");
  });

  it("falls back to bounds classification when no crs member is present (projected)", () => {
    const doc = fcNoCrs([96019.89, 146938.31]);
    expect(resolveGeoJSONDataProjection(doc, NATIVE_PROJ_CODE)).toBe(NATIVE_PROJ_CODE);
  });

  it("throws for a malformed (non-object) document", () => {
    expect(() => resolveGeoJSONDataProjection(null, NATIVE_PROJ_CODE)).toThrow(
      UnsupportedGeoJSONProjectionError
    );
    expect(() => resolveGeoJSONDataProjection("not json", NATIVE_PROJ_CODE)).toThrow(
      UnsupportedGeoJSONProjectionError
    );
    expect(() => resolveGeoJSONDataProjection({}, NATIVE_PROJ_CODE)).toThrow(
      UnsupportedGeoJSONProjectionError
    );
  });

  it("throws for malformed or non-finite coordinates", () => {
    expect(() => resolveGeoJSONDataProjection(fcNoCrs([Number.NaN, 1]), NATIVE_PROJ_CODE)).toThrow(
      UnsupportedGeoJSONProjectionError
    );
    expect(() =>
      resolveGeoJSONDataProjection(fcNoCrs([1, Number.POSITIVE_INFINITY]), NATIVE_PROJ_CODE)
    ).toThrow(UnsupportedGeoJSONProjectionError);
  });
});
