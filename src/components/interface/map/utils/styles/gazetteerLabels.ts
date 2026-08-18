/**
 * Gazetteer Label Styles — style function for draggable place-name labels on a
 * GeoJSON data sublayer (nomenclature, plus the synthetic anchors created for
 * feature polygon/line classes).
 *
 * Each feature is a Point carrying the label text and the `originalCoordinates`
 * it was loaded at. The label box is drawn with its bottom-centre on the
 * feature's current position, so an untouched label sits directly above its
 * source location. Once the user drags it clear, a dashed black+white tether
 * and an anchor dot are composited into the same image so the label keeps
 * pointing at where the feature actually is.
 */

import type Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { Style, Icon } from "ol/style";

import { defaultSublayerStyle } from "store/storeUtils/sublayer";

import type { DataLayerConfig } from "../modeConfig";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Horizontal breathing room baked into the label image, as a multiple of the font size. */
const LABEL_PADDING_EMS = 0.46;
/** Height of the label image, as a multiple of the font size. */
const LABEL_HEIGHT_EMS = 2;
/** Below this screen distance the label still covers its anchor, so no tether is drawn. */
const MIN_TETHER_PX = 2;
const ANCHOR_DOT_RADIUS = 3;
/** Padding around the composited label+tether image so strokes aren't clipped. */
const TETHER_PADDING = 4;
/**
 * Tether images are keyed by their pixel offset, which is stable while panning but
 * changes on every zoom step. Drop the whole cache once it grows past this — same
 * crude cap `posPath.ts` uses.
 */
const MAX_TETHER_CACHE = 500;

const measureCanvas = document.createElement("canvas");
const measureContext = measureCanvas.getContext("2d");

export function getGazetteerLabel(feature: Feature): string | undefined {
  const label = feature.get("gazetteerLabel") ?? feature.get("label") ?? feature.get("Feat Name");
  return typeof label === "string" && label.trim().length > 0 ? label : undefined;
}

export function createGazetteerLabelStyle(style: MapSublayerStyle, dataLayer: DataLayerConfig) {
  // Both caches live on the builder, so a preset restyle (which rebuilds the
  // builder) drops them along with the colours they were rendered with.
  const labelCache = new Map<string, Style>();
  const tetherCache = new Map<string, Style>();
  const fontSize = dataLayer.gazetteerFontSize;

  return (feature: Feature, resolution: number): Style | undefined => {
    const name = getGazetteerLabel(feature);
    const geometry = feature.getGeometry();
    // Labels are opt-out (undefined = show), matching `buildVectorStyleFn`.
    if (
      !dataLayer.labelsEnabled ||
      style.showLabels === false ||
      !name ||
      !measureContext ||
      !(geometry instanceof Point)
    ) {
      return undefined;
    }

    const labelColor = style.labelColor ?? defaultSublayerStyle.labelColor;
    const labelHaloColor = style.labelHaloColor ?? defaultSublayerStyle.labelHaloColor;
    const labelHaloWidth = style.labelHaloWidth ?? defaultSublayerStyle.labelHaloWidth;
    const labelHaloOpacity = style.labelHaloOpacity ?? defaultSublayerStyle.labelHaloOpacity;
    // Render at device-pixel resolution and scale the Icon back down, so text stays
    // crisp on HiDPI displays / Windows display scaling above 100%.
    const dpr = window.devicePixelRatio || 1;
    const colorKey = `${labelColor}|${labelHaloColor}|${labelHaloWidth}|${labelHaloOpacity}|${dpr}`;

    const labelKey = `${name}|${colorKey}`;
    let labelStyle = labelCache.get(labelKey);
    if (!labelStyle) {
      const canvas = renderLabelCanvas(
        name,
        fontSize,
        labelColor,
        labelHaloColor,
        labelHaloWidth,
        labelHaloOpacity,
        dpr
      );
      if (!canvas) return undefined;
      labelStyle = new Style({
        image: new Icon({
          img: canvas,
          scale: 1 / dpr,
          anchor: [0.5, 1],
          anchorXUnits: "fraction",
          anchorYUnits: "fraction",
        }),
        zIndex: 100,
      });
      labelCache.set(labelKey, labelStyle);
    }

    const anchorCoordinate = feature.get("originalCoordinates") as [number, number] | undefined;
    if (!anchorCoordinate) return labelStyle;

    // Screen offset from the label's current position back to its source location.
    // Constant while panning, so the composited image below caches across frames.
    const currentCoordinate = geometry.getCoordinates();
    const dxPx = Math.round((anchorCoordinate[0] - currentCoordinate[0]) / resolution);
    const dyPx = Math.round(-(anchorCoordinate[1] - currentCoordinate[1]) / resolution);
    if (dxPx * dxPx + dyPx * dyPx < MIN_TETHER_PX * MIN_TETHER_PX) return labelStyle;

    const tetherKey = `${name}|${colorKey}|${dxPx}|${dyPx}`;
    const cachedTether = tetherCache.get(tetherKey);
    if (cachedTether) return cachedTether;

    const labelImage = (labelStyle.getImage() as Icon).getImage(1) as HTMLCanvasElement;
    const tetherStyle = renderTetheredLabelStyle(labelImage, dxPx, dyPx, dpr);
    if (!tetherStyle) return labelStyle;

    if (tetherCache.size >= MAX_TETHER_CACHE) tetherCache.clear();
    tetherCache.set(tetherKey, tetherStyle);
    return tetherStyle;
  };
}

