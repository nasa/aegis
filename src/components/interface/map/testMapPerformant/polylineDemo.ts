/**
 * PolylineDemo.tsx - OpenLayers Polyline Rendering Utilities
 *
 * This module provides utilities for rendering polylines in OpenLayers with:
 * - Dynamic styling using style functions
 * - Directional arrows at segment midpoints
 * - Distance labels (in meters) for each segment
 * - Proper projection handling for custom coordinate systems
 *
 * ============================================================================
 * PATTERN OVERVIEW: OpenLayers Polyline Styling
 * ============================================================================
 *
 * OpenLayers uses a "Style Function" pattern for dynamic styling. Instead of
 * setting a static style, you provide a function that returns an array of
 * Style objects. This function is called for each feature and can return
 * multiple styles to create complex visualizations.
 *
 * Key Concepts:
 * 1. A single Feature can have multiple Style objects (layered rendering)
 * 2. Each Style can have its own geometry (allows placing icons/text at computed positions)
 * 3. Style functions receive the feature AND current resolution (for zoom-based styling)
 * 4. Styles should be cached when possible to avoid GC pressure
 *
 * For polylines with annotations, the pattern is:
 * - Return a base Style with the line stroke
 * - Iterate through segments and add additional Styles for arrows/labels
 * - Each annotation Style uses a Point geometry at the computed position
 *
 * ============================================================================
 */

import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import { Point, LineString } from "ol/geom";
import { Fill, Stroke, Style, Text, Icon } from "ol/style";
import type { Coordinate } from "ol/coordinate";
import type { FeatureLike } from "ol/Feature";
import { range_bearing_from_xy } from "utils/surf-nav/orienteering";

// ============================================================================
// DEMO DATA: Hardcoded polyline coordinates
// ============================================================================
// These coordinates are in EPSG:4326 (longitude, latitude) format
// They will be transformed to the map's projection (IAU2000:30166)

const DEMO_POLYLINE_COORDINATES: Coordinate[] = [
  [29.63431984, -85.4703939],
  [29.76397593068064, -85.46204329622684],
  [29.727464867246578, -85.46345678337404],
  [29.701241448148327, -85.46324110887454],
  [29.69175256885209, -85.46363212404589],
  [29.634322282935877, -85.47039382749496],
  [29.643394230012003, -85.47263253667961],
  [29.64912266524466, -85.47340744582037],
  [29.64341379622914, -85.47266125523868],
  [29.63431984, -85.4703939],
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate the Euclidean distance between two projected coordinates.
 *
 * IMPORTANT: This works with projected coordinates (meters in this case).
 * For geographic coordinates, you would need Haversine or similar.
 * Since our map projection is in meters, this gives us the correct distance.
 *
 * @param start - Starting coordinate [x, y] in projection units
 * @param end - Ending coordinate [x, y] in projection units
 * @returns Distance in projection units (meters for our lunar projection)
 */
function calculateDistance(start: Coordinate, end: Coordinate): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate the midpoint between two coordinates.
 *
 * Used for placing arrows and labels at the center of each segment.
 *
 * @param start - Starting coordinate [x, y]
 * @param end - Ending coordinate [x, y]
 * @returns Midpoint coordinate [x, y]
 */
function calculateMidpoint(start: Coordinate, end: Coordinate): Coordinate {
  return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
}

/**
 * Calculate the rotation angle for a segment (in radians).
 *
 * This is used to rotate arrow icons to point in the direction of travel.
 * The rotation is calculated from the positive X-axis (East).
 *
 * @param start - Starting coordinate [x, y]
 * @param end - Ending coordinate [x, y]
 * @returns Rotation angle in radians
 */
function calculateRotation(start: Coordinate, end: Coordinate): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  return Math.atan2(dy, dx);
}

// ============================================================================
// STYLE FUNCTION FACTORY
// ============================================================================

/**
 * Creates a style function for rendering polylines with directional arrows
 * and distance labels.
 *
 * PATTERN: Style Function Factory
 * --------------------------------
 * We use a factory function that returns the actual style function.
 * This allows us to:
 * 1. Maintain a style cache in closure scope
 * 2. Pre-create static styles that don't change
 * 3. Keep configuration in the factory scope
 *
 * The returned style function follows OpenLayers convention:
 * (feature: FeatureLike, resolution: number) => Style | Style[] | undefined
 *
 * @param options Configuration options for the polyline style
 * @returns Style function compatible with OpenLayers VectorLayer
 */
