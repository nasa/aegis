import { describe, it, expect, vi } from "vitest";
import TileGrid from "ol/tilegrid/TileGrid";
import {
  parseEsriVectorTileInfo,
  parseEsriPmtilesMetadata,
  buildTileGrid,
} from "components/interface/map/utils/parsers/esriPMTiles";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lod(level: number, resolution: number, scale = resolution * 1000): EsriLod {
  return { level, resolution, scale };
}

function makeInfo(overrides: Partial<EsriTileInfo> = {}): EsriTileInfo {
  return {
    rows: 512,
    cols: 512,
    origin: { x: -8388608, y: 8388608 },
    spatialReference: { wkid: 3857, latestWkid: 3857 },
    lods: [lod(0, 78271), lod(1, 39135), lod(2, 19567), lod(3, 9783), lod(4, 4891)],
    fullExtent: {
      xmin: -8388608,
      ymin: -8388608,
      xmax: 8388608,
      ymax: 8388608,
      spatialReference: { wkid: 3857 },
    },
    minLOD: 0,
    maxLOD: 4,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseEsriVectorTileInfo
// ---------------------------------------------------------------------------

describe("parseEsriVectorTileInfo", () => {
  it("returns resolutions in ascending LOD order, sliced by minLOD/maxLOD", () => {
    const config = parseEsriVectorTileInfo(makeInfo());
    expect(config.resolutions).toEqual([78271, 39135, 19567, 9783, 4891]);
    expect(config.minZoom).toBe(0);
    expect(config.maxZoom).toBe(4);
  });

  it("respects an explicit maxLodOverride and truncates resolutions", () => {
    const config = parseEsriVectorTileInfo(makeInfo(), 2);
    expect(config.resolutions).toEqual([78271, 39135, 19567]);
    expect(config.maxZoom).toBe(2);
    expect(config.minZoom).toBe(0);
  });

  it("derives minLOD/maxLOD from the lods array when info.minLOD/maxLOD are missing", () => {
    const info = makeInfo({ minLOD: undefined, maxLOD: undefined });
    const config = parseEsriVectorTileInfo(info);
    expect(config.minZoom).toBe(0);
    expect(config.maxZoom).toBe(4);
  });

  it("sorts unsorted lods entries before slicing", () => {
    const unsorted = makeInfo({
      lods: [lod(2, 19567), lod(0, 78271), lod(4, 4891), lod(1, 39135), lod(3, 9783)],
    });
    const config = parseEsriVectorTileInfo(unsorted);
    expect(config.resolutions).toEqual([78271, 39135, 19567, 9783, 4891]);
  });

  it("uses fullExtent when provided", () => {
    const config = parseEsriVectorTileInfo(makeInfo());
    expect(config.extent).toEqual([-8388608, -8388608, 8388608, 8388608]);
  });

  it("falls back to initialExtent when fullExtent is missing", () => {
    const config = parseEsriVectorTileInfo(
      makeInfo({
        fullExtent: undefined,
        initialExtent: {
          xmin: -100,
          ymin: -200,
          xmax: 100,
          ymax: 200,
          spatialReference: { wkid: 3857 },
        },
      })
    );
    expect(config.extent).toEqual([-100, -200, 100, 200]);
  });

  it("uses a sensible default extent when both fullExtent and initialExtent are missing", () => {
    const config = parseEsriVectorTileInfo(
      makeInfo({ fullExtent: undefined, initialExtent: undefined })
    );
    // The hard-coded ArcGIS world default
    expect(config.extent[0]).toBeCloseTo(-8388908.78653284);
    expect(config.extent[2]).toBeCloseTo(8388908.78653284);
  });

  it("propagates origin and tileSize and reads wkid (prefers wkid over latestWkid)", () => {
    const config = parseEsriVectorTileInfo(
      makeInfo({
        origin: { x: 1, y: 2 },
        rows: 1024,
        spatialReference: { wkid: 102100, latestWkid: 3857 },
      })
    );
    expect(config.origin).toEqual([1, 2]);
    expect(config.tileSize).toBe(1024);
    // The implementation reads `wkid` first; latestWkid is only the fallback.
    // (ESRI conventions usually prefer latestWkid — flag this as a possible bug
    // if compatibility with newer ArcGIS Server responses becomes an issue.)
    expect(config.wkid).toBe(102100);
  });

  it("falls back to latestWkid when wkid is missing (nullish-coalescing)", () => {
    const config = parseEsriVectorTileInfo(
      makeInfo({ spatialReference: { wkid: undefined as unknown as number, latestWkid: 3857 } })
    );
    expect(config.wkid).toBe(3857);
  });

  it("defaults tileSize to 512 when rows and cols are both missing", () => {
    const info = makeInfo();
    delete (info as Partial<EsriTileInfo>).rows;
    delete (info as Partial<EsriTileInfo>).cols;
    const config = parseEsriVectorTileInfo(info);
    expect(config.tileSize).toBe(512);
  });
});

// ---------------------------------------------------------------------------
// parseEsriPmtilesMetadata
// ---------------------------------------------------------------------------

describe("parseEsriPmtilesMetadata", () => {
  it("extracts esri_tile_info and parses it", () => {
    const config = parseEsriPmtilesMetadata({ esri_tile_info: makeInfo() });
    expect(config).not.toBeNull();
    expect(config!.resolutions).toHaveLength(5);
  });

  it("returns null and warns when esri_tile_info is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(parseEsriPmtilesMetadata({})).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns null and warns when lods is not an array", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(
      parseEsriPmtilesMetadata({ esri_tile_info: { ...makeInfo(), lods: "oops" as never } })
    ).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("forwards the maxLodOverride argument to parseEsriVectorTileInfo", () => {
    const config = parseEsriPmtilesMetadata({ esri_tile_info: makeInfo() }, 1);
    expect(config!.resolutions).toEqual([78271, 39135]);
  });
});

// ---------------------------------------------------------------------------
// buildEsriTileGrid
// ---------------------------------------------------------------------------

describe("buildEsriTileGrid", () => {
  it("returns a TileGrid instance from parsed ESRI config", () => {
    const config = parseEsriVectorTileInfo(makeInfo())!;
    const grid = buildTileGrid(config);
    expect(grid).toBeInstanceOf(TileGrid);
    // The grid correctly applies the parsed config — spot-check the extent
    // (which is the non-trivial mapping from ESRI fullExtent to OL extent array)
    expect(grid.getExtent()).toEqual(config.extent);
  });
});
