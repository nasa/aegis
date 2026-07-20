/**
 * layerFactory — creates OpenLayers layer objects from AEGIS sublayer definitions.
 *
 * This is a pure factory: given a sublayer descriptor and projection context,
 * it returns a configured OL layer. No map instance, no Redux, no side effects.
 *
 * Supports four sublayer types:
 *   - tile:        Raster TMS/XYZ via TileLayer + XYZ source
 *   - vector:      GeoJSON via VectorImageLayer (canvas-batched for performance)
 *   - vector-tile: PMTiles (MVT) via VectorTileLayer + PMTilesVectorSource
 *   - cog:         Cloud Optimized GeoTIFF via WebGLTileLayer + GeoTIFFSource
 */

import TileLayer from "ol/layer/Tile";
import VectorTileLayer from "ol/layer/VectorTile";
import WebGLTileLayer from "ol/layer/WebGLTile";
import { VectorImage as VectorImageLayer } from "ol/layer";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import GeoTIFFSource from "ol/source/GeoTIFF";
import GeoJSON from "ol/format/GeoJSON";
import TileGrid from "ol/tilegrid/TileGrid";
import type { Layer as OLLayer } from "ol/layer";
import type { Coordinate } from "ol/coordinate";
import { Style, Fill, Stroke, Text } from "ol/style";
import type { Feature } from "ol";
import type { Geometry } from "ol/geom";

import { buildLegacyResolutions } from "../parsers/leafletShim";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAYER_BASE_URL = "/static/missionFiles";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Everything the factory needs to create a layer. */
export interface LayerFactoryInput {
  sublayer: SublayerToDraw;
  missionId: number;
  /** Projection code for the view, e.g. "IAU2000:30166" or "EPSG:3857". */
  projCode: string;
  /** Per-sublayer visual controls from the preset. */
  style: MapSublayerStyle;
  /** Mission-level projection fields for building custom tile grids. */
  projConfig: TileGridConfig | null;
}

/** Subset of mission projection fields needed for tile grids. */
export interface TileGridConfig {
  projResUnitsPerPixel: number | null;
  projResZoomLevel: number | null;
  projOriginX: number | null;
  projOriginY: number | null;
  projBoundsMinX: number | null;
  projBoundsMinY: number | null;
  projBoundsMaxX: number | null;
  projBoundsMaxY: number | null;
}

// ---------------------------------------------------------------------------
// Main factory
// ---------------------------------------------------------------------------

/**
 * Create an OL layer from an AEGIS sublayer definition.
 * Returns null if the sublayer type is unknown.
 */
export function createOlLayer(input: LayerFactoryInput): OLLayer | null {
  switch (input.sublayer.type) {
    case "tile":
      return createTileLayer(input);
    case "vector":
      return createVectorLayer(input);
    case "vector-tile":
      return createPmtilesLayer(input);
    default:
      console.warn(`[layerFactory] Unknown sublayer type: ${input.sublayer.type}`);
      return null;
  }
}

/**
 * Create a COG (Cloud Optimized GeoTIFF) layer.
 * Separated from the main factory because COG sublayers are identified by
 * a path ending in `.tif` or `.tiff`, not by a dedicated `type` field.
 * The COG lives inside a folder under Layers/ (path = `<folder>/<file>.tif`).
 */
export function createCogLayer(input: LayerFactoryInput): WebGLTileLayer {
  const url = buildFullUrl(input.sublayer, input.missionId, "tile");

  return new WebGLTileLayer({
    source: new GeoTIFFSource({
      sources: [{ url }],
      projection: input.projCode,
      // Nearest-neighbor sampling: crisp square pixels when zoomed past the
      // raster's native resolution rather than an antialiased blur.
      interpolate: false,
    }),
    properties: {
      name: input.sublayer.name,
      uuid: input.sublayer.uuid,
      sublayerType: "cog",
    },
  });
}

