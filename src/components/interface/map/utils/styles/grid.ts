import { Fill, Stroke, Style, Text } from "ol/style";

import { defaultGridStyle } from "store/storeUtils/sublayer";

import { withAlpha } from "../layers/layerFactory";

/** Seam lines (zone meridians, ±80°, equator) are this much wider than grid lines. */
const SEAM_WIDTH_FACTOR = 2.5;
/** Panning produces new label texts; the cache is cleared wholesale past this size. */
const LABEL_CACHE_LIMIT = 2000;

function resolveGridStyle(style: Partial<MapSublayerStyle> | undefined): MapSublayerStyle {
  return { ...defaultGridStyle, ...(style ?? {}) };
}

/** Line styles for one grid render: regular grid lines and heavier seams. */
export function createGridLineStyles(style: Partial<MapSublayerStyle> | undefined): GridLineStyles {
  const gridStyle = resolveGridStyle(style);
  const color = gridStyle.color.startsWith("rgba(")
    ? gridStyle.color
    : withAlpha(gridStyle.color, gridStyle.opacity);
  return {
    grid: new Style({ stroke: new Stroke({ color, width: gridStyle.weight }) }),
    seam: new Style({
      stroke: new Stroke({ color, width: Math.max(gridStyle.weight * SEAM_WIDTH_FACTOR, 2) }),
    }),
  };
}

/**
 * Label style builder caching one `Style` per text. The style inputs are captured here, so a
 * change to the grid style or font size needs a new builder.
 */
export function createGridLabelStyleFn(
  style: Partial<MapSublayerStyle> | undefined,
  fontSize: number
): GridLabelStyleFn {
  const gridStyle = resolveGridStyle(style);
  const haloWidth = gridStyle.labelHaloWidth ?? defaultGridStyle.labelHaloWidth;
  const fill = new Fill({ color: gridStyle.labelColor ?? defaultGridStyle.labelColor });
  const stroke =
    haloWidth > 0
      ? new Stroke({
          color: withAlpha(
            gridStyle.labelHaloColor ?? defaultGridStyle.labelHaloColor,
            gridStyle.labelHaloOpacity ?? defaultGridStyle.labelHaloOpacity
          ),
          width: haloWidth,
        })
      : undefined;
  const font = `${fontSize}px sans-serif`;
  const cache = new Map<string, Style>();
  return (text, centered) => {
    const key = centered ? `c|${text}` : `n|${text}`;
    let cached = cache.get(key);
    if (!cached) {
      if (cache.size >= LABEL_CACHE_LIMIT) cache.clear();
      cached = new Style({
        text: new Text({
          text,
          font,
          fill,
          stroke,
          offsetX: centered ? 0 : 5,
          offsetY: centered ? 0 : -8,
          textAlign: centered ? "center" : "left",
        }),
      });
      cache.set(key, cached);
    }
    return cached;
  };
}
