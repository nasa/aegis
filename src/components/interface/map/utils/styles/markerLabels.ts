/**
 * Marker Label Styles — style function for the dedicated label layer.
 *
 * Each label feature is a Point positioned at its auto-laid-out (or
 * user-dragged) location. The style renders:
 *
 * 1. A rounded-rect text box with the label name.
 * 2. A dashed connector line from the label back to the marker anchor.
 * 3. A small dot at the marker anchor.
 *
 * The connector line and anchor dot use OL geometry-based styles
 * (`LineString` / `Point`) so they transform in real-time during zoom
 * animation. The alternating dark/light dashes ensure visibility on any
 * background.
 */

import type Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { LineString } from "ol/geom";
import { Style, Icon, Stroke, Fill, Circle as CircleStyle } from "ol/style";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LABEL_FONT_SIZE = 14;
const LABEL_FONT = `${DEFAULT_LABEL_FONT_SIZE}px sans-serif`;
const TEXT_PADDING_H = 6;
const TEXT_PADDING_V = 4;
const DOT_RADIUS = 3;

// Colors per label type
const LABEL_COLORS: Record<string, { text: string; bg: string; connector: string }> = {
  lander: {
    text: "rgba(255,255,255,1)",
    bg: "rgba(0,0,0,0.6)",
    connector: "rgba(255,255,255,0.7)",
  },
  station: {
    text: "rgba(255,255,255,0.95)",
    bg: "rgba(0,0,0,0.5)",
    connector: "rgba(255,255,255,0.5)",
  },
  poi: {
    text: "rgba(200,220,255,0.9)",
    bg: "rgba(0,0,0,0.5)",
    connector: "rgba(200,220,255,0.45)",
  },
  action: {
    text: "rgba(255,220,180,0.9)",
    bg: "rgba(0,0,0,0.5)",
    connector: "rgba(255,220,180,0.45)",
  },
  pos: {
    text: "rgb(255, 255, 255)",
    bg: "rgba(0,0,0,0.9)",
    connector: "rgba(180,255,200,0.45)",
  },
};

const DEFAULT_COLORS = LABEL_COLORS.station;

const _measureCanvas = document.createElement("canvas");
const _measureCtx = _measureCanvas.getContext("2d");
if (_measureCtx) _measureCtx.font = LABEL_FONT;

/**
 * Create a style function for the marker label layer.
 *
 * Each label feature must have properties:
 * - `name` (string) — label text
 * - `labelType` ('lander' | 'station' | 'poi' | 'action')
 * - `anchorCoord` ([number, number]) — projected map coordinate of the marker
 *
 * The feature's geometry is a Point at the label position (may differ from
 * anchor if auto-laid-out or dragged).
 */
