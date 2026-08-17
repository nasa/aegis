/**
 * layerFactory — creates OpenLayers layer objects from AEGIS sublayer definitions.
 *
 * This is a pure factory: given a sublayer descriptor and projection context,
 * it returns a configured OL layer. No map instance, no Redux, no side effects.
 *
 * Supports four sublayer types:
 *   - tile:        Raster TMS/XYZ via TileLayer + XYZ source
 *   - vector:      GeoJSON via VectorImageLayer, or VectorLayer for draggable labels
 *   - vector-tile: PMTiles (MVT) via VectorTileLayer + PMTilesVectorSource
 *   - cog:         Cloud Optimized GeoTIFF via WebGLTileLayer + GeoTIFFSource
 */

import TileLayer from "ol/layer/Tile";
import VectorTileLayer from "ol/layer/VectorTile";
import WebGLTileLayer from "ol/layer/WebGLTile";
import VectorLayer from "ol/layer/Vector";
import { VectorImage as VectorImageLayer } from "ol/layer";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import GeoTIFFSource from "ol/source/GeoTIFF";
import GeoJSON from "ol/format/GeoJSON";
import TileGrid from "ol/tilegrid/TileGrid";
import type { Layer as OLLayer } from "ol/layer";
import type { Coordinate } from "ol/coordinate";
import type { FeatureLoader } from "ol/featureloader";
import { Style, Fill, Stroke, Text } from "ol/style";
import Feature from "ol/Feature";
import type { Geometry, LineString, MultiLineString, MultiPolygon, Polygon } from "ol/geom";
import Point from "ol/geom/Point";

import { buildLegacyResolutions } from "../parsers/leafletShim";
import { resolveGeoJSONDataProjection } from "../parsers/geojsonProjection";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";
import { createGazetteerLabelStyle, getGazetteerLabel } from "../styles/gazetteerLabels";

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
      // Snap tiles in instead of the default opacity fade — matches the raster
      // tile layers and is cheaper to render.
      transition: 0,
    }),
    className: `ol-layer-${input.sublayer.uuid}`,
    // One overview level for blur-then-sharpen on pan/zoom, bounded by cacheSize.
    preload: 1,
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
    // Snap tiles in instead of OL's default 250ms opacity fade — cheaper on the
    // CPU/GPU and matches Leaflet's instant tile appearance. cacheSize is left at
    // the OL default (512) to keep memory bounded on low-end laptops.
    transition: 0,
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
    // Keep one overview level so pans/zooms upscale a blurry parent tile instead
    // of showing blank until the sharp tile arrives (Leaflet's blur-then-sharpen
    // behavior). preload:1 is bounded by cacheSize, unlike preload:Infinity.
    preload: 1,
    properties: {
      name: sublayer.name,
      uuid: sublayer.uuid,
      sublayerType: "tile",
    },
  });
}

function createVectorLayer(input: LayerFactoryInput): VectorImageLayer | VectorLayer {
  const { sublayer, missionId, projCode, style, projConfig } = input;

  const url = buildFullUrl(sublayer, missionId, "data");
  const isGazetteer = isGazetteerSublayer(sublayer);

  const source = new VectorSource({
    // `url` is kept (informational — getUrl() reflects it) but the actual fetch/parse
    // is done by the custom `loader`, which resolves a per-document data projection
    // before ol/format/GeoJSON transforms coordinates (see buildGeoJSONLoader).
    url,
    loader: buildGeoJSONLoader(url, projCode, (features) => {
      if (!isGazetteer && !isGazetteerFeatures(features)) {
        const thematicLabels = createThematicLabelFeatures(features);
        if (thematicLabels.length === 0) return;

        features.push(...thematicLabels);
        layer.set("movableLabels", true);
        layer.set("thematicLabels", true);
        return;
      }

      for (const feature of features) {
        const geometry = feature.getGeometry();
        if (geometry instanceof Point) {
          const name = feature.get("name");
          if (getGazetteerLabel(feature) == null && typeof name === "string") {
            feature.set("gazetteerLabel", name);
          }
          feature.set("originalCoordinates", [...geometry.getCoordinates()]);
        }
      }
      layer.set("movableLabels", true);
      layer.setStyle(createGazetteerLabelStyle(style));
    }),
  });

  const LayerClass = isGazetteer ? VectorLayer : VectorImageLayer;
  const layer = new LayerClass({
    source,
    style: isGazetteer
      ? createGazetteerLabelStyle(style)
      : buildVectorStyleFn(style, baseResolutionFromProjConfig(projConfig)),
    imageRatio: 1.5,
    // Declutter is intentionally OFF for every vector layer. For ordinary
    // GeoJSON layers it suppresses entire features (stroke + fill) when their
    // text labels overlap, which makes dense contour layers invisible; text
    // labels use `overflow: true` in the style function, so they render even
    // outside their geometry and don't need decluttering. Gazetteer labels are
    // draggable, so overlaps are resolved by the user — a decluttered-away
    // label is invisible and therefore impossible to grab. Gazetteer layers
    // still use VectorLayer (not VectorImageLayer) so feature hit detection is
    // synchronous against the live map frame used by Translate.
    declutter: false,
    properties: {
      name: sublayer.name,
      uuid: sublayer.uuid,
      sublayerType: "vector",
      movableLabels: isGazetteer,
    },
  });
  return layer;
}