// ---------------------------------------------------------------------------
// Per-type factories
// ---------------------------------------------------------------------------

function createTileLayer(input: LayerFactoryInput): TileLayer<XYZ> {
  const { sublayer, missionId, projCode, projConfig } = input;

  const url = buildTileUrl(sublayer, missionId);
  const tileGrid = buildTileGrid(sublayer, projConfig);

  // For TMS, use a tileUrlFunction that flips Y — the {-y} template doesn't
  // work with custom tile grids
  const isTms = sublayer.tileFormat === "tms";

  const sourceOpts: ConstructorParameters<typeof XYZ>[0] = {
    projection: projCode,
    crossOrigin: "anonymous",
    tileGrid: tileGrid ?? undefined,
    // Render raster tiles with nearest-neighbor sampling so that zooming past a
    // layer's native resolution shows crisp square pixels instead of a blurred,
    // antialiased image.
    interpolate: false,
  };

  if (sublayer.minNativeZoom != null) sourceOpts.minZoom = sublayer.minNativeZoom;
  if (sublayer.maxNativeZoom != null) sourceOpts.maxZoom = sublayer.maxNativeZoom;

  if (isTms && tileGrid) {
    // Manual URL function for TMS y-flip with custom tile grids
    sourceOpts.tileUrlFunction = (coord) => {
      const [z, x, y] = coord;
      const maxY = tileGrid.getFullTileRange(z)?.maxY ?? 0;
      const flippedY = maxY - y;
      return url
        .replace("{z}", String(z))
        .replace("{x}", String(x))
        .replace("{y}", String(flippedY));
    };
  } else if (isTms) {
    // Standard TMS flip for default tile grids
    sourceOpts.url = url.replace("{y}", "{-y}");
  } else {
    sourceOpts.url = url;
  }

  return new TileLayer({
    source: new XYZ(sourceOpts),
    properties: {
      name: sublayer.name,
      uuid: sublayer.uuid,
      sublayerType: "tile",
    },
  });
}

function createVectorLayer(input: LayerFactoryInput): VectorImageLayer {
  const { sublayer, missionId, projCode, style, projConfig } = input;

  const url = buildFullUrl(sublayer, missionId, "data");

  return new VectorImageLayer({
    source: new VectorSource({
      url,
      format: new GeoJSON({
        dataProjection: "EPSG:4326",
        featureProjection: projCode,
      }),
    }),
    style: buildVectorStyleFn(style, baseResolutionFromProjConfig(projConfig)),
    imageRatio: 1.5,
    // declutter is intentionally OFF for GeoJSON layers — it suppresses
    // entire features (stroke + fill) when their text labels overlap, which
    // makes dense contour layers invisible. Text labels use `overflow: true`
    // in the style function, so they render even outside their geometry and
    // don't need decluttering.
    declutter: false,
    properties: {
      name: sublayer.name,
      uuid: sublayer.uuid,
      sublayerType: "vector",
    },
  });
}