export function createMarkerLabelStyle(
  fontSizePx: number = DEFAULT_LABEL_FONT_SIZE,
  connectorWidth: number = 1.5
) {
  const font = `${fontSizePx}px sans-serif`;
  // Scale the dash pattern with the line width so the dashes keep the same
  // visual proportion as the line thickens (short dashes on a thick line read
  // as a muddy solid colour). Base ratio: 4px dash at 1.5px width.
  const dashLen = Math.round(connectorWidth * 6);
  // Cache static label images by name+type+font (base style, no connector)
  const baseLabelCache = new Map<string, HTMLCanvasElement>();

  return (feature: Feature, resolution: number): Style | Style[] | undefined => {
    const name = feature.get("name") as string;
    if (!name || !_measureCtx) return undefined;

    const labelType = (feature.get("labelType") as string) || "station";
    const colors = LABEL_COLORS[labelType] || DEFAULT_COLORS;
    const opacity = (feature.get("labelOpacity") as number) ?? 1.0;

    const geom = feature.getGeometry() as Point | undefined;
    if (!geom) return undefined;
    const labelCoord = geom.getCoordinates();
    const anchorCoord = feature.get("anchorCoord") as [number, number] | undefined;

    // Render the text box at device-pixel resolution so it stays crisp on HiDPI
    // displays / Windows display-scaling > 100%. The Icon is scaled back down by
    // 1/dpr so it still occupies the same logical (CSS px) size on screen.
    const dpr = window.devicePixelRatio || 1;

    // Build base label canvas (text box only)
    const baseCacheKey = `${name}-${labelType}-${fontSizePx}-${dpr}`;
    let baseLabelImg = baseLabelCache.get(baseCacheKey);
    if (!baseLabelImg) {
      baseLabelImg = renderBaseLabelCanvas(name, colors.text, colors.bg, font, fontSizePx, dpr);
      if (!baseLabelImg) return undefined;
      baseLabelCache.set(baseCacheKey, baseLabelImg);
    }

    const zIndex = labelType === "lander" ? 200 : labelType === "station" ? 150 : 100;

    const labelStyle = new Style({
      image: new Icon({
        img: baseLabelImg,
        scale: 1 / dpr,
        anchor: [0.5, 0.5],
        anchorXUnits: "fraction",
        anchorYUnits: "fraction",
        opacity,
      }),
      zIndex: zIndex + 1,
    });

    // No anchor — just the text box
    if (!anchorCoord) return labelStyle;

    // Skip connector when label is very close to anchor (< 2 px)
    const dxPx = (anchorCoord[0] - labelCoord[0]) / resolution;
    const dyPx = -(anchorCoord[1] - labelCoord[1]) / resolution;
    if (dxPx * dxPx + dyPx * dyPx < 4) return labelStyle;

    // Connector geometry in map coordinates — animates smoothly with zoom
    const connectorGeom = new LineString([labelCoord, anchorCoord]);

    // Black dashes (fill the gaps between the white dashes). Butt caps keep
    // each dash exactly dashLen long so black/white stay a true 50/50 split.
    const connectorBg = new Style({
      stroke: new Stroke({
        color: applyOpacity("rgb(0,0,0)", opacity),
        width: connectorWidth,
        lineDash: [dashLen, dashLen],
        lineCap: "butt",
      }),
      geometry: connectorGeom,
      zIndex: zIndex - 2,
    });

    // White dashes offset by one dash length so they alternate with the black
    const connectorFg = new Style({
      stroke: new Stroke({
        color: applyOpacity("rgb(255,255,255)", opacity),
        width: connectorWidth,
        lineDash: [dashLen, dashLen],
        lineDashOffset: dashLen,
        lineCap: "butt",
      }),
      geometry: connectorGeom,
      zIndex: zIndex - 1,
    });

    // Small dot at the marker anchor
    const anchorDot = new Style({
      image: new CircleStyle({
        radius: DOT_RADIUS,
        fill: new Fill({ color: applyOpacity(colors.text, opacity) }),
        stroke: new Stroke({
          color: applyOpacity("rgba(0,0,0,0.5)", opacity),
          width: 1,
        }),
      }),
      geometry: new Point(anchorCoord),
      zIndex,
    });

    return [connectorBg, connectorFg, anchorDot, labelStyle];
  };
}

function renderBaseLabelCanvas(
  name: string,
  textColor: string,
  bgColor: string,
  font: string = LABEL_FONT,
  fontSizePx: number = DEFAULT_LABEL_FONT_SIZE,
  dpr: number = 1
): HTMLCanvasElement | null {
  if (!_measureCtx) return null;

  _measureCtx.font = font;
  _measureCtx.textBaseline = "alphabetic";
  const metrics = _measureCtx.measureText(name);
  const textWidth = metrics.width;

  // Size and center on real font metrics so glyphs are vertically centered by
  // their true extent (fall back to em-square estimates if metrics are absent).
  const ascent = metrics.fontBoundingBoxAscent ?? fontSizePx * 0.8;
  const descent = metrics.fontBoundingBoxDescent ?? fontSizePx * 0.2;
  const textHeight = ascent + descent;

  const boxWidth = Math.ceil(textWidth + TEXT_PADDING_H * 2);
  const boxHeight = Math.ceil(textHeight + TEXT_PADDING_V * 2);

  // Backing store at device-pixel resolution; all drawing below stays in logical
  // (CSS) px via ctx.scale so the box/text geometry is unchanged.
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(boxWidth * dpr);
  canvas.height = Math.round(boxHeight * dpr);

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(0, 0, boxWidth, boxHeight, 3);
  ctx.fill();

  // Baseline sits `ascent` below the top padding.
  const baselineY = TEXT_PADDING_V + ascent;

  // Text outline
  ctx.font = font;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeText(name, boxWidth / 2, baselineY);

  // Text fill
  ctx.fillStyle = textColor;
  ctx.fillText(name, boxWidth / 2, baselineY);

  return canvas;
}

function applyOpacity(rgba: string, opacity: number): string {
  if (opacity >= 1) return rgba;
  const m = rgba.match(/rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)/);
  if (!m) return rgba;
  const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
  return `rgba(${m[1]},${m[2]},${m[3]},${(a * opacity).toFixed(3)})`;
}
