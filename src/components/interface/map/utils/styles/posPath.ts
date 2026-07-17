/**
 * POS Path Styles — function for POS position entry path polylines.
 *
 * Reads per-feature `color` and `opacity` properties set by PosEntries behavior.
 * Renders a thin line with small arrow decorators.
 */

import { Style, Stroke, Icon } from "ol/style";
import { Point, type LineString } from "ol/geom";
import type { FeatureLike } from "ol/Feature";
import type { Coordinate } from "ol/coordinate";
import { withAlpha } from "../layers/layerFactory";

// ---------------------------------------------------------------------------
// Arrow data URI
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

// ---------------------------------------------------------------------------
// Style function
// ---------------------------------------------------------------------------

const ARROW_SIZE = 14;
const ARROW_REPEAT = 100; // pixels (approximate — measured in map units)
const DEFAULT_LINE_WEIGHT = 2;

/**
 * Returns an OL StyleFunction for POS path polylines.
 * Each feature is expected to have `color` and `opacity` properties.
 *
 * @param weight Stroke width (px) for the path line. Comes from the mode
 *   config's `pos.drawPathWeight`. Defaults to 2.
 * @param arrowSize Chevron icon size (px), rendered at scale 1 exactly like the
 *   traverse arrows (`pushSegmentArrows` in `polylines.ts`). Callers pass the
 *   mode's traverse `arrowSize` so the chevrons match the traverse lines.
 *   Defaults to `ARROW_SIZE`.
 */
export function buildPosPathStyleFunction(
  weight: number = DEFAULT_LINE_WEIGHT,
  arrowSize: number = ARROW_SIZE
) {
  // Cache the geometry-free base line style, keyed by its visual inputs. Arrow
  // decorators are recomputed per call since their geometries follow the path
  // coordinates.
  const baseLineCache = new Map<string, Style>();
  const getBaseLine = (color: string, opacity: number): Style => {
    const key = `${color}-${opacity}-${weight}`;
    const cached = baseLineCache.get(key);
    if (cached) return cached;
    const style = new Style({
      stroke: new Stroke({
        color: withAlpha(color, opacity),
        width: weight,
      }),
    });
    baseLineCache.set(key, style);
    return style;
  };

  return (feature: FeatureLike, resolution: number): Style[] => {
    const color = (feature.get("color") as string) || "#888";
    const opacity = (feature.get("opacity") as number) ?? 0.6;
    const geom = feature.getGeometry() as LineString;
    if (!geom) return [];

    const coords = geom.getCoordinates();

    const styles: Style[] = [];

    // Base line stroke with opacity applied to color
    styles.push(getBaseLine(color, opacity));

    const arrowUri = getArrowDataUri(color, arrowSize);
    const pushArrow = (x: number, y: number, angle: number): void => {
      styles.push(
        new Style({
          geometry: new Point([x, y]),
          image: new Icon({
            src: arrowUri,
            rotation: -angle,
            rotateWithView: true,
            opacity,
            scale: 1,
          }),
        })
      );
    };

    // Arrow decorators along the path
    const repeatPx = ARROW_REPEAT * resolution;
    let accumulated = 0;
    let arrowPlaced = false;

    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1];
      const b = coords[i];
      const len = segmentLength(a, b);
      accumulated += len;

      while (accumulated >= repeatPx) {
        accumulated -= repeatPx;
        // Place arrow at the position along this segment
        const t = 1 - accumulated / len;
        const x = a[0] + t * (b[0] - a[0]);
        const y = a[1] + t * (b[1] - a[1]);
        pushArrow(x, y, segmentAngle(a, b));
        arrowPlaced = true;
      }
    }

    // Guarantee at least one arrow per path — short segments (e.g. the 2-point
    // "latest" segment in Fade Past mode) never accumulate enough length to
    // cross the repeat threshold. Place a single arrow at the path midpoint so
    // arrows always appear wherever a line is drawn.
    if (!arrowPlaced) {
      const mid = geom.getCoordinateAt(0.5);
      // Find the segment containing the midpoint to orient the arrow.
      const totalLength = geom.getLength();
      let traversed = 0;
      let angle = 0;
      for (let i = 1; i < coords.length; i++) {
        const segLen = segmentLength(coords[i - 1], coords[i]);
        if (traversed + segLen >= totalLength / 2) {
          angle = segmentAngle(coords[i - 1], coords[i]);
          break;
        }
        traversed += segLen;
      }
      pushArrow(mid[0], mid[1], angle);
    }

    return styles;
  };
}
