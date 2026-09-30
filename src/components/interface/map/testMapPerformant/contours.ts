/**
 * Contour Styles for OpenLayers VectorImageLayers
 *
 * Creates cached styles for major and minor contour lines.
 * Style caching is keyed on elevation + zoom level to avoid creating
 * thousands of Style objects on every render frame.
 *
 * These are designed for use with VectorImageLayer which renders all
 * features to an internal canvas per view — the key performance strategy
 * for large GeoJSON files (35MB-138MB).
 */

import { Fill, Stroke, Style, Text } from "ol/style";
import type Feature from "ol/Feature";

// ---------------------------------------------------------------------------
// Major Contours
// ---------------------------------------------------------------------------

/**
 * Create an optimized style function for major contour lines.
 *
 * - White lines at all zoom levels
 * - Yellow elevation labels shown when zoom > 7
 * - Style objects cached by (elevation, labelVisible, zoom)
 *
 * @param baseResolution - Resolution at zoom 0 (for computing current zoom)
 * @param showLabels - Whether to display contour elevation labels
 */
export function createMajorContourStyle(baseResolution: number, showLabels: boolean) {
  const styleCache: { [key: string]: Style } = {};

  return (feature: Feature, resolution: number): Style | undefined => {
    const elevation = feature.get("Contour");
    const zoom = Math.log2(baseResolution / resolution);

    const shouldShowLabel = showLabels && zoom > 7;
    const cacheKey = `${elevation}-${shouldShowLabel}-${Math.floor(zoom)}`;

    if (!styleCache[cacheKey]) {
      const textStyle =
        shouldShowLabel && elevation
          ? new Text({
              text: `${elevation}m`,
              font: "bold 12px sans-serif",
              placement: "line",
              repeat: 1000,
              maxAngle: Math.PI / 6,
              overflow: true,
              padding: [3, 5, 3, 5],
              fill: new Fill({ color: "yellow" }),
              stroke: new Stroke({
                color: "rgba(0, 0, 0, 0.8)",
                width: 3,
              }),
            })
          : undefined;

      styleCache[cacheKey] = new Style({
        stroke: new Stroke({
          color: "rgba(255, 255, 255, 0.95)",
          width: 1,
          lineCap: "round",
          lineJoin: "round",
        }),
        text: textStyle,
      });
    }

    return styleCache[cacheKey];
  };
}

// ---------------------------------------------------------------------------
// Minor Contours
// ---------------------------------------------------------------------------

/**
 * Create an optimized style function for minor contour lines.
 *
 * - Grey lines (thinner/more transparent than majors)
 * - Orange elevation labels shown when zoom > 9
 * - Style objects cached by (elevation, labelVisible, zoom)
 *
 * @param baseResolution - Resolution at zoom 0 (for computing current zoom)
 * @param showLabels - Whether to display contour elevation labels
 */
export function createMinorContourStyle(baseResolution: number, showLabels: boolean) {
  const styleCache: { [key: string]: Style } = {};

  return (feature: Feature, resolution: number): Style | undefined => {
    const elevation = feature.get("Contour");
    const zoom = Math.log2(baseResolution / resolution);

    const shouldShowLabel = showLabels && zoom > 9;
    const cacheKey = `${elevation}-${shouldShowLabel}-${Math.floor(zoom)}`;

    if (!styleCache[cacheKey]) {
      const textStyle =
        shouldShowLabel && elevation
          ? new Text({
              text: `${elevation}m`,
              font: "11px sans-serif",
              placement: "line",
              repeat: 1500,
              maxAngle: Math.PI / 6,
              overflow: true,
              padding: [2, 4, 2, 4],
              fill: new Fill({ color: "orange" }),
              stroke: new Stroke({
                color: "rgba(0, 0, 0, 0.7)",
                width: 2.5,
              }),
            })
          : undefined;

      styleCache[cacheKey] = new Style({
        stroke: new Stroke({
          color: "rgba(165, 165, 165, 0.75)",
          width: 0.8,
          lineCap: "round",
          lineJoin: "round",
        }),
        text: textStyle,
      });
    }

    return styleCache[cacheKey];
  };
}
