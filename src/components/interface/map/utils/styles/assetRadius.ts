import type { FeatureLike } from "ol/Feature";
import { Fill, Stroke, Style } from "ol/style";

import { withAlpha } from "../layers/layerFactory";

/** Fill opacity of an asset's radius circle. */
export const ASSET_RADIUS_FILL_ALPHA = 0.3;

/**
 * Asset radius circles: a fill in the feature's `color` with no stroke, plus a white stroke while
 * the asset (`assetUuid` property) is selected. Cache key: color + selection.
 */
export function buildAssetRadiusStyleFunction(
  selectedAssetUuid: string | null
): (feature: FeatureLike) => Style {
  const cache = new Map<string, Style>();

  return (feature: FeatureLike): Style => {
    const color = feature.get("color") as string;
    const isSelected = feature.get("assetUuid") === selectedAssetUuid;

    const cacheKey = `${color}-${isSelected}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const style = new Style({
      fill: new Fill({ color: withAlpha(color, ASSET_RADIUS_FILL_ALPHA) }),
      stroke: isSelected ? new Stroke({ color: "#ffffff", width: 2 }) : undefined,
      zIndex: isSelected ? 1 : 0,
    });
    cache.set(cacheKey, style);
    return style;
  };
}
