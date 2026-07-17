/**
 * Place Label Styles
 * For example: named lunar surface features (craters, mountains, rilles, etc.)
 *
 * Creates a style function for rendering draggable place-name labels
 * with a tether line back to the original anchor point if moved.
 *
 * The style function:
 * 1. Draws a semi-transparent text box using an off-screen canvas rendered as an Icon.
 * 2. When the label has been dragged away from its original position, composites
 *    a dashed tether line + anchor dot + label into a single Icon so that
 *    OpenLayers' decluttering hides the entire assembly atomically.
 */

import type Feature from "ol/Feature";
import type Point from "ol/geom/Point";
import { Style, Icon } from "ol/style";

// Colors shared between the base label and the tether
const LABEL_COLOR = "rgba(133, 255, 129, 0.8)";
const LABEL_COLOR_SOLID = "rgba(133, 255, 129, 0.9)";

/**
 * Create a style function for place-name labels.
 *
 * @returns OL style function suitable for a VectorLayer with `declutter: true`
 */
export function createPlaceLabelStyle() {
  const styleCache: { [key: string]: Style } = {};

  // Reusable off-screen canvas context for text measurement
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (measureCtx) measureCtx.font = "bold 13px 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  return (feature: Feature, resolution: number): Style | Style[] | undefined => {
    const name = feature.get("Feat Name") || feature.get("name");
    if (!name || !measureCtx) return undefined;

    // 1. Geometry & original coordinates
    const geometry = feature.getGeometry();
    if (!geometry || geometry.getType() !== "Point") return undefined;

    const currentCoordinates = (geometry as Point).getCoordinates();
    const originalCoordinates = feature.get("originalCoordinates");

    // Determine if the label has been dragged (distance > 1 meter)
    let isDragged = false;
    if (originalCoordinates) {
      const dx = currentCoordinates[0] - originalCoordinates[0];
      const dy = currentCoordinates[1] - originalCoordinates[1];
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        isDragged = true;
      }
    }

    // 2. Build / retrieve the base label style (text box)
    if (!styleCache[name]) {
      const textMetrics = measureCtx.measureText(name);
      const textWidth = textMetrics.width;
      const textHeight = 14;
      const padding = 6;
      const canvasWidth = Math.ceil(textWidth + padding * 4);
      const canvasHeight = Math.ceil(textHeight + padding * 2);

      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;

        ctx.font = "bold 13px 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";

        // Background box
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.beginPath();
        ctx.roundRect(4, 4, canvasWidth - 8, canvasHeight - 8, 4);
        ctx.fill();

        // Text
        ctx.fillStyle = LABEL_COLOR_SOLID;
        ctx.fillText(name, centerX, centerY);
      }

      styleCache[name] = new Style({
        image: new Icon({
          img: canvas,
          // anchor [0.5, 1.0] = bottom-center of canvas at the feature point → label appears above
          anchor: [0.5, 1.0],
          anchorXUnits: "fraction",
          anchorYUnits: "fraction",
        }),
        zIndex: 100,
      });
    }

    const baseStyle = styleCache[name];

    // 3. If dragged, composite label + tether line + anchor dot into one Icon
    //    so decluttering hides the whole assembly at once.
    if (isDragged && originalCoordinates) {
      const labelIcon = baseStyle.getImage() as Icon;
      const labelImg = labelIcon.getImage(1) as HTMLCanvasElement;
      if (!labelImg) return baseStyle;

      // Vector from label → anchor in map units, converted to pixels
      const dxMap = originalCoordinates[0] - currentCoordinates[0];
      const dyMap = originalCoordinates[1] - currentCoordinates[1];
      const dxPx = dxMap / resolution;
      const dyPx = -dyMap / resolution; // screen Y is inverted

      const labelHalfW = labelImg.width / 2;
      const labelHalfH = labelImg.height / 2;
      const dotRadius = 4;
      const pad = 4;

      // Bounding box containing both label and dot (relative to label centre 0,0)
      const minX = Math.min(-labelHalfW, dxPx - dotRadius);
      const maxX = Math.max(labelHalfW, dxPx + dotRadius);
      const minY = Math.min(-labelHalfH, dyPx - dotRadius);
      const maxY = Math.max(labelHalfH, dyPx + dotRadius);

      const canvasW = Math.ceil(maxX - minX + pad * 2);
      const canvasH = Math.ceil(maxY - minY + pad * 2);

      // Origin in the new canvas corresponding to label centre
      const originX = -minX + pad;
      const originY = -minY + pad;

      const compositeCanvas = document.createElement("canvas");
      compositeCanvas.width = canvasW;
      compositeCanvas.height = canvasH;
      const ctx = compositeCanvas.getContext("2d");

      if (ctx) {
        // Dashed tether line
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(originX + dxPx, originY + dyPx);
        ctx.strokeStyle = LABEL_COLOR;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Anchor dot
        ctx.beginPath();
        ctx.arc(originX + dxPx, originY + dyPx, 3, 0, 2 * Math.PI);
        ctx.fillStyle = LABEL_COLOR_SOLID;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label image centred at origin
        ctx.drawImage(labelImg, originX - labelHalfW, originY - labelHalfH);
      }

      return new Style({
        image: new Icon({
          img: compositeCanvas,
          anchor: [originX / canvasW, originY / canvasH],
          anchorXUnits: "fraction",
          anchorYUnits: "fraction",
        }),
        zIndex: 100,
      });
    }

    return baseStyle;
  };
}
