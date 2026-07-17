/**
 * Tests for `utils/projection/tilemapResource.ts` —
 *   - `parseTilemapResourceXml()`
 *   - `buildTilemapResourceUrl()`
 *
 * `fetchTilemapResource()` is not unit-tested here — it just wraps `fetch`
 * and delegates to `parseTilemapResourceXml`.
 */

import { describe, it, expect, vi } from "vitest";
import {
  parseTilemapResourceXml,
  buildTilemapResourceUrl,
} from "components/interface/map/utils/parsers/tilemapResource";

// ---------------------------------------------------------------------------
// Sample XML fixtures
// ---------------------------------------------------------------------------

const FULL_XML = `<?xml version="1.0" encoding="utf-8"?>
<TileMap version="1.0.0" tilemapservice="http://tms.osgeo.org/1.0.0">
  <Title>NAC South Pole Mosaic</Title>
  <Abstract></Abstract>
  <SRS>IAU2000:30166</SRS>
  <BoundingBox minx="-100000" miny="-100000" maxx="100000" maxy="100000"/>
  <Origin x="-100000" y="-100000"/>
  <TileFormat width="256" height="256" mime-type="image/png" extension="png"/>
  <TileSets profile="raster">
    <TileSet href="0" units-per-pixel="800" order="0"/>
    <TileSet href="1" units-per-pixel="400" order="1"/>
    <TileSet href="2" units-per-pixel="200" order="2"/>
    <TileSet href="3" units-per-pixel="100" order="3"/>
  </TileSets>
</TileMap>`;

const MERCATOR_XML = `<?xml version="1.0" encoding="utf-8"?>
<TileMap>
  <Title>Earth Mercator</Title>
  <SRS>EPSG:3857</SRS>
  <BoundingBox minx="-20037508" miny="-20037508" maxx="20037508" maxy="20037508"/>
  <Origin x="-20037508" y="-20037508"/>
  <TileFormat width="512" height="512" mime-type="image/jpeg" extension="jpg"/>
  <TileSets profile="mercator">
    <TileSet href="3" units-per-pixel="4889.0" order="3"/>
    <TileSet href="5" units-per-pixel="1222.2" order="5"/>
  </TileSets>
</TileMap>`;

const MINIMAL_XML = `<?xml version="1.0"?>
<TileMap>
  <TileSets>
  </TileSets>
</TileMap>`;

// ---------------------------------------------------------------------------
// parseTilemapResourceXml
// ---------------------------------------------------------------------------

describe("parseTilemapResourceXml", () => {
  it("parses title, SRS, bounding box, origin, and tile format", () => {
    const meta = parseTilemapResourceXml(FULL_XML)!;
    expect(meta.title).toBe("NAC South Pole Mosaic");
    expect(meta.srs).toBe("IAU2000:30166");
    expect(meta.boundingBox).toEqual({
      minX: -100000,
      minY: -100000,
      maxX: 100000,
      maxY: 100000,
    });
    expect(meta.origin).toEqual({ x: -100000, y: -100000 });
    expect(meta.tileFormat).toEqual({
      width: 256,
      height: 256,
      mimeType: "image/png",
      extension: "png",
    });
  });

  it("parses TileSet entries sorted ascending by zoom level and computes minZoom/maxZoom", () => {
    const meta = parseTilemapResourceXml(FULL_XML)!;
    expect(meta.reportedTileSets).toHaveLength(4);
    expect(meta.reportedTileSets.map((t) => t.zoom)).toEqual([0, 1, 2, 3]);
    expect(meta.reportedTileSets.map((t) => t.unitsPerPixel)).toEqual([800, 400, 200, 100]);
    // minZoom/maxZoom are derived from the sorted array boundaries
    expect(meta.minZoom).toBe(0);
    expect(meta.maxZoom).toBe(3);
  });

  it("recognizes profile=mercator (else maps to 'raster')", () => {
    expect(parseTilemapResourceXml(MERCATOR_XML)!.profile).toBe("mercator");
    expect(parseTilemapResourceXml(FULL_XML)!.profile).toBe("raster");
  });

  it("handles non-contiguous zoom levels (e.g., zoom 3 + zoom 5)", () => {
    const meta = parseTilemapResourceXml(MERCATOR_XML)!;
    expect(meta.minZoom).toBe(3);
    expect(meta.maxZoom).toBe(5);
    expect(meta.reportedTileSets.map((t) => t.zoom)).toEqual([3, 5]);
  });

  it("handles missing TileSet entries with default zoom range 0..0", () => {
    const meta = parseTilemapResourceXml(MINIMAL_XML)!;
    expect(meta.reportedTileSets).toEqual([]);
    expect(meta.minZoom).toBe(0);
    expect(meta.maxZoom).toBe(0);
    // Defaults from missing fields
    expect(meta.tileFormat).toEqual({
      width: 256,
      height: 256,
      mimeType: "image/png",
      extension: "png",
    });
  });

  it("returns null and warns for malformed XML", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const garbage = "<TileMap><Title>oops</TileMap>"; // unclosed tags
    const result = parseTilemapResourceXml(garbage);
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("defaults missing bounding box / origin attributes to 0", () => {
    const xml = `<TileMap><BoundingBox/><Origin/><TileSets/></TileMap>`;
    const meta = parseTilemapResourceXml(xml)!;
    expect(meta.boundingBox).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    expect(meta.origin).toEqual({ x: 0, y: 0 });
  });
});

// ---------------------------------------------------------------------------
// buildTilemapResourceUrl
// ---------------------------------------------------------------------------

describe("buildTilemapResourceUrl", () => {
  it("appends tilemapresource.xml to a relative layer path", () => {
    expect(buildTilemapResourceUrl("NAC_POLE", 22)).toBe(
      "/static/missionFiles/22/Layers/NAC_POLE/tilemapresource.xml"
    );
  });

  it("appends tilemapresource.xml to an external https URL", () => {
    expect(buildTilemapResourceUrl("https://example.com/tiles", 22)).toBe(
      "https://example.com/tiles/tilemapresource.xml"
    );
  });

  it("appends tilemapresource.xml to an external http URL", () => {
    expect(buildTilemapResourceUrl("http://example.com/tiles", 22)).toBe(
      "http://example.com/tiles/tilemapresource.xml"
    );
  });
});