function createPmtilesLayer(input: LayerFactoryInput): VectorTileLayer {
  const { sublayer, missionId, projCode, projConfig, style } = input;

  const url = buildFullUrl(sublayer, missionId, "tile");
  const tileGrid = buildTileGrid(sublayer, projConfig);

  // For PMTiles, we set up the layer without a source initially.
  // The TileLayers behavior component will asynchronously resolve the
  // PMTiles metadata and attach the source. This avoids blocking render.
  return new VectorTileLayer({
    style: buildVectorStyleFn(style, baseResolutionFromProjConfig(projConfig)),
    declutter: false,
    properties: {
      name: sublayer.name,
      uuid: sublayer.uuid,
      sublayerType: "vector-tile",
      // Store config needed for async source setup
      _pmtilesUrl: url,
      _projCode: projCode,
      _tileGrid: tileGrid,
    },
  });
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

function buildTileUrl(sublayer: SublayerToDraw, missionId: number): string {
  const basePath = buildBasePath(sublayer, missionId);
  return `${basePath}/${sublayer.tilePattern}`;
}

function buildFullUrl(
  sublayer: SublayerToDraw,
  missionId: number,
  dataOrTile: "data" | "tile"
): string {
  if (isExternalPath(sublayer.path)) {
    if (dataOrTile === "tile") return `${sublayer.path}/${sublayer.tilePattern}`;
    return sublayer.path;
  }
  const subdir = dataOrTile === "tile" ? "Layers" : "Data";
  return `${LAYER_BASE_URL}/${missionId}/${subdir}/${sublayer.path}`;
}

function buildBasePath(sublayer: SublayerToDraw, missionId: number): string {
  if (isExternalPath(sublayer.path)) return sublayer.path;
  return `${LAYER_BASE_URL}/${missionId}/Layers/${sublayer.path}`;
}

function isExternalPath(path: string): boolean {
  return path?.startsWith("http://") || path?.startsWith("https://");
}

// ---------------------------------------------------------------------------
// Tile grid builder
// ---------------------------------------------------------------------------

/**
 * Resolution (map units per pixel) at zoom 0 for the mission projection.
 * Matches `buildLegacyResolutions`'s base: unitsPerPixel * 2^zoomLevel.
 * Returns undefined when the projection config lacks resolution data, in which
 * case zoom-based label gating is skipped.
 */
function baseResolutionFromProjConfig(projConfig: TileGridConfig | null): number | undefined {
  if (!projConfig?.projResUnitsPerPixel) return undefined;
  return projConfig.projResUnitsPerPixel * Math.pow(2, projConfig.projResZoomLevel ?? 0);
}

function buildTileGrid(sublayer: Sublayer, projConfig: TileGridConfig | null): TileGrid | null {
  if (!projConfig?.projResUnitsPerPixel) return null;

  const numZoomLevels = (sublayer.maxNativeZoom ?? 20) + 1;
  const resolutions = buildLegacyResolutions(
    projConfig.projResUnitsPerPixel,
    projConfig.projResZoomLevel ?? 0,
    numZoomLevels
  );

  let extent: [number, number, number, number] | undefined;
  if (
    projConfig.projBoundsMinX != null &&
    projConfig.projBoundsMinY != null &&
    projConfig.projBoundsMaxX != null &&
    projConfig.projBoundsMaxY != null
  ) {
    extent = [
      projConfig.projBoundsMinX,
      projConfig.projBoundsMinY,
      projConfig.projBoundsMaxX,
      projConfig.projBoundsMaxY,
    ];
  }

  const origin: Coordinate = [
    projConfig.projOriginX ?? (extent ? extent[0] : 0),
    projConfig.projOriginY ?? (extent ? extent[1] : 0),
  ];

  return new TileGrid({
    extent,
    origin,
    resolutions,
    tileSize: 256,
  });
}

// ---------------------------------------------------------------------------
// Vector style builder
// ---------------------------------------------------------------------------

/**
 * Build the OL style function for a vector / vector-tile sublayer.
 *
 * @param style          Per-sublayer visual controls from the preset.
 * @param baseResolution Resolution at zoom 0 (map units per pixel). Passed so the
 *                       style function can convert the current `resolution` into a
 *                       zoom level and honour `style.labelMinZoom`. When omitted,
 *                       labels are not zoom-gated (they follow `showLabels` only).
 */
export function buildVectorStyleFn(
  style: MapSublayerStyle,
  baseResolution?: number
): (feature: Feature<Geometry>, resolution: number) => Style {
  // Cache styles to avoid creating new Style/Stroke/Fill/Text objects per feature per frame.
  // Key: geomType + labelText + resolvedFillColor + style params that affect output.
  const styleCache: { [key: string]: Style } = {};

  return (feature: Feature<Geometry>, resolution: number) => {
    const geomType = feature.getGeometry()?.getType();

    // When zoomed out past labelMinZoom, suppress labels so dense layers (e.g.
    // contours) don't turn into an unreadable overlapping mess. zoom = log2(base
    // / resolution); larger resolution = further zoomed out = lower zoom.
    let labelsAllowedAtZoom = true;
    if (style.labelMinZoom != null && baseResolution && baseResolution > 0) {
      const zoom = Math.log2(baseResolution / resolution);
      labelsAllowedAtZoom = zoom >= style.labelMinZoom;
    }
    // Generic `label` lets any vector source opt into a per-feature label. Elevation/name
    // variants are kept for backward compatibility (contour PMTiles carry `elev`; delivered
    // contour GeoJSONs use `Contour`).
    const genericLabel = feature.get("label");
    const name = feature.get("name") || feature.get("NAME") || "";
    const elevation =
      feature.get("elevation") ??
      feature.get("ELEVATION") ??
      feature.get("elev") ??
      feature.get("Contour");

    // Labels are opt-out per sublayer (style.showLabels); undefined = show (legacy default).
    // Also gated by resolution so they thin out / disappear when zoomed far out.
    let labelText = "";
    if (style.showLabels !== false && labelsAllowedAtZoom) {
      const value = genericLabel ?? elevation ?? (name || null);
      if (value != null) labelText = String(value);
    }

    // Resolve fill color — supports "prop:<propertyName>" to read color
    // from each GeoJSON feature's properties (ported from Leaflet helper).
    let resolvedFillColor = style.fillColor;
    if (resolvedFillColor?.startsWith("prop:")) {
      const propName = resolvedFillColor.slice(5);
      resolvedFillColor = feature.get(propName) || style.color || "#3399CC";
    }

    // Build cache key from all values that affect the output style
    const cacheKey = `${geomType}|${labelText}|${resolvedFillColor}|${style.color}|${style.weight}|${style.isDashed}|${style.dashLen}|${style.fillOpacity}|${style.labelColor}|${style.labelStrokeColor}|${style.labelStrokeWidth}|${style.labelStrokeOpacity}`;

    if (!styleCache[cacheKey]) {
      let textStyle: Text | undefined;
      if (labelText) {
        textStyle = new Text({
          text: labelText,
          font: "12px Arial",
          fill: new Fill({ color: style.labelColor || style.color || "#333" }),
          stroke:
            (style.labelStrokeWidth ?? 3) > 0
              ? new Stroke({
                  color: withAlpha(
                    style.labelStrokeColor ?? "#ffffff",
                    style.labelStrokeOpacity ?? 0.85
                  ),
                  width: style.labelStrokeWidth ?? 3,
                })
              : undefined,
          placement: geomType === "LineString" ? "line" : "point",
          maxAngle: Math.PI / 4,
          overflow: true,
        });
      }

      styleCache[cacheKey] = new Style({
        stroke: new Stroke({
          color: style.color || "#3399CC",
          width: style.weight || 1,
          lineDash: style.isDashed ? [style.dashLen, style.dashLen] : undefined,
        }),
        fill:
          geomType === "Polygon" || geomType === "MultiPolygon"
            ? new Fill({
                color:
                  style.fillOpacity > 0
                    ? withAlpha(resolvedFillColor, style.fillOpacity)
                    : undefined,
              })
            : undefined,
        text: textStyle,
      });
    }

    return styleCache[cacheKey];
  };
}

/** Apply alpha to a CSS color string. */
export function withAlpha(color: string, alpha: number): string {
  if (!color || color === "none") return "rgba(0,0,0,0)";
  // If already rgba, replace the alpha
  if (color.startsWith("rgba")) {
    return color.replace(/[\d.]+\)$/, `${alpha})`);
  }
  // Convert hex to rgba — expand 3-char shorthand (#abc → #aabbcc)
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}