function createPolylineStyleFunction(options: {
  lineColor?: string;
  lineWidth?: number;
  arrowColor?: string;
  labelFont?: string;
  labelFill?: string;
  labelStroke?: string;
  showLabelsRef?: { current: boolean };
}) {
  // Merge with defaults
  const config = {
    lineColor: options.lineColor ?? "#3388ff",
    lineWidth: options.lineWidth ?? 3,
    arrowColor: options.arrowColor ?? "#3388ff",
    labelFont: options.labelFont ?? "bold 12px sans-serif",
    labelFill: options.labelFill ?? "#ffffff",
    labelStroke: options.labelStroke ?? "#000000",
    showLabelsRef: options.showLabelsRef,
  };

  // ========================================================================
  // STYLE CACHING
  // ========================================================================
  // Pre-create the base line style since it doesn't change per-segment.
  // This reduces garbage collection pressure during rendering.

  const baseLineStyle = new Style({
    stroke: new Stroke({
      color: config.lineColor,
      width: config.lineWidth,
      lineCap: "round",
      lineJoin: "round",
    }),
  });

  // Pre-create the chevron SVG data URI (doesn't change per-segment)
  const chevronSvg = `
    <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
      <path d="M 6 4 L 14 10 L 6 16" fill="none" stroke="${config.arrowColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  const chevronDataUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(chevronSvg);

  // ========================================================================
  // THE STYLE FUNCTION
  // ========================================================================
  // This is called by OpenLayers for each feature that needs to be rendered.
  // It receives the feature and the current view resolution.

  return function polylineStyleFunction(feature: FeatureLike, _resolution: number): Style[] {
    const geometry = feature.getGeometry();

    // Only handle LineString geometries
    if (!geometry || geometry.getType() !== "LineString") {
      return [baseLineStyle];
    }

    const lineString = geometry as LineString;
    const coordinates = lineString.getCoordinates();

    // Start with the base line style
    const styles: Style[] = [baseLineStyle];

    // ======================================================================
    // SEGMENT ITERATION
    // ======================================================================
    // Iterate through each segment of the polyline to add arrows and labels.
    // A segment is defined by two consecutive coordinates.

    for (let i = 0; i < coordinates.length - 1; i++) {
      const start = coordinates[i];
      const end = coordinates[i + 1];

      // Calculate segment properties
      const midpoint = calculateMidpoint(start, end);
      const distance = calculateDistance(start, end);
      const rotation = calculateRotation(start, end);

      // Skip very short segments (less than 1 meter)
      if (distance < 1) {
        continue;
      }

      // ====================================================================
      // DIRECTIONAL ARROW STYLE (CHEVRON)
      // ====================================================================
      // Use an SVG chevron (">") instead of a triangle for a more modern look.
      // The chevron is created as an SVG data URI (pre-created above) and
      // rendered as an Icon. Rotation is applied to point in the direction
      // of travel.
      //
      // Note: We can't effectively cache these styles because each segment
      // has a different midpoint geometry, so we create a new Style per segment.

      const arrowStyle = new Style({
        geometry: new Point(midpoint),
        image: new Icon({
          src: chevronDataUri,
          // Rotation: atan2 gives angle from X-axis, chevron points right (0°)
          // So we just use -rotation to align with segment direction
          rotation: -rotation,
          scale: 1,
          anchor: [0.5, 0.5],
          anchorXUnits: "fraction",
          anchorYUnits: "fraction",
        }),
      });

      styles.push(arrowStyle);

      // ====================================================================
      // DISTANCE LABEL STYLE
      // ====================================================================
      // Display the segment distance in meters, rounded to nearest integer.
      // The label is positioned to the RIGHT of the arrow, rotating with it.
      //
      // Algorithm:
      // 1. Arrow points in direction of 'rotation' (angle from positive X-axis)
      // 2. To place label to the right: rotate 90° clockwise from arrow direction
      // 3. Clockwise rotation = subtract π/2 from current rotation
      // 4. Calculate offset position using this perpendicular angle

      // Only add labels if showLabels is enabled (check ref dynamically)
      if (config.showLabelsRef?.current !== false) {
        // Calculate position to the right of the arrow (perpendicular)
        // Rotate 90° clockwise (subtract π/2) from the arrow's direction
        const labelOffsetAngle = rotation - Math.PI / 2;
        const labelOffsetDistance = 20; // pixels from arrow center

        // Calculate X and Y offsets
        // Note: Y is negated because screen Y-axis points down, but math Y-axis points up
        const labelOffsetX = Math.cos(labelOffsetAngle) * labelOffsetDistance;
        const labelOffsetY = -Math.sin(labelOffsetAngle) * labelOffsetDistance;

        const labelStyle = new Style({
          geometry: new Point(midpoint),
          text: new Text({
            text: `${Math.round(distance)}m`,
            font: config.labelFont,
            fill: new Fill({ color: config.labelFill }),
            stroke: new Stroke({
              color: config.labelStroke,
              width: 3,
            }),
            // Position label to the right of arrow, rotating with it
            offsetX: labelOffsetX,
            offsetY: labelOffsetY,
            textAlign: "center",
            textBaseline: "middle",
          }),
        });

        styles.push(labelStyle);
      }

      // ====================================================================
      // BEARING LABEL ON THE LINE SEGMENT
      // ====================================================================
      // Display the "to" bearing on the line, showing the heading direction
      // TO the next node. Placed directly on the line at a calculated point,
      // with text rotated to follow the line and always right-side up.

      if (config.showLabelsRef?.current !== false) {
        // Use surf-nav's range_bearing_from_xy (x_dest, y_dest, x_source, y_source)
        const bearing = range_bearing_from_xy(end[0], end[1], start[0], start[1]).bearing;

        // Calculate a point ON the line, offset from start by a fraction of the segment
        // Use 15% of the segment length to position the bearing label
        const bearingFraction = 0.15;
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const bearingPointX = start[0] + dx * bearingFraction;
        const bearingPointY = start[1] + dy * bearingFraction;

        // Calculate text rotation to align with the line
        // OpenLayers text rotation is clockwise, in radians
        let textRotation = -rotation;

        // Determine if text would be upside down (line going generally leftward)
        const normalizedRotation = ((rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const isUpsideDown =
          normalizedRotation > Math.PI / 2 && normalizedRotation < (3 * Math.PI) / 2;

        // Arrow points in direction of travel
        let arrowChar: string;
        if (isUpsideDown) {
          textRotation = -rotation + Math.PI; // Flip text 180°
          arrowChar = "◄"; // Points left (appears as travel direction after flip)
        } else {
          arrowChar = "►"; // Points right (travel direction)
        }

        const bearingText = `${arrowChar} ${Math.round(bearing)}°`;

        const bearingStyle = new Style({
          geometry: new Point([bearingPointX, bearingPointY]),
          text: new Text({
            text: bearingText,
            font: "bold 11px sans-serif",
            fill: new Fill({ color: "#ffcc00" }), // Yellow/gold for bearing
            stroke: new Stroke({
              color: "#000000",
              width: 3,
            }),
            offsetX: 0,
            offsetY: 0,
            textAlign: "center",
            textBaseline: "middle",
            rotation: textRotation,
          }),
        });

        styles.push(bearingStyle);
      }
    }

    return styles;
  };
}

// ============================================================================
// LAYER CREATION UTILITY
// ============================================================================

/**
 * Creates a VectorLayer with a demo polyline for testing/demonstration.
 *
 * @param coordinates - Array of coordinates in EPSG:4326 format [lon, lat]
 * @param projectionCode - Target projection code (e.g., "IAU2000:30166")
 * @param proj4Transform - proj4 transform function
 * @param options - Styling options for the polyline
 * @returns VectorLayer configured with the polyline
 */
export function createDemoPolylineLayer(
  coordinates: Coordinate[],
  projectionCode: string,
  proj4Transform: (fromProj: string, toProj: string, coord: Coordinate) => Coordinate,
  options?: {
    lineColor?: string;
    lineWidth?: number;
    arrowColor?: string;
    labelFont?: string;
    labelFill?: string;
    labelStroke?: string;
    showLabelsRef?: { current: boolean };
  }
): VectorLayer<VectorSource> {
  // Transform coordinates from EPSG:4326 to the target projection
  const transformedCoordinates = coordinates.map((coord) =>
    proj4Transform("EPSG:4326", projectionCode, coord)
  );

  // Create the polyline feature
  const polylineFeature = new Feature({
    geometry: new LineString(transformedCoordinates),
    name: "Demo Traverse",
    description: "Sample polyline demonstrating OpenLayers styling",
  });

  // Create vector source and add the feature
  const vectorSource = new VectorSource({
    features: [polylineFeature],
  });

  // Create and return the layer with our custom style function
  return new VectorLayer({
    source: vectorSource,
    style: createPolylineStyleFunction(options || {}),
    declutter: false, // Decluttering disabled - using manual toggle instead
    zIndex: 7,
    visible: false, // Start hidden, controlled by checkbox
    properties: {
      name: "Demo Polyline",
    },
  });
}

// Export the demo coordinates for use in other components
export { DEMO_POLYLINE_COORDINATES };
