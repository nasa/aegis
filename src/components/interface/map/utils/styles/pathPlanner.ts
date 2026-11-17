/**
 * Newton Path Planner styles: start/goal pins and midpoint markers drawn over the straight line (which uses the
 * Measure style) and the Newton A* path. Styles are cached per input.
 */

import { Style, Stroke, Fill, Text, Circle as CircleStyle } from "ol/style";
import { Point, type LineString } from "ol/geom";
import type { FeatureLike } from "ol/Feature";

const BLOCKED_COLOR = "#ff3b30";
/** An older path, kept until the new one is found. */
const STALE_COLOR = "rgba(160, 160, 160, 0.75)";
const STALE_CASING = "rgba(0, 0, 0, 0.35)";

const pinCache = new Map<string, Style>();

/** The line's first (start) or last (goal) vertex. */
const endPoint = (label: "S" | "G") => (feature: FeatureLike) => {
  const coords = (feature.getGeometry() as LineString | undefined)?.getCoordinates();
  if (!coords || coords.length < 2) return undefined;
  return new Point(label === "S" ? coords[0] : coords[coords.length - 1]);
};

/** A start ("S") or goal ("G") pin; red when Newton reports the point as blocked. */
function pinStyle(color: string, label: "S" | "G", blocked: boolean): Style {
  const key = `${color}|${label}|${blocked}`;
  let style = pinCache.get(key);
  if (!style) {
    style = new Style({
      geometry: endPoint(label),
      image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: blocked ? BLOCKED_COLOR : color }),
        stroke: new Stroke({ color: "#ffffff", width: 2 }),
      }),
      text: new Text({
        text: label,
        font: "bold 10px sans-serif",
        fill: new Fill({ color: "#000000" }),
      }),
      zIndex: 10,
    });
    pinCache.set(key, style);
  }
  return style;
}

/** A small marker on midpoint `index` (1-based vertex index); red when blocked. */
function midpointStyle(color: string, index: number, blocked: boolean): Style {
  const key = `${color}|m${index}|${blocked}`;
  let style = pinCache.get(key);
  if (!style) {
    style = new Style({
      geometry: (feature) => {
        const coords = (feature.getGeometry() as LineString | undefined)?.getCoordinates();
        return coords && index < coords.length - 1 ? new Point(coords[index]) : undefined;
      },
      image: new CircleStyle({
        radius: 5,
        fill: new Fill({ color: blocked ? BLOCKED_COLOR : color }),
        stroke: new Stroke({ color: "#ffffff", width: 2 }),
      }),
      zIndex: 9,
    });
    pinCache.set(key, style);
  }
  return style;
}

/**
 * Start and goal pins, and a marker on each midpoint. `vertexCount` is the line's vertex
 * count; `blockedKey` is the comma-joined blocked point indices, e.g. "0,2".
 */
export function pathPlanPinStyles(color: string, vertexCount: number, blockedKey: string): Style[] {
  const blocked = new Set(blockedKey ? blockedKey.split(",").map(Number) : []);
  const styles = [pinStyle(color, "S", blocked.has(0))];
  for (let i = 1; i < vertexCount - 1; i++) styles.push(midpointStyle(color, i, blocked.has(i)));
  styles.push(pinStyle(color, "G", vertexCount > 1 && blocked.has(vertexCount - 1)));
  return styles;
}

const newtonCache = new Map<string, Style[]>();

/** The Newton path: solid in the plan colour, greyed out when it is for older points. */
export function pathPlanNewtonStyle(feature: FeatureLike): Style[] {
  const color = (feature.get("color") as string) || "#ff8c42";
  const current = feature.get("current") !== false;
  const key = `${color}|${current}`;
  let styles = newtonCache.get(key);
  if (!styles) {
    styles = current
      ? [
          new Style({ stroke: new Stroke({ color: "rgba(0, 0, 0, 0.7)", width: 6 }) }),
          new Style({ stroke: new Stroke({ color, width: 3.5 }) }),
        ]
      : [
          new Style({ stroke: new Stroke({ color: STALE_CASING, width: 6 }) }),
          new Style({ stroke: new Stroke({ color: STALE_COLOR, width: 3.5, lineDash: [8, 6] }) }),
        ];
    newtonCache.set(key, styles);
  }
  return styles;
}
