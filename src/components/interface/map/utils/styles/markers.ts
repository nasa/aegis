/**
 * Marker Styles — style functions for station, POI, action, asset, lander markers.
 *
 * Each builder returns an OL `StyleFunction` parameterized by the mode config
 * and current display state. Style caching is internal. The style functions
 * are consumed by behavior components that attach them to VectorLayers.
 *
 * ## Labels
 *
 * Labels are NOT rendered by marker styles. They are managed by the
 * `MarkerLabels` behavior component on a dedicated label layer with:
 * - Auto-layout collision avoidance (greedy pixel-based algorithm)
 * - Draggable labels with connector lines back to markers
 * - Priority: lander > station > POI > action > pos > asset
 */

import { Style, Stroke, Fill, Icon, Circle as CircleStyle } from "ol/style";
import { withAlpha } from "../layers/layerFactory";
import type { FeatureLike } from "ol/Feature";
import type { ModeConfig } from "../modeConfig";
import { renderEmojiToCanvas } from "../emojiRenderer";

export function buildStationStyleFunction(
  config: ModeConfig,
  selectedStationUuid: string | null,
  stationsInProgress: string[]
): (feature: FeatureLike, resolution: number) => Style[] {
  const cache = new Map<string, Style[]>();

  return (feature: FeatureLike, _resolution: number): Style[] => {
    const uuid = feature.getId() as string;
    const emoji = feature.get("emoji") as string;
    const isSelected = uuid === selectedStationUuid;
    const isInProgress = stationsInProgress.includes(uuid);

    const cacheKey = `${emoji}-${isSelected}-${isInProgress}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const styles: Style[] = [];
    const baseZIndex = isSelected
      ? 9999
      : config.station.zIndexOffset + (feature.get("zIndex") || 0);

    // Main marker icon (emoji rendered to canvas). Size is mode-driven so the
    // dashboard can render stations larger to match the astronaut/pos icons.
    const iconSize = config.station.iconSize;
    // renderEmojiToCanvas backs the canvas at devicePixelRatio; the Icon's
    // width/height (logical px) scale it back down so it stays crisp on HiDPI.
    const canvas = renderEmojiToCanvas(emoji || "2754", iconSize);
    styles.push(
      new Style({
        image: new Icon({
          img: canvas,
          width: iconSize,
          height: iconSize,
          anchor: [0.5, 0.5],
          anchorXUnits: "fraction",
          anchorYUnits: "fraction",
        }),
        zIndex: baseZIndex,
      })
    );

    // Selection highlight is handled by SelectionHighlight behavior — no inline circle needed

    // Dashboard in-progress station highlight — green circle ring (sized to icon)
    if (config.station.hoverable === false && isInProgress) {
      styles.push(
        new Style({
          image: new CircleStyle({
            radius: iconSize / 2 + 12,
            stroke: new Stroke({ color: "#52f075", width: 3 }),
          }),
        })
      );
    }

    cache.set(cacheKey, styles);
    return styles;
  };
}

export function buildPoiStyleFunction(
  selectedPoiUuid: string | null,
  iconSize = 20
): (feature: FeatureLike, resolution: number) => Style[] {
  const cache = new Map<string, Style[]>();

  return (feature: FeatureLike, _resolution: number): Style[] => {
    const uuid = feature.getId() as string;
    const emoji = feature.get("emoji") as string;
    const isSelected = uuid === selectedPoiUuid;

    const cacheKey = `poi-${emoji}-${isSelected}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const styles: Style[] = [];
    const baseZIndex = isSelected ? 9999 : 0;

    // Marker icon
    const canvas = renderEmojiToCanvas(emoji || "1f534", iconSize);
    styles.push(
      new Style({
        image: new Icon({
          img: canvas,
          width: iconSize,
          height: iconSize,
          anchor: [0.5, 0.5],
          anchorXUnits: "fraction",
          anchorYUnits: "fraction",
        }),
        zIndex: baseZIndex,
      })
    );

    cache.set(cacheKey, styles);
    return styles;
  };
}

export function buildActionStyleFunction(
  selectedActionUuid: string | null,
  iconSize = 20
): (feature: FeatureLike, resolution: number) => Style[] {
  const cache = new Map<string, Style[]>();

  return (feature: FeatureLike, _resolution: number): Style[] => {
    const uuid = feature.getId() as string;
    const emoji = feature.get("emoji") as string;
    const isSelected = uuid === selectedActionUuid;

    const cacheKey = `action-${emoji}-${isSelected}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const styles: Style[] = [];
    const baseZIndex = isSelected ? 9999 : 0;

    // Marker icon
    const canvas = renderEmojiToCanvas(emoji || "2754", iconSize);
    styles.push(
      new Style({
        image: new Icon({
          img: canvas,
          width: iconSize,
          height: iconSize,
          anchor: [0.5, 0.5],
          anchorXUnits: "fraction",
          anchorYUnits: "fraction",
        }),
        zIndex: baseZIndex,
      })
    );

    cache.set(cacheKey, styles);
    return styles;
  };
}

/**
 * Asset markers: the emoji over an optional 50%-opaque disc in the asset's color, and a white
 * ring while selected. Missing icons fall back to ❔ like stations. Cache key: emoji + color +
 * selection (iconSize is captured at builder creation).
 */
export function buildAssetStyleFunction(
  selectedAssetUuid: string | null,
  iconSize = 20
): (feature: FeatureLike, resolution: number) => Style[] {
  const cache = new Map<string, Style[]>();

  return (feature: FeatureLike, _resolution: number): Style[] => {
    const uuid = feature.getId() as string;
    const emoji = (feature.get("emoji") as string) || "2754";
    const color = (feature.get("color") as string | null) ?? null;
    const isSelected = uuid === selectedAssetUuid;

    const cacheKey = `asset-${emoji}-${color}-${isSelected}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const styles: Style[] = [];
    const baseZIndex = isSelected ? 9999 : 0;
    if (color) {
      styles.push(
        new Style({
          image: new CircleStyle({
            radius: iconSize / 2 + 5,
            fill: new Fill({ color: withAlpha(color, 0.5) }),
          }),
          zIndex: baseZIndex,
        })
      );
    }
    if (isSelected) {
      styles.push(
        new Style({
          image: new CircleStyle({
            radius: iconSize / 2 + 7,
            stroke: new Stroke({ color: "#ffffff", width: 2 }),
          }),
          zIndex: baseZIndex,
        })
      );
    }
    const canvas = renderEmojiToCanvas(emoji, iconSize);
    styles.push(
      new Style({
        image: new Icon({
          img: canvas,
          width: iconSize,
          height: iconSize,
          anchor: [0.5, 0.5],
          anchorXUnits: "fraction",
          anchorYUnits: "fraction",
        }),
        zIndex: baseZIndex,
      })
    );

    cache.set(cacheKey, styles);
    return styles;
  };
}

const landerStyleCache: Map<string, Style> = new Map();

/**
 * Build a Style for the lander marker using the SVG icon.
 * Since the SVG loads async, returns a promise. The behavior component
 * calls this once on mount.
 */
export function buildLanderStyle(sizePx: number): Style {
  const key = `lander-${sizePx}`;
  const cached = landerStyleCache.get(key);
  if (cached) return cached;

  const style = new Style({
    image: new Icon({
      src: "/images/lander.svg",
      width: sizePx,
      height: sizePx,
      anchor: [0.5, 0.5],
      anchorXUnits: "fraction",
      anchorYUnits: "fraction",
    }),
  });

  landerStyleCache.set(key, style);
  return style;
}
