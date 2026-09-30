/**
 * Circle Layer — Generalized circle layer factory for OpenLayers
 *
 * Creates configurable circles with support for:
 * - Solid stroke
 * - Dashed stroke (configurable dash/gap sizes)
 * - Checkerboard (double alternating dashed rings)
 * - Label at configurable compass position (12 o'clock default)
 * - Label visibility controlled via a ref for React integration
 */

import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { Circle as CircleGeom, LineString } from "ol/geom";
import { fromCircle } from "ol/geom/Polygon";
import { Fill, Stroke, Style, Text } from "ol/style";
import type { StyleFunction } from "ol/style/Style";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Stroke mode for the circle ring */
type CircleStrokeMode = "solid" | "dashed" | "checkerboard";

/** Compass position for label placement relative to centre */
type LabelPosition =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

/** Options for the circle's stroke appearance */
interface CircleStrokeOptions {
  /** Stroke rendering mode (default "solid") */
  mode?: CircleStrokeMode;
  /** Circle line color (default "red") */
  color?: string;
  /** Circle line width in pixels (default 1.5) */
  width?: number;

  // --- Dashed mode ---
  /** Dash length in pixels (default 12). Only used when mode="dashed". */
  dashLength?: number;
  /** Gap length in pixels (default 8). Only used when mode="dashed". */
  gapLength?: number;
  /**
   * Phase offset (px) into the dash pattern (mode="dashed", non-adaptive).
   * Used to interleave a second alternating-colour ring so its dashes land
   * in the first ring's gaps instead of painting directly over them.
   */
  dashOffset?: number;
  /**
   * Target pixel width for one full dash+gap cycle (mode="dashed").
   * The actual segment count adapts to the current zoom/resolution so
   * dashes remain a consistent screen size.  Default 50.
   */
  dashSegmentPx?: number;
  /**
   * Dash to gap ratio for mode="dashed" when `dashSegments` is used.
   * 1 = equal dash/gap, 2 = dash twice as long as gap, 0.5 = gap twice dash.
   */
  dashGapRatio?: number;

  // --- Checkerboard dash ratio ---
  /**
   * Dash to gap ratio for mode="checkerboard".
   * 1 = equal dash/gap, 2 = dash twice as long as gap, 0.5 = gap twice dash.
   */
  checkerboardDashGapRatio?: number;

  // --- Checkerboard mode ---
  /** Inner ring color (default "black"). Only used when mode="checkerboard". */
  innerColor?: string;
  /** Outer ring color (default "black"). Only used when mode="checkerboard". */
  outerColor?: string;
  /** Inner ring thickness in px (default 5). Only used when mode="checkerboard". */
  innerThickness?: number;
  /** Outer ring thickness in px (default 5). Only used when mode="checkerboard". */
  outerThickness?: number;
  /**
   * Target pixel width for one full dash+gap cycle (mode="checkerboard").
   * The actual segment count adapts to the current zoom/resolution so
   * segments remain a consistent screen size.  Default 50.
   */
  segmentPx?: number;
}

/** Options for the label rendered at a compass position on the circle */
interface CircleLabelOptions {
  /** Label text. Defaults to "{radius}km" or "{radius}m" depending on size. */
  text?: string;
  /** CSS font string (default "bold 16px sans-serif") */
  font?: string;
  /** Label text fill color (default same as stroke color) */
  color?: string;
  /** Label text outline/stroke color (default "rgba(31,31,31,0.95)") */
  outlineColor?: string;
  /** Label text outline width (default 1) */
  outlineWidth?: number;
  /** Compass position around the circle (default "top") */
  position?: LabelPosition;
  /** Minimum zoom level at which the label appears (default 6) */
  minZoom?: number;
  /**
   * React ref controlling label visibility at runtime.
   * When provided the style function reads `.current` each frame.
   */
  showLabelsRef?: React.MutableRefObject<boolean>;
}