/** Draw the label text (halo + fill) onto a transparent canvas sized to the text. */
function renderLabelCanvas(
  name: string,
  fontSize: number,
  labelColor: string,
  labelHaloColor: string,
  labelHaloWidth: number,
  labelHaloOpacity: number,
  dpr: number
): HTMLCanvasElement | null {
  if (!measureContext) return null;
  const font = `bold ${fontSize}px sans-serif`;
  const height = Math.round(fontSize * LABEL_HEIGHT_EMS);
  measureContext.font = font;
  const width = Math.ceil(
    measureContext.measureText(name).width + fontSize * LABEL_PADDING_EMS * 4
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.scale(dpr, dpr);
  context.font = font;
  context.textBaseline = "middle";
  context.textAlign = "center";
  context.strokeStyle = labelHaloColor;
  context.globalAlpha = labelHaloOpacity;
  context.lineWidth = labelHaloWidth * 2;
  context.strokeText(name, width / 2, height / 2);
  context.globalAlpha = 1;
  context.fillStyle = labelColor;
  context.fillText(name, width / 2, height / 2);

  return canvas;
}

/**
 * Composite the label image with a dashed tether and anchor dot into one Icon.
 *
 * The icon is anchored on the label's bottom-centre — the same point the untethered
 * style anchors on — so a label doesn't shift the moment it starts being dragged.
 */
function renderTetheredLabelStyle(
  labelImage: HTMLCanvasElement,
  dxPx: number,
  dyPx: number,
  dpr: number
): Style | null {
  // Everything below is in CSS px relative to the anchor (the label's bottom-centre).
  const labelWidth = labelImage.width / dpr;
  const labelHeight = labelImage.height / dpr;
  const minX = Math.min(-labelWidth / 2, dxPx - ANCHOR_DOT_RADIUS);
  const maxX = Math.max(labelWidth / 2, dxPx + ANCHOR_DOT_RADIUS);
  const minY = Math.min(-labelHeight, dyPx - ANCHOR_DOT_RADIUS);
  const maxY = Math.max(0, dyPx + ANCHOR_DOT_RADIUS);
  const width = Math.ceil(maxX - minX + TETHER_PADDING * 2);
  const height = Math.ceil(maxY - minY + TETHER_PADDING * 2);
  const originX = -minX + TETHER_PADDING;
  const originY = -minY + TETHER_PADDING;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.scale(dpr, dpr);

  // Alternating black/white dashes so the tether reads on any basemap.
  context.beginPath();
  context.moveTo(originX, originY);
  context.lineTo(originX + dxPx, originY + dyPx);
  context.strokeStyle = "rgb(0, 0, 0)";
  context.lineWidth = 1.5;
  context.setLineDash([4, 4]);
  context.stroke();
  context.strokeStyle = "rgb(255, 255, 255)";
  context.lineDashOffset = 4;
  context.stroke();
  context.setLineDash([]);
  context.lineDashOffset = 0;

  context.beginPath();
  context.arc(originX + dxPx, originY + dyPx, ANCHOR_DOT_RADIUS, 0, 2 * Math.PI);
  context.fillStyle = "rgb(255, 255, 255)";
  context.fill();
  context.strokeStyle = "rgb(0, 0, 0)";
  context.lineWidth = 1;
  context.stroke();

  context.drawImage(
    labelImage,
    originX - labelWidth / 2,
    originY - labelHeight,
    labelWidth,
    labelHeight
  );

  return new Style({
    image: new Icon({
      img: canvas,
      scale: 1 / dpr,
      anchor: [originX / width, originY / height],
      anchorXUnits: "fraction",
      anchorYUnits: "fraction",
    }),
    zIndex: 100,
  });
}
