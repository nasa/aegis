/**
 * Circle Mode
 *
 * Provides helper function for switching circle modes
 * (solid, dashed, checkerboard) and building OL layers.
 *
 * Used by the map control panel to configure circles around points of interest.
 */

// ---------------------------------------------------------------------------
// Mode Switching
// ---------------------------------------------------------------------------

/**
 * Switch a circle configuration
 */
export function switchCircleMode(circle: CircleConfig, nextMode: CircleMode): CircleConfig {
  if (circle.mode === nextMode) {
    return circle;
  }

  const common: CircleCommonConfig = {
    visible: circle.visible,
    radius: circle.radius,
    showLabel: circle.showLabel,
    labelText: circle.labelText,
    labelColor: circle.labelColor,
    zIndex: circle.zIndex,
  };

  if (nextMode === "checkerboard") {
    return {
      ...common,
      mode: "checkerboard",
      stroke: {
        segmentPx: 50,
        ratio: 1,
        innerThickness: 3,
        outerThickness: 3,
        innerColor: "#000000",
        outerColor: "#000000",
      },
    };
  }

  const fallbackColor =
    circle.mode === "checkerboard" ? circle.labelColor || "#ff0000" : circle.stroke.color;
  const fallbackWidth = circle.mode === "checkerboard" ? 1.5 : circle.stroke.width;

  if (nextMode === "dashed") {
    return {
      ...common,
      mode: "dashed",
      stroke: {
        color: fallbackColor,
        width: fallbackWidth,
        segmentPx: 50,
        ratio: 1,
      },
    };
  }

  return {
    ...common,
    mode: "solid",
    stroke: {
      color: fallbackColor,
      width: fallbackWidth,
    },
  };
}
