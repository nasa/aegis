/**
 * Circle Configuration Types and Helpers for OpenLayers Circles
 *
 * Defines the configuration types for circle layers (solid, dashed, checkerboard)
 * and provides helper functions for switching modes and building OL layers.
 *
 * Used by the map control panel to configure circles around points of interest.
 */

import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import { createCircleLayer } from "../utils/layers/circleLayer";

// ---------------------------------------------------------------------------
// Layer Builder
// ---------------------------------------------------------------------------

/**
 * Build an OpenLayers VectorLayer from a CircleConfig, delegating to
 * the unified `createCircleLayer` factory.
 */
export function buildCircleLayer(
  center: [number, number],
  baseResolution: number | undefined,
  config: CircleConfig
): VectorLayer<VectorSource> {
  const stroke =
    config.mode === "checkerboard"
      ? {
          mode: "checkerboard" as const,
          innerThickness: config.stroke.innerThickness,
          outerThickness: config.stroke.outerThickness,
          innerColor: config.stroke.innerColor,
          outerColor: config.stroke.outerColor,
          segmentPx: config.stroke.segmentPx,
          checkerboardDashGapRatio: config.stroke.ratio,
        }
      : config.mode === "dashed"
        ? {
            mode: "dashed" as const,
            color: config.stroke.color,
            width: config.stroke.width,
            dashSegmentPx: config.stroke.segmentPx,
            dashGapRatio: config.stroke.ratio,
          }
        : {
            mode: "solid" as const,
            color: config.stroke.color,
            width: config.stroke.width,
          };

  return createCircleLayer(center, config.radius, {
    stroke,
    label: config.showLabel
      ? {
          text: config.labelText.trim() || undefined,
          color: config.labelColor,
          outlineColor: "rgba(31, 31, 31, 0.95)",
          outlineWidth: 1,
          position: "top",
          minZoom: 6,
        }
      : null,
    baseResolution,
    zIndex: config.zIndex,
    visible: config.visible,
  });
}
