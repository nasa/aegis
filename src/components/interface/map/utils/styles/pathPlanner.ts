/**
 * Newton Path Planner styles: start/goal pins drawn over the straight line (which uses the
 * Measure style) and the Newton A* path. Styles are cached per input.
 */

import { Style, Stroke, Fill, Text, Circle as CircleStyle } from "ol/style";
import { Point, type LineString } from "ol/geom";
import type { FeatureLike } from "ol/Feature";
import Color from "color";

const BLOCKED_COLOR = "#ff3b30";
const STALE_OPACITY = 0.4;

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

/** Start and goal pins; `blockedKey` is the comma-joined blocked indices, e.g. "1". */
export function pathPlanPinStyles(color: string, blockedKey: string): Style[] {
  const blocked = blockedKey ? blockedKey.split(",") : [];
  return [pinStyle(color, "S", blocked.includes("0")), pinStyle(color, "G", blocked.includes("1"))];
}

const newtonCache = new Map<string, Style[]>();

/** The Newton path: solid in the plan colour, dimmed when it is for older points. */
export function pathPlanNewtonStyle(feature: FeatureLike): Style[] {
  const color = (feature.get("color") as string) || "#ff8c42";
  const current = feature.get("current") !== false;
  const key = `${color}|${current}`;
  let styles = newtonCache.get(key);
  if (!styles) {
    const stroke = current ? color : Color(color).alpha(STALE_OPACITY).string();
    const casing = current ? "rgba(0, 0, 0, 0.7)" : `rgba(0, 0, 0, ${0.7 * STALE_OPACITY})`;
    styles = [
      new Style({ stroke: new Stroke({ color: casing, width: 6 }) }),
      new Style({ stroke: new Stroke({ color: stroke, width: 3.5 }) }),
    ];
    newtonCache.set(key, styles);
  }
  return styles;
}