/** Full configuration for `createCircleLayer` */
interface CircleOptions {
  /** Stroke / ring appearance */
  stroke?: CircleStrokeOptions;
  /** Label appearance & placement */
  label?: CircleLabelOptions | null;
  /** Number of vertices used to approximate the circle (default 128) */
  circleVertices?: number;
  /** Layer z-index (default 8) */
  zIndex?: number;
  /** Whether the layer starts visible (default true) */
  visible?: boolean;
  /**
   * Base map resolution (units-per-pixel at zoom 0).
   * Required to convert resolution → zoom for label min-zoom logic.
   * If omitted, labels are always shown (no zoom gating).
   */
  baseResolution?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_VERTICES = 128;

/** Compute the label point offset from centre for a given compass position */
function labelOffset(position: LabelPosition, radius: number): [number, number] {
  const d = radius;
  const diag = d * Math.SQRT1_2;
  switch (position) {
    case "top":
      return [0, d];
    case "bottom":
      return [0, -d];
    case "left":
      return [-d, 0];
    case "right":
      return [d, 0];
    case "top-left":
      return [-diag, diag];
    case "top-right":
      return [diag, diag];
    case "bottom-left":
      return [-diag, -diag];
    case "bottom-right":
      return [diag, -diag];
  }
}

/** Auto-generate a human-readable distance label */
function defaultLabelText(radiusMeters: number): string {
  if (radiusMeters >= 1000) {
    const km = radiusMeters / 1000;
    return Number.isInteger(km) ? `${km}km` : `${km.toFixed(1)}km`;
  }
  return `${Math.round(radiusMeters)}m`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a VectorLayer containing a circle with optional label.
 *
 * Supports three stroke modes:
 *  • **solid** – single stroke line
 *  • **dashed** – single dashed line with configurable dash/gap sizes
 *  • **checkerboard** – dual concentric dashed rings offset to alternate
 *
 * @param center        Projected map coordinate `[x, y]`
 * @param radiusMeters  Circle radius in map units (meters)
 * @param options       Visual & behavioral configuration
 * @returns             A ready-to-add `VectorLayer`
 */
export function createCircleLayer(
  center: [number, number],
  radiusMeters: number,
  options?: CircleOptions
): VectorLayer<VectorSource> {
  const strokeOpts = options?.stroke ?? {};
  const labelOpts = options?.label;
  const vertices = options?.circleVertices ?? DEFAULT_VERTICES;
  const zIndex = options?.zIndex ?? 8;
  const visible = options?.visible ?? true;
  const baseResolution = options?.baseResolution;
  const mode: CircleStrokeMode = strokeOpts.mode ?? "solid";

  const source = new VectorSource();

  // ------------------------------------------------------------------
  // Build circle ring feature(s)
  // ------------------------------------------------------------------
  if (mode === "checkerboard") {
    // Checkerboard uses angular arc segments so inner/outer rings align
    // radially by construction — no lineDash offset tricks needed.
    const innerColor = strokeOpts.innerColor ?? strokeOpts.color ?? "black";
    const outerColor = strokeOpts.outerColor ?? strokeOpts.color ?? "black";
    const innerThickness = strokeOpts.innerThickness ?? strokeOpts.width ?? 5;
    const outerThickness = strokeOpts.outerThickness ?? strokeOpts.width ?? 5;
    const segmentPx = strokeOpts.segmentPx ?? 50;
    const ratio = Math.max(0.1, strokeOpts.checkerboardDashGapRatio ?? 1);
    const MIN_SEGMENTS = 4;
    const MAX_SEGMENTS = 200;

    const checkerGeom = fromCircle(new CircleGeom(center, radiusMeters), vertices);
    const checkerRingLine = new LineString(checkerGeom.getCoordinates()[0]);
    const checkerFeature = new Feature({ geometry: checkerRingLine });

    let cachedResKey = -1;
    let cachedStyles: Style[] = [];

    /** Build a LineString arc from startAngle→endAngle at the given radius */
    const makeArc = (r: number, startAngle: number, endAngle: number, nPts: number): LineString => {
      const coords: [number, number][] = [];
      const span = endAngle - startAngle;
      for (let i = 0; i <= nPts; i++) {
        const a = startAngle + (span * i) / nPts;
        coords.push([center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)]);
      }
      return new LineString(coords);
    };

    const checkerFn: StyleFunction = (_feat, resolution) => {
      const resKey = Math.round(resolution * 1e4);
      if (resKey !== cachedResKey) {
        cachedResKey = resKey;

        const innerR = radiusMeters - (innerThickness / 2) * resolution;
        const outerR = radiusMeters + (outerThickness / 2) * resolution;

        // Full-circle backgrounds (white behind the coloured arcs)
        const innerFullPoly = fromCircle(new CircleGeom(center, Math.max(innerR, 1)), vertices * 2);
        const innerFullLine = new LineString(innerFullPoly.getCoordinates()[0]);
        const outerFullPoly = fromCircle(new CircleGeom(center, Math.max(outerR, 1)), vertices * 2);
        const outerFullLine = new LineString(outerFullPoly.getCoordinates()[0]);

        // Derive segment count from circumference in pixels so dashes
        // maintain a consistent screen size regardless of zoom.
        const outerCircumPx = (2 * Math.PI * outerR) / resolution;
        const segments = Math.max(
          MIN_SEGMENTS,
          Math.min(MAX_SEGMENTS, Math.round(outerCircumPx / segmentPx))
        );

        // Angular layout — every sector spans sectorAngle radians.
        // The "dash" portion occupies ratio/(ratio+1) of the sector,
        // the "gap" portion occupies 1/(ratio+1).
        const sectorAngle = (2 * Math.PI) / segments;
        const dashAngle = (sectorAngle * ratio) / (ratio + 1);
        const gapAngle = sectorAngle - dashAngle;

        // Points per arc proportional to arc span (min 4 for smoothness)
        const ptsPerDash = Math.max(4, Math.ceil((vertices * 2 * dashAngle) / (2 * Math.PI)));
        const ptsPerGap = Math.max(4, Math.ceil((vertices * 2 * gapAngle) / (2 * Math.PI)));

        const outerStroke = new Stroke({ color: outerColor, width: outerThickness });
        const innerStroke = new Stroke({ color: innerColor, width: innerThickness });

        cachedStyles = [
          // White backgrounds
          new Style({
            geometry: outerFullLine,
            stroke: new Stroke({ color: "white", width: outerThickness }),
          }),
          new Style({
            geometry: innerFullLine,
            stroke: new Stroke({ color: "white", width: innerThickness }),
          }),
        ];

        for (let i = 0; i < segments; i++) {
          const segStart = i * sectorAngle;
          // Outer: coloured arc in the "dash" portion of each sector
          cachedStyles.push(
            new Style({
              geometry: makeArc(outerR, segStart, segStart + dashAngle, ptsPerDash),
              stroke: outerStroke,
            })
          );
          // Inner: coloured arc in the "gap" portion (where outer is blank)
          cachedStyles.push(
            new Style({
              geometry: makeArc(innerR, segStart + dashAngle, segStart + sectorAngle, ptsPerGap),
              stroke: innerStroke,
            })
          );
        }
      }
      return cachedStyles;
    };

    checkerFeature.setStyle(checkerFn);
    source.addFeature(checkerFeature);
  } else {
    // Solid or dashed — single LineString ring
    const circleGeom = fromCircle(new CircleGeom(center, radiusMeters), vertices);
    const ringLine = new LineString(circleGeom.getCoordinates()[0]);
    const ringFeature = new Feature({ geometry: ringLine });

    const strokeColor = strokeOpts.color ?? "red";
    const strokeWidth = strokeOpts.width ?? 1.5;
    if (mode === "dashed" && strokeOpts.dashSegmentPx && strokeOpts.dashSegmentPx > 0) {
      const dashSegmentPx = strokeOpts.dashSegmentPx;
      const dashGapRatio = Math.max(0.1, strokeOpts.dashGapRatio ?? 1);
      let cachedResKey = -1;
      let cachedStyle: Style | undefined;

      const dashedFn: StyleFunction = (_feat, resolution) => {
        const resKey = Math.round(resolution * 1e4);
        if (resKey !== cachedResKey) {
          cachedResKey = resKey;
          const circumPx = (2 * Math.PI * radiusMeters) / resolution;
          // Derive segment count from screen-space circumference
          const segments = Math.max(4, Math.min(200, Math.round(circumPx / dashSegmentPx)));
          const cyclePx = Math.max(2, circumPx / segments);
          const gapPx = Math.max(1, cyclePx / (dashGapRatio + 1));
          const dashPx = Math.max(1, cyclePx - gapPx);
          cachedStyle = new Style({
            stroke: new Stroke({
              color: strokeColor,
              width: strokeWidth,
              lineDash: [dashPx, gapPx],
            }),
          });
        }

        return cachedStyle as Style;
      };

      ringFeature.setStyle(dashedFn);
    } else {
      const strokeStyle: ConstructorParameters<typeof Stroke>[0] = {
        color: strokeColor,
        width: strokeWidth,
      };

      if (mode === "dashed") {
        strokeStyle.lineDash = [strokeOpts.dashLength ?? 12, strokeOpts.gapLength ?? 8];
        if (strokeOpts.dashOffset != null) {
          strokeStyle.lineDashOffset = strokeOpts.dashOffset;
        }
      }

      ringFeature.setStyle(
        new Style({
          stroke: new Stroke(strokeStyle),
        })
      );
    }

    source.addFeature(ringFeature);
  }

  // ------------------------------------------------------------------
  // Build label feature (if label options provided or defaults desired)
  // ------------------------------------------------------------------
  if (labelOpts !== null) {
    const lbl = labelOpts ?? {};
    const pos = lbl.position ?? "top";
    const [dx, dy] = labelOffset(pos, radiusMeters);
    const labelPoint = new Point([center[0] + dx, center[1] + dy]);
    const labelFeature = new Feature({ geometry: labelPoint });

    const labelText = lbl.text ?? defaultLabelText(radiusMeters);
    const labelFont = lbl.font ?? "bold 16px sans-serif";
    const labelColor = lbl.color ?? strokeOpts.color ?? "red";
    const labelOutlineColor = lbl.outlineColor ?? "rgba(31,31,31,0.95)";
    const labelOutlineWidth = lbl.outlineWidth ?? 1;
    const labelMinZoom = lbl.minZoom ?? 6;
    const showLabelsRef = lbl.showLabelsRef;

    // Text baseline depends on position so the label sits outside the ring
    let textBaseline: CanvasTextBaseline = "bottom";
    let textAlign: CanvasTextAlign = "center";
    if (pos === "bottom" || pos === "bottom-left" || pos === "bottom-right") {
      textBaseline = "top";
    }
    if (pos === "left" || pos === "top-left" || pos === "bottom-left") {
      textAlign = "right";
    } else if (pos === "right" || pos === "top-right" || pos === "bottom-right") {
      textAlign = "left";
    }

    const labelStyleFn: StyleFunction = (_feat, resolution) => {
      // Ref-based visibility toggle (for React state binding)
      if (showLabelsRef && !showLabelsRef.current) return undefined as unknown as Style;

      // Zoom gating
      if (baseResolution) {
        const zoom = Math.log2(baseResolution / resolution);
        if (zoom < labelMinZoom) return undefined as unknown as Style;
      }

      return new Style({
        text: new Text({
          text: labelText,
          font: labelFont,
          textAlign,
          textBaseline,
          offsetY: 0,
          fill: new Fill({ color: labelColor }),
          stroke: new Stroke({ color: labelOutlineColor, width: labelOutlineWidth }),
          padding: [4, 6, 4, 6],
        }),
      });
    };

    labelFeature.setStyle(labelStyleFn);
    source.addFeature(labelFeature);
  }

  return new VectorLayer({
    source,
    zIndex,
    visible,
  });
}
