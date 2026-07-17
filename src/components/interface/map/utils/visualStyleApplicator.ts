/**
 * visualStyleApplicator — applies CSS filters, opacity, and blend modes
 * to OL layers via canvas 2D context manipulation.
 *
 * IMPORTANT: Multiple layers may share the same canvas element (any layers
 * with the default "ol-layer" className render to a single shared canvas).
 * Therefore we CANNOT set CSS properties (filter, mix-blend-mode) on the
 * canvas DOM element — those would affect ALL layers on that canvas.
 *
 * Instead, we use `prerender` / `postrender` event listeners to manipulate
 * the canvas 2D rendering context:
 *   - `prerender`: save context state, apply `ctx.filter` and
 *     `ctx.globalCompositeOperation` so the layer's own draw calls use them.
 *   - `postrender`: restore context state so subsequent layers are unaffected.
 *
 * For opacity, we use OL's native `layer.setOpacity()` which handles per-layer
 * opacity correctly regardless of canvas sharing.
 */

import type { Layer as OLLayer } from "ol/layer";
import type RenderEvent from "ol/render/Event";

type RenderHandler = (event: RenderEvent) => void;

/** Layer with our attached event handler references. */
interface LayerWithStyleHandlers extends OLLayer {
  __aegisPrerenderHandler?: RenderHandler;
  __aegisPostrenderHandler?: RenderHandler;
}

/** Extract the 2D canvas context from an OL render event. */
function getContext(event: RenderEvent): CanvasRenderingContext2D | null {
  // OL's render event exposes the context; the exact shape depends on the
  // layer renderer but `event.context` is the standard path.
  const ctx = (event as unknown as { context?: CanvasRenderingContext2D }).context;
  return ctx ?? null;
}

/** Map CSS blend mode names to canvas globalCompositeOperation values.
 *  Most CSS blend modes map 1:1; only a few need translation. */
function blendModeToCompositeOp(blendMode: string): GlobalCompositeOperation {
  // CSS mix-blend-mode values that differ from canvas compositeOperation:
  //   (none currently — they're the same strings)
  // Fall back to "source-over" for "normal".
  if (!blendMode || blendMode === "normal") return "source-over";
  return blendMode as GlobalCompositeOperation;
}

/**
 * Apply visual controls (opacity, CSS filters, blend mode) to a layer.
 *
 * Opacity uses OL's native `setOpacity` (works on all layer types).
 * Filters and blend mode are applied per-layer via context state in
 * `prerender`/`postrender` listeners (safe with shared canvases).
 */
export function applyVisualStyle(layer: OLLayer, style: MapSublayerStyle): void {
  // Opacity — OL handles this per-layer correctly.
  layer.setOpacity(style.opacity ?? 1);

  // Build the CSS filter string
  const cssFilter = buildCSSFilter(style);
  const blendMode = style.blendMode || "normal";

  // Remove any existing handlers we attached (avoid stacking)
  removeHandlers(layer);

  // If no visual adjustments needed, skip the listeners
  const needsFilter = cssFilter !== "none";
  const needsBlend = blendMode !== "normal";
  if (!needsFilter && !needsBlend) return;

  // --- prerender: save context + apply filter/blend ----------------------
  const prerenderHandler: RenderHandler = (event) => {
    const ctx = getContext(event);
    if (!ctx) return;
    ctx.save();

    if (needsFilter) {
      ctx.filter = cssFilter;
    }
    if (needsBlend) {
      ctx.globalCompositeOperation = blendModeToCompositeOp(blendMode);
    }
  };

  // --- postrender: restore context state ---------------------------------
  const postrenderHandler: RenderHandler = (event) => {
    const ctx = getContext(event);
    if (!ctx) return;
    ctx.restore();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layer.on("prerender", prerenderHandler as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layer.on("postrender", postrenderHandler as any);
  (layer as LayerWithStyleHandlers).__aegisPrerenderHandler = prerenderHandler;
  (layer as LayerWithStyleHandlers).__aegisPostrenderHandler = postrenderHandler;
}

/**
 * Remove visual style overrides from a layer.
 */
export function clearVisualStyle(layer: OLLayer): void {
  layer.setOpacity(1);
  removeHandlers(layer);
}

/** Remove previously attached prerender/postrender handlers. */
function removeHandlers(layer: OLLayer): void {
  const styled = layer as LayerWithStyleHandlers;
  if (styled.__aegisPrerenderHandler) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    layer.un("prerender", styled.__aegisPrerenderHandler as any);
    styled.__aegisPrerenderHandler = undefined;
  }
  if (styled.__aegisPostrenderHandler) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    layer.un("postrender", styled.__aegisPostrenderHandler as any);
    styled.__aegisPostrenderHandler = undefined;
  }
}

/**
 * Build a CSS filter string from MapSublayerStyle values.
 *
 * The OL/CSS implementation uses multipliers (brightness(1.2)).
 * MapSublayerStyle stores them as multipliers (1 = default).
 */
export function buildCSSFilter(style: MapSublayerStyle): string {
  const parts: string[] = [];

  if (style.brightness != null && style.brightness !== 1) {
    parts.push(`brightness(${style.brightness})`);
  }
  if (style.contrast != null && style.contrast !== 1) {
    parts.push(`contrast(${style.contrast})`);
  }
  if (style.saturation != null && style.saturation !== 1) {
    parts.push(`saturate(${style.saturation})`);
  }

  return parts.length > 0 ? parts.join(" ") : "none";
}