/**
 * Build a `VectorSource` loader that fetches a GeoJSON document and resolves its
 * source coordinate space (`dataProjection`) per-document via
 * `resolveGeoJSONDataProjection` — see that module for the compatibility rule. This
 * replaces a hardcoded `dataProjection: "EPSG:4326"`, which mis-renders the small set
 * of legacy GeoJSON files that carry raw projected meter coordinates (see
 * `docs/MS3_20260812_VECTOR_IMPORT_AUDIT.md`).
 */
function buildGeoJSONLoader(
  url: string,
  projCode: string,
  onFeaturesLoaded?: (features: Feature<Geometry>[]) => void
): FeatureLoader {
  return function (this: VectorSource, _extent, _resolution, _projection, success, failure) {
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((json) => {
        let dataProjection: string;
        try {
          dataProjection = resolveGeoJSONDataProjection(json, projCode);
        } catch (error) {
          console.error(`[layerFactory] ${url}:`, error);
          this.removeLoadedExtent(_extent);
          failure?.();
          return;
        }
        const format = new GeoJSON({ dataProjection, featureProjection: projCode });
        const features = format.readFeatures(json) as Feature<Geometry>[];
        onFeaturesLoaded?.(features);
        this.addFeatures(features);
        success?.(features);
      })
      .catch((error) => {
        console.error(`[layerFactory] Failed to load GeoJSON ${url}:`, error);
        this.removeLoadedExtent(_extent);
        failure?.();
      });
  };
}

export function isGazetteerFeatures(features: Feature<Geometry>[]): boolean {
  return (
    features.length > 0 &&
    features.every(
      (feature) =>
        feature.getGeometry()?.getType() === "Point" && getGazetteerLabel(feature) != null
    )
  );
}

export function isGazetteerSublayer(sublayer: Pick<Sublayer, "name">): boolean {
  return /(?:^|[^a-z0-9])(?:gazetteer|nomenclature)(?:$|[^a-z0-9])/i.test(sublayer.name);
}

function getVectorLabel(feature: Feature<Geometry>): string | number | undefined {
  return (
    feature.get("label") ??
    feature.get("name") ??
    feature.get("NAME") ??
    feature.get("Unit") ??
    undefined
  );
}

function getRenderedVectorLabel(feature: Feature<Geometry>): string | number | undefined {
  return (
    feature.get("label") ??
    feature.get("elevation") ??
    feature.get("ELEVATION") ??
    feature.get("elev") ??
    feature.get("Contour") ??
    feature.get("name") ??
    feature.get("NAME") ??
    feature.get("Unit") ??
    undefined
  );
}

function getThematicLabelCoordinate(geometry: Geometry): Coordinate | undefined {
  switch (geometry.getType()) {
    case "Polygon":
      return (geometry as Polygon).getInteriorPoint().getCoordinates();
    case "MultiPolygon": {
      const polygons = (geometry as MultiPolygon).getPolygons();
      const largest = polygons.reduce(
        (selected, polygon) => (polygon.getArea() > selected.getArea() ? polygon : selected),
        polygons[0]
      );
      return largest?.getInteriorPoint().getCoordinates();
    }
    case "LineString":
      return (geometry as LineString).getCoordinateAt(0.5);
    case "MultiLineString": {
      const lines = (geometry as MultiLineString).getLineStrings();
      const longest = lines.reduce(
        (selected, line) => (line.getLength() > selected.getLength() ? line : selected),
        lines[0]
      );
      return longest?.getCoordinateAt(0.5);
    }
    default:
      return undefined;
  }
}

