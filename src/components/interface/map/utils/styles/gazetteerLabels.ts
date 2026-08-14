import type Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { Style, Icon } from "ol/style";

const LABEL_FONT = "bold 13px sans-serif";

export function getGazetteerLabel(feature: Feature): string | undefined {
  const label = feature.get("gazetteerLabel") ?? feature.get("label") ?? feature.get("Feat Name");
  return typeof label === "string" && label.trim().length > 0 ? label : undefined;
}

export function createGazetteerLabelStyle(style: MapSublayerStyle) {
  const styleCache = new Map<string, Style>();
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (measureContext) measureContext.font = LABEL_FONT;

  return (feature: Feature, resolution: number): Style | undefined => {
    const name = getGazetteerLabel(feature);
    const geometry = feature.getGeometry();
    if (!style.showLabels || !name || !measureContext || !(geometry instanceof Point)) {
      return undefined;
    }

    const currentCoordinate = geometry.getCoordinates();
    const anchorCoordinate = feature.get("originalCoordinates") as [number, number] | undefined;
    const isMoved =
      anchorCoordinate != null &&
      (Math.abs(currentCoordinate[0] - anchorCoordinate[0]) > 1 ||
        Math.abs(currentCoordinate[1] - anchorCoordinate[1]) > 1);

    const labelColor = style.labelColor ?? "#ffffff";
    const labelHaloColor = style.labelHaloColor ?? "#000000";
    const labelHaloWidth = style.labelHaloWidth ?? 2;
    const labelHaloOpacity = style.labelHaloOpacity ?? 0.2;
    const styleCacheKey = `${name}|${labelColor}|${labelHaloColor}|${labelHaloWidth}|${labelHaloOpacity}`;
    let baseStyle = styleCache.get(styleCacheKey);
    if (!baseStyle) {
      const padding = 6;
      const width = Math.ceil(measureContext.measureText(name).width + padding * 4);
      const height = 26;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");

      if (!context) return undefined;
      context.font = LABEL_FONT;
      context.textBaseline = "middle";
      context.textAlign = "center";
      context.strokeStyle = labelHaloColor;
      context.globalAlpha = labelHaloOpacity;
      context.lineWidth = labelHaloWidth * 2;
      context.strokeText(name, width / 2, height / 2);
      context.globalAlpha = 1;
      context.fillStyle = labelColor;
      context.fillText(name, width / 2, height / 2);

      baseStyle = new Style({
        image: new Icon({
          img: canvas,
          anchor: [0.5, 1],
          anchorXUnits: "fraction",
          anchorYUnits: "fraction",
        }),
        zIndex: 100,
      });
      styleCache.set(styleCacheKey, baseStyle);
    }

    if (!isMoved || !anchorCoordinate) return baseStyle;

    const labelImage = (baseStyle.getImage() as Icon).getImage(1) as HTMLCanvasElement;
    const dxPx = (anchorCoordinate[0] - currentCoordinate[0]) / resolution;
    const dyPx = -(anchorCoordinate[1] - currentCoordinate[1]) / resolution;
    const labelHalfWidth = labelImage.width / 2;
    const labelHalfHeight = labelImage.height / 2;
    const dotRadius = 4;
    const padding = 4;
    const minX = Math.min(-labelHalfWidth, dxPx - dotRadius);
    const maxX = Math.max(labelHalfWidth, dxPx + dotRadius);
    const minY = Math.min(-labelHalfHeight, dyPx - dotRadius);
    const maxY = Math.max(labelHalfHeight, dyPx + dotRadius);
    const width = Math.ceil(maxX - minX + padding * 2);
    const height = Math.ceil(maxY - minY + padding * 2);
    const originX = -minX + padding;
    const originY = -minY + padding;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) return baseStyle;
    context.beginPath();
    context.moveTo(originX, originY);
    context.lineTo(originX + dxPx, originY + dyPx);
    context.strokeStyle = "rgb(0, 0, 0)";
    context.lineWidth = 1.5;
    context.setLineDash([4, 4]);
    context.stroke();
    context.strokeStyle = "rgb(255, 255, 255)";
    context.lineDashOffset = 4;
    context.stroke();
    context.setLineDash([]);
    context.lineDashOffset = 0;
    context.beginPath();
    context.arc(originX + dxPx, originY + dyPx, 3, 0, 2 * Math.PI);
    context.fillStyle = "rgb(255, 255, 255)";
    context.fill();
    context.strokeStyle = "rgb(0, 0, 0)";
    context.lineWidth = 1;
    context.stroke();
    context.drawImage(labelImage, originX - labelHalfWidth, originY - labelHalfHeight);

    return new Style({
      image: new Icon({
        img: canvas,
        anchor: [originX / width, originY / height],
        anchorXUnits: "fraction",
        anchorYUnits: "fraction",
      }),
      zIndex: 100,
    });
  };
}
