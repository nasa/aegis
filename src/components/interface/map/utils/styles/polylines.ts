/**
 * Polyline Styles — functions for traverse, walkback, and measurement lines.
 *
 * Each builder returns an OL StyleFunction that renders the base line stroke
 * plus optional arrow decorators at configurable intervals.
 */

import { Style, Stroke, Fill, Icon, Text, Circle as CircleStyle } from "ol/style";
import { Point, type LineString } from "ol/geom";
import type { FeatureLike } from "ol/Feature";
import type { Coordinate } from "ol/coordinate";
import Color from "color";
import { range_bearing_from_xy } from "utils/surf-nav/orienteering";

// ---------------------------------------------------------------------------
// Chevron arrow SVG (inline data URI, cached)
// ---------------------------------------------------------------------------

function buildArrowDataUri(color: string, size: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <path d="M8 4l8 8-8 8" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

const arrowCache = new Map<string, string>();
function getArrowDataUri(color: string, size: number): string {
  const key = `${color}-${size}`;
  const cached = arrowCache.get(key);
  if (cached) return cached;
  const uri = buildArrowDataUri(color, size);
  arrowCache.set(key, uri);
  return uri;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function segmentAngle(a: Coordinate, b: Coordinate): number {
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

function segmentLength(a: Coordinate, b: Coordinate): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Push evenly-spaced chevron arrows along a single segment.
 *
 * `arrowRepeat` is the desired on-screen spacing in pixels; it is converted to
 * map units via the current `resolution` so a long segment gets multiple arrows
 * (production behaviour) while a short one still gets a single centred arrow.
 */
function pushSegmentArrows(
  styles: Style[],
  a: Coordinate,
  b: Coordinate,
  color: string,
  arrowSize: number,
  arrowRepeat: number,
  resolution: number
): void {
  const len = segmentLength(a, b);
  if (len < 1) return;
  const rotation = -segmentAngle(a, b);
  const arrowUri = getArrowDataUri(color, arrowSize);
  const spacingMapUnits = Math.max((arrowRepeat || 50) * resolution, 1);
  // Number of arrows to spread across the segment (at least one).
  const count = Math.max(1, Math.floor(len / spacingMapUnits));
  for (let k = 1; k <= count; k++) {
    const frac = k / (count + 1);
    const px = a[0] + (b[0] - a[0]) * frac;
    const py = a[1] + (b[1] - a[1]) * frac;
    styles.push(
      new Style({
        geometry: new Point([px, py]),
        image: new Icon({
          src: arrowUri,
          rotation,
          scale: 1,
          anchor: [0.5, 0.5],
          anchorXUnits: "fraction",
          anchorYUnits: "fraction",
        }),
      })
    );
  }
}

/** Lighten a color for selection highlighting */
export function lightenColor(colorStr: string, amount = 0.3): string {
  try {
    return Color(colorStr).lighten(amount).hex();
  } catch {
    return colorStr;
  }
}

// ---------------------------------------------------------------------------
// Traverse style
// ---------------------------------------------------------------------------

export interface TraverseStyleOptions {
  weight: number;
  selectedWeight: number;
  showArrows: boolean;
  showBearings: boolean;
  showDistances: boolean;
  arrowSize: number;
  arrowRepeat: number; // pixels between arrows
  bearingLabelFontSize: number;
  bearingLabelColor: string;
  distanceLabelFontSize: number;
  distanceLabelColor: string;
  /** Per-feature color resolver (read at call time, not bake time). */
  getColor: (feature: FeatureLike) => string;
  /** Per-feature selection resolver (read at call time, not bake time). */
  getIsSelected: (feature: FeatureLike) => boolean;
}

// Module-level cache of base line styles keyed by (color, weight, selectedWeight, isSelected).
// Without this, each render allocated 1–2 fresh Style/Stroke objects per feature per frame.
const baseStyleCache = new Map<string, Style[]>();

function getBaseLineStyles(
  color: string,
  weight: number,
  selectedWeight: number,
  isSelected: boolean
): Style[] {
  const key = `${color}|${weight}|${selectedWeight}|${isSelected ? 1 : 0}`;
  const cached = baseStyleCache.get(key);
  if (cached) return cached;

  const lineColor = isSelected ? lightenColor(color, 0.3) : color;
  const lineWidth = isSelected ? selectedWeight : weight;
  const styles: Style[] = [];
  if (isSelected && selectedWeight > 0) {
    styles.push(
      new Style({
        stroke: new Stroke({
          color: lightenColor(color, 0.5),
          width: selectedWeight + 4,
        }),
      })
    );
  }
  styles.push(new Style({ stroke: new Stroke({ color: lineColor, width: lineWidth }) }));
  baseStyleCache.set(key, styles);
  return styles;
}

export function buildTraverseStyleFunction(
  opts: TraverseStyleOptions
): (feature: FeatureLike, resolution: number) => Style[] {
  return (feature: FeatureLike, resolution: number): Style[] => {
    const color = opts.getColor(feature);
    const isSelected = opts.getIsSelected(feature);

    const styles: Style[] = [
      ...getBaseLineStyles(color, opts.weight, opts.selectedWeight, isSelected),
    ];

    const lineColor = isSelected ? lightenColor(color, 0.3) : color;

    // Arrow decorators, bearing labels, and distance labels (per segment).
    if (opts.showArrows || opts.showBearings || opts.showDistances) {
      const geom = feature.getGeometry() as LineString;
      if (!geom) return styles;
      const coords = geom.getCoordinates();

      // Geodesic per-segment values precomputed from lat/lng by TraverseLines,
      // so labels match the traverse info panel. Fall back to projected math.
      const segBearings = feature.get("segmentBearings") as number[] | undefined;
      const segDistances = feature.get("segmentDistances") as number[] | undefined;

      for (let i = 0; i < coords.length - 1; i++) {
        const a = coords[i];
        const b = coords[i + 1];
        const len = segmentLength(a, b);

        // Skip very short segments (< 1 meter)
        if (len < 1) continue;

        const midX = (a[0] + b[0]) / 2;
        const midY = (a[1] + b[1]) / 2;
        const angle = segmentAngle(a, b);

        // Chevron arrows spaced along the segment (multiple on long segments)
        if (opts.showArrows) {
          pushSegmentArrows(styles, a, b, lineColor, opts.arrowSize, opts.arrowRepeat, resolution);
        }

        // Bearing label on the line (at 15% of segment from start)
        if (opts.showBearings) {
          const bearing = segBearings?.[i] ?? range_bearing_from_xy(b[0], b[1], a[0], a[1]).bearing;
          const bearingFraction = 0.15;
          const bx = a[0] + (b[0] - a[0]) * bearingFraction;
          const by = a[1] + (b[1] - a[1]) * bearingFraction;

          // Calculate text rotation to align with the line, keep right-side up
          let textRotation = -angle;
          const normalizedAngle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          const isUpsideDown = normalizedAngle > Math.PI / 2 && normalizedAngle < (3 * Math.PI) / 2;

          const arrowChar = isUpsideDown ? "◄" : "►";
          if (isUpsideDown) textRotation = -angle + Math.PI;

          styles.push(
            new Style({
              geometry: new Point([bx, by]),
              text: new Text({
                text: `${arrowChar} ${Math.round(bearing)}°`,
                font: `bold ${opts.bearingLabelFontSize}px sans-serif`,
                fill: new Fill({ color: opts.bearingLabelColor }),
                stroke: new Stroke({ color: "#000000", width: 3 }),
                textAlign: "center",
                textBaseline: "middle",
                rotation: textRotation,
              }),
            })
          );
        }

        // Distance label to the right of the midpoint
        if (opts.showDistances) {
          const distMeters = segDistances?.[i] ?? len;
          const labelOffsetAngle = angle - Math.PI / 2;
          const labelOffsetDistance = 20;
          const labelOffsetX = Math.cos(labelOffsetAngle) * labelOffsetDistance;
          const labelOffsetY = -Math.sin(labelOffsetAngle) * labelOffsetDistance;

          styles.push(
            new Style({
              geometry: new Point([midX, midY]),
              text: new Text({
                text: `${Math.round(distMeters)}m`,
                font: `bold ${opts.distanceLabelFontSize}px sans-serif`,
                fill: new Fill({ color: opts.distanceLabelColor }),
                stroke: new Stroke({ color: "#000000", width: 3 }),
                offsetX: labelOffsetX,
                offsetY: labelOffsetY,
                textAlign: "center",
                textBaseline: "middle",
              }),
            })
          );
        }
      }
    }

    return styles;
  };
}

// ---------------------------------------------------------------------------
// Walkback style (dashed red)
// ---------------------------------------------------------------------------

export interface WalkbackStyleOptions {
  color?: string;
  weight?: number;
  dashPattern?: number[];
  /** Draw directional chevrons along the path (default true). */
  showArrows?: boolean;
  arrowSize?: number;
  arrowRepeat?: number; // pixels between arrows
}

export function buildWalkbackStyleFunction(
  opts: WalkbackStyleOptions = {}
): (feature: FeatureLike, resolution: number) => Style[] {
  const color = opts.color || "red";
  const weight = opts.weight || 3;
  const dash = opts.dashPattern || [5, 5];
  const showArrows = opts.showArrows ?? true;
  const arrowSize = opts.arrowSize || 15;
  const arrowRepeat = opts.arrowRepeat || 50;

  return (feature: FeatureLike, resolution: number): Style[] => {
    const styles: Style[] = [
      new Style({
        stroke: new Stroke({
          color,
          width: weight,
          lineDash: dash,
        }),
      }),
    ];

    // Directional chevrons spaced along each segment (matches traverse arrows).
    if (showArrows) {
      const geom = feature.getGeometry() as LineString;
      if (geom) {
        const coords = geom.getCoordinates();
        for (let i = 0; i < coords.length - 1; i++) {
          pushSegmentArrows(
            styles,
            coords[i],
            coords[i + 1],
            color,
            arrowSize,
            arrowRepeat,
            resolution
          );
        }
      }
    }

    return styles;
  };
}

// ---------------------------------------------------------------------------
// Measurement style (with arrows)
// ---------------------------------------------------------------------------

export interface MeasurementStyleOptions {
  color: string;
  weight?: number;
  arrowSize?: number;
  arrowRepeat?: number;
  /**
   * Resolve the geodesic distance (meters) of a segment from its projected
   * endpoints. Used while editing, when the precomputed `segmentDistances` are
   * not trustworthy (withheld from the mapper but left stale on the feature by
   * reconcile's property merge). Computing from the live coords keeps every
   * segment in sync with the elevation panel during a drag. Falling back to the
   * raw projected segment length instead would over-report on distorted
   * projections (e.g. Web Mercator inflates by ~sec(latitude)).
   */
  getSegmentDistanceMeters?: (a: Coordinate, b: Coordinate) => number;
  /** Geodesic bearing (degrees) fallback, mirroring getSegmentDistanceMeters. */
  getSegmentBearingDegrees?: (a: Coordinate, b: Coordinate) => number;
}

export function buildMeasurementStyleFunction(
  opts: MeasurementStyleOptions
): (feature: FeatureLike, resolution: number) => Style[] {
  const weight = opts.weight || 3;
  const arrowSize = opts.arrowSize || 18;
  const arrowRepeat = opts.arrowRepeat || 60;

  return (feature: FeatureLike, resolution: number): Style[] => {
    const styles: Style[] = [];

    // Base line
    styles.push(
      new Style({
        stroke: new Stroke({
          color: opts.color,
          width: weight,
        }),
      })
    );

    const geom = feature.getGeometry() as LineString;
    if (!geom) return styles;
    const coords = geom.getCoordinates();
    const editing = feature.get("editing") as boolean | undefined;

    // Persistent start/end pins while the line is in edit mode, so it's clear
    // the measurement can be edited (matches the legacy Leaflet affordance).
    if (editing && coords.length >= 2) {
      for (const pt of [coords[0], coords[coords.length - 1]]) {
        styles.push(
          new Style({
            geometry: new Point(pt),
            image: new CircleStyle({
              radius: 6,
              fill: new Fill({ color: opts.color }),
              stroke: new Stroke({ color: "#ffffff", width: 2 }),
            }),
            zIndex: 10,
          })
        );
      }
    }

    // Geodesic per-segment values precomputed by MeasurementLines so on-line
    // labels match the elevation/timeline panel. These are only trustworthy when
    // NOT editing: during an edit the mapper withholds them, but reconcile merges
    // properties so the stale pre-edit arrays linger on the feature. Reading them
    // then would freeze the labels of pre-existing segments (and mismatch the
    // live-updating elevation panel), so ignore them while editing and compute
    // per-segment values from the live coords via the geodesic resolvers below.
    const segBearings = editing
      ? undefined
      : (feature.get("segmentBearings") as number[] | undefined);
    const segDistances = editing
      ? undefined
      : (feature.get("segmentDistances") as number[] | undefined);

    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      const len = segmentLength(a, b);
      if (len < 1) continue;

      const midX = (a[0] + b[0]) / 2;
      const midY = (a[1] + b[1]) / 2;
      const angle = segmentAngle(a, b);

      // Directional chevrons spaced along the segment
      pushSegmentArrows(styles, a, b, opts.color, arrowSize, arrowRepeat, resolution);

      // Bearing label
      const bearing =
        segBearings?.[i] ??
        opts.getSegmentBearingDegrees?.(a, b) ??
        range_bearing_from_xy(b[0], b[1], a[0], a[1]).bearing;
      const bearingFraction = 0.15;
      const bx = a[0] + (b[0] - a[0]) * bearingFraction;
      const by = a[1] + (b[1] - a[1]) * bearingFraction;

      let textRotation = -angle;
      const normalizedAngle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const isUpsideDown = normalizedAngle > Math.PI / 2 && normalizedAngle < (3 * Math.PI) / 2;
      const arrowChar = isUpsideDown ? "◄" : "►";
      if (isUpsideDown) textRotation = -angle + Math.PI;

      styles.push(
        new Style({
          geometry: new Point([bx, by]),
          text: new Text({
            text: `${arrowChar} ${Math.round(bearing)}°`,
            font: "bold 11px sans-serif",
            fill: new Fill({ color: "#ffcc00" }),
            stroke: new Stroke({ color: "#000000", width: 3 }),
            textAlign: "center",
            textBaseline: "middle",
            rotation: textRotation,
          }),
        })
      );

      // Distance label offset to the right of the midpoint (geodesic meters)
      const distMeters = segDistances?.[i] ?? opts.getSegmentDistanceMeters?.(a, b) ?? len;
      const labelOffsetAngle = angle - Math.PI / 2;
      const labelOffsetX = Math.cos(labelOffsetAngle) * 20;
      const labelOffsetY = -Math.sin(labelOffsetAngle) * 20;

      styles.push(
        new Style({
          geometry: new Point([midX, midY]),
          text: new Text({
            text: `${Math.round(distMeters)}m`,
            font: "bold 12px sans-serif",
            fill: new Fill({ color: "#ffffff" }),
            stroke: new Stroke({ color: "#000000", width: 3 }),
            offsetX: labelOffsetX,
            offsetY: labelOffsetY,
            textAlign: "center",
            textBaseline: "middle",
          }),
        })
      );
    }

    return styles;
  };
}
