/**
 * POS Marker Styles — style function for Position Entry (POS) markers.
 *
 * A POS marker is a composite: a stack of per-posType icons (astronaut SVG for
 * "EV*" types, emoji canvas otherwise) offset diagonally, with a stack of thin
 * colored bars hanging below. This reproduces the former `PosMarkerContent`
 * overlay layout (icon center on the anchor, bars below) as a vector-feature
 * `StyleFunction` so POS entries are real OL features — hit-testable and
 * editable through the same paths as every other marker.
 *
 * The behavior component stashes the visible posType descriptors + faded flag on
 * each feature; this builder reads them and returns cached `Style[]`.
 *
 * Labels are NOT rendered here — they live on the shared label layer
 * (`MarkerLabels`), anchored to the entry location.
 */

import { Style, Icon } from "ol/style";
import type { FeatureLike } from "ol/Feature";
import type { ModeConfig } from "../modeConfig";
import { renderEmojiToCanvas } from "../emojiRenderer";

/** One posType's contribution to a POS marker, top-to-bottom in stack order. */
export interface PosMarkerIcon {
  /** Emoji hex code (e.g. "1f535") — used when `isEV` is false. */
  emoji: string;
  /** True for "EV*" posTypes → render the astronaut SVG instead of the emoji. */
  isEV: boolean;
  /** posType path color — used for the color bar. */
  color: string;
}

// Layout constants — mirror the former PosMarkerContent CSS module.
const STACK_OFFSET_PX = 2; // diagonal shift per stacked icon
const BAR_HEIGHT_PX = 3;
const BAR_GAP_PX = 1;
const BAR_MARGIN_PX = 6; // gap between icon-stack bottom and first bar
const BAR_WIDTH_INSET_PX = 4; // bar width = iconSize - inset
const FADED_OPACITY = 0.4;
const EV_ICON_SRC = "/images/astronaut_outline.svg";

// ---------------------------------------------------------------------------
// Color bar data URIs
// ---------------------------------------------------------------------------

const barCache = new Map<string, string>();
function getBarDataUri(color: string, width: number): string {
  const key = `${color}-${width}`;
  const cached = barCache.get(key);
  if (cached) return cached;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BAR_HEIGHT_PX}" viewBox="0 0 ${width} ${BAR_HEIGHT_PX}"><rect width="${width}" height="${BAR_HEIGHT_PX}" rx="1" ry="1" fill="${color}"/></svg>`;
  const uri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  barCache.set(key, uri);
  return uri;
}

// ---------------------------------------------------------------------------
// Style function
// ---------------------------------------------------------------------------

/**
 * Build an OL `StyleFunction` for POS markers. `iconSize` is captured from the
 * mode config at build time (a size change requires rebuilding the function,
 * matching the marker-style-builder convention).
 *
 * Each feature is expected to carry:
 *  - `posMarkers`: `PosMarkerIcon[]` in top-to-bottom stack order
 *  - `faded`: boolean (old marker in fade mode)
 */
export function buildPosMarkerStyleFunction(
  config: ModeConfig
): (feature: FeatureLike, resolution: number) => Style[] {
  const iconSize = config.pos.evIconSize;
  const barWidth = Math.max(1, iconSize - BAR_WIDTH_INSET_PX);
  const cache = new Map<string, Style[]>();

  return (feature: FeatureLike, _resolution: number): Style[] => {
    const posMarkers = (feature.get("posMarkers") as PosMarkerIcon[]) ?? [];
    const faded = !!feature.get("faded");
    if (posMarkers.length === 0) return [];

    const cacheKey = `${iconSize}|${faded}|${posMarkers
      .map((m) => `${m.emoji}:${m.isEV}:${m.color}`)
      .join(",")}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const opacity = faded ? FADED_OPACITY : 1;
    const styles: Style[] = [];

    // Icon stack. OL Icon displacement is [right, up] in pixels; the CSS layout
    // offset each stacked icon down-and-right, so shift x right and y down
    // (negative). Index 0 (first posType) sits centered on top.
    posMarkers.forEach((marker, i) => {
      const displacement: [number, number] = [i * STACK_OFFSET_PX, -i * STACK_OFFSET_PX];
      const image = marker.isEV
        ? new Icon({
            src: EV_ICON_SRC,
            width: iconSize,
            height: iconSize,
            displacement,
            opacity,
          })
        : new Icon({
            img: renderEmojiToCanvas(marker.emoji || "2754", iconSize),
            width: iconSize,
            height: iconSize,
            displacement,
            opacity,
          });
      styles.push(new Style({ image, zIndex: 100 - i }));
    });

    // Color bars hang below the icon stack, centered. Each bar's center sits at
    // iconSize/2 (stack bottom) + margin + accumulated bar pitch, measured down.
    posMarkers.forEach((marker, i) => {
      const centerDown =
        iconSize / 2 + BAR_MARGIN_PX + BAR_HEIGHT_PX / 2 + i * (BAR_HEIGHT_PX + BAR_GAP_PX);
      styles.push(
        new Style({
          image: new Icon({
            src: getBarDataUri(marker.color || "#888", barWidth),
            displacement: [0, -centerDown],
            opacity,
          }),
          zIndex: 50,
        })
      );
    });

    cache.set(cacheKey, styles);
    return styles;
  };
}