/** Build draggable label anchors for styled non-point GeoJSON features. */
export function createThematicLabelFeatures(features: Feature<Geometry>[]): Feature<Point>[] {
  return features.flatMap((feature, index) => {
    const geometry = feature.getGeometry();
    const label = getVectorLabel(feature);
    const sourceColor = feature.get("fillColor") ?? feature.get("color");
    if (!geometry || label == null || typeof sourceColor !== "string") return [];

    const coordinate = getThematicLabelCoordinate(geometry)?.slice(0, 2);
    if (!coordinate) return [];

    feature.set("hasMovableThematicLabel", true, true);
    const labelFeature = new Feature<Point>({
      geometry: new Point(coordinate),
      gazetteerLabel: String(label),
      originalCoordinates: [...coordinate],
      thematicLabel: true,
    });
    labelFeature.setId(`thematic-label-${feature.getId() ?? index}`);
    return [labelFeature];
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
  const thematicLabelStyle = createGazetteerLabelStyle(style);

  return (feature: Feature<Geometry>, resolution: number) => {
    if (feature.get("thematicLabel") === true) {
      return thematicLabelStyle(feature, resolution) as Style;
    }

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
    const genericLabel = getRenderedVectorLabel(feature);

    // Labels are opt-out per sublayer (style.showLabels); undefined = show (legacy default).
    // Also gated by resolution so they thin out / disappear when zoomed far out.
    let labelText = "";
    if (
      style.showLabels !== false &&
      labelsAllowedAtZoom &&
      feature.get("hasMovableThematicLabel") !== true
    ) {
      const value = genericLabel;
      if (value != null) labelText = String(value);
    }

    // Resolve fill color — supports "prop:<propertyName>" to read color
    // from each GeoJSON feature's properties (ported from Leaflet helper).
    let resolvedFillColor = style.fillColor;
    if (resolvedFillColor?.startsWith("prop:")) {
      const propName = resolvedFillColor.slice(5);
      resolvedFillColor = feature.get(propName) || style.color || "#3399CC";
    } else if (!resolvedFillColor || resolvedFillColor === "none") {
      const sourceColor = feature.get("fillColor") ?? feature.get("color");
      if (typeof sourceColor === "string") resolvedFillColor = sourceColor;
    }

    // Build cache key from all values that affect the output style
    const cacheKey = `${geomType}|${labelText}|${resolvedFillColor}|${style.color}|${style.weight}|${style.isDashed}|${style.dashLen}|${style.fillOpacity}|${style.labelColor}|${style.labelHaloColor}|${style.labelHaloWidth}|${style.labelHaloOpacity}`;

    if (!styleCache[cacheKey]) {
      let textStyle: Text | undefined;
      if (labelText) {
        const labelColor = style.labelColor ?? defaultSublayerStyle.labelColor;
        const labelHaloColor = style.labelHaloColor ?? defaultSublayerStyle.labelHaloColor;
        const labelHaloWidth = style.labelHaloWidth ?? defaultSublayerStyle.labelHaloWidth;
        const labelHaloOpacity = style.labelHaloOpacity ?? defaultSublayerStyle.labelHaloOpacity;

        textStyle = new Text({
          text: labelText,
          font: "12px Arial",
          fill: new Fill({ color: labelColor }),
          stroke:
            labelHaloWidth > 0
              ? new Stroke({
                  color: withAlpha(labelHaloColor, labelHaloOpacity),
                  width: labelHaloWidth,
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
          (geomType === "Polygon" || geomType === "MultiPolygon") && style.fillOpacity > 0
            ? new Fill({ color: withAlpha(resolvedFillColor, style.fillOpacity) })
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
  if (color.startsWith("rgb(")) {
    return color.replace(/^rgb\((.*)\)$/, `rgba($1,${alpha})`);
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
