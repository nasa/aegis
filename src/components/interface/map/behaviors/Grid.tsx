/**
 * Grid — behavior component that draws the mission grid lines and labels.
 *
 * Reads grid data from the global grid module variable and renders lines as
 * OL LineString features on a dedicated VectorLayer. Grid density adapts
 * based on the visible portion (zoom level) to avoid rendering thousands of lines.
 *
 * Returns null — headless behavior component.
 */

import { useEffect, useRef, useCallback } from "react";
import Feature from "ol/Feature";
import { LineString, Point } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Stroke, Style, Fill, Text } from "ol/style";
import type { EventsKey } from "ol/events";
import { unByKey } from "ol/Observable";

import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { globalGrid } from "utils/mapping/grid";
import { adjustGridIndex, findClosestPointInGlobalGrid } from "utils/mapping/geoMath";

import { useMapContext } from "../MapProvider";
import { MODE_CONFIGS } from "../utils/modeConfig";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { Z_INDEX } from "../utils/zIndex";

export function Grid(): null {
  const { map, mode } = useMapContext();
  const config = MODE_CONFIGS[mode];
  const { toMapCoord, toAegisPoint } = useCoordConverters();

  const planetRadius = useMissionDocSelector((doc) => doc.planetRadius, refEqual) as
    | number
    | undefined;

  const selectedPresetUuid = useAppSelector((s) => s.preset.selectedPresetUuid, refEqual);
  const mapGridControl = useAppSelector(
    (s) => s.preset.presets.find((p) => p.uuid === selectedPresetUuid)?.mapGridControl,
    deepEqual
  ) as MapGridControl | undefined;

  // Refs
  const lineLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const labelLayerRef = useRef<VectorLayer<VectorSource> | null>(null);

  // --- Create layers once ---
  useEffect(() => {
    const lineSource = new VectorSource();
    const lineLayer = new VectorLayer({
      source: lineSource,
      zIndex: Z_INDEX.GRID_LINES,
    });

    const labelSource = new VectorSource();
    const labelLayer = new VectorLayer({
      source: labelSource,
      zIndex: Z_INDEX.GRID_LABELS,
    });

    map.addLayer(lineLayer);
    map.addLayer(labelLayer);
    lineLayerRef.current = lineLayer;
    labelLayerRef.current = labelLayer;

    return () => {
      map.removeLayer(lineLayer);
      map.removeLayer(labelLayer);
      lineLayerRef.current = null;
      labelLayerRef.current = null;
    };
  }, [map]);

  // --- Rebuild grid on view changes ---
  const rebuildGrid = useCallback(() => {
    const lineLayer = lineLayerRef.current;
    const labelLayer = labelLayerRef.current;
    if (!lineLayer || !labelLayer) return;
    if (!globalGrid?.coordinates || !planetRadius || !mapGridControl?.visible) {
      lineLayer.getSource()!.clear();
      labelLayer.getSource()!.clear();
      return;
    }

    const gridCoordinates = globalGrid.coordinates;
    const numRows = gridCoordinates.length;
    const numCols = gridCoordinates[0].length;

    // Compute visible bounds in AEGISPoint space
    const extent = map.getView().calculateExtent(map.getSize());
    const topLeft = toAegisPoint([extent[0], extent[3]]);
    const bottomRight = toAegisPoint([extent[2], extent[1]]);

    const startGridIdx = findClosestPointInGlobalGrid(gridCoordinates, topLeft, planetRadius);
    const endGridIdx = findClosestPointInGlobalGrid(gridCoordinates, bottomRight, planetRadius);
    if (!startGridIdx || !endGridIdx) return;

    // Adaptive density: target ~100 visible grid cells at any zoom.
    // ceil ensures we always reduce density rather than straddle a threshold.
    const basePointsShown =
      (endGridIdx.row - startGridIdx.row) * (endGridIdx.col - startGridIdx.col);
    const lineZoomLevel = Math.max(1, Math.ceil(Math.sqrt(basePointsShown / 100)));

    // Labels target ~25 visible, and must be a multiple of lineZoomLevel
    // so label positions are a strict subset of line positions.
    const rawLabelInterval = Math.ceil(Math.sqrt(basePointsShown / 25));
    const labelZoomLevel = Math.ceil(rawLabelInterval / lineZoomLevel) * lineZoomLevel;

    const startIndex = adjustGridIndex(startGridIdx, numRows, numCols, lineZoomLevel, true);
    const endIndex = adjustGridIndex(endGridIdx, numRows, numCols, lineZoomLevel, false);

    const labelStartIndex = adjustGridIndex(startGridIdx, numRows, numCols, labelZoomLevel, true);
    const labelEndIndex = adjustGridIndex(endGridIdx, numRows, numCols, labelZoomLevel, false);

    const gridStyle = mapGridControl.style;

    // --- Lines ---
    const lineSource = lineLayer.getSource()!;
    lineSource.clear();

    const lineStyle = new Style({
      stroke: new Stroke({
        color: gridStyle?.color || "rgba(255,255,255,0.4)",
        width: gridStyle?.weight || 1,
      }),
    });

    // Horizontal lines (rows)
    for (let i = endIndex.row; i >= startIndex.row; i -= lineZoomLevel) {
      if (i < 0 || i >= numRows) continue;
      const startCol = Math.max(0, startIndex.col);
      const endCol = Math.min(numCols - 1, endIndex.col);
      const p1 = gridCoordinates[i][startCol].coordinates;
      const p2 = gridCoordinates[i][endCol].coordinates;
      if (!p1 || !p2) continue;

      const coords = [toMapCoord(p1), toMapCoord(p2)];
      const feature = new Feature(new LineString(coords));
      feature.setStyle(lineStyle);
      lineSource.addFeature(feature);
    }

    // Vertical lines (columns)
    for (let i = startIndex.col; i <= endIndex.col; i += lineZoomLevel) {
      if (i < 0 || i >= numCols) continue;
      const startRow = Math.max(0, startIndex.row);
      const endRow = Math.min(numRows - 1, endIndex.row);
      const p1 = gridCoordinates[startRow][i].coordinates;
      const p2 = gridCoordinates[endRow][i].coordinates;
      if (!p1 || !p2) continue;

      const coords = [toMapCoord(p1), toMapCoord(p2)];
      const feature = new Feature(new LineString(coords));
      feature.setStyle(lineStyle);
      lineSource.addFeature(feature);
    }

    // --- Labels ---
    const labelSource = labelLayer.getSource()!;
    labelSource.clear();

    if (!mapGridControl.labelsVisible || !config.grid.labelsEnabled) return;

    for (let i = labelEndIndex.row; i >= labelStartIndex.row; i -= labelZoomLevel) {
      for (let j = labelStartIndex.col; j <= labelEndIndex.col; j += labelZoomLevel) {
        if (i < 0 || i >= numRows || j < 0 || j >= numCols) continue;
        if (i === startIndex.row && j === endIndex.col) continue;
        const point = gridCoordinates[i][j];
        if (!point.name) continue;

        const coord = toMapCoord(point.coordinates);
        const labelFeature = new Feature(new Point(coord));
        labelFeature.setStyle(
          new Style({
            text: new Text({
              text: point.name,
              // bold
              font: "12px sans-serif",

              fill: new Fill({
                color: "#000",
              }),
              backgroundFill: new Fill({
                color: "rgba(255, 255, 255, 0.7)",
              }),
              backgroundStroke: new Stroke({
                color: "rgba(255, 255, 255, 0.7)",
                width: 1,
              }),
              padding: [3, 1, 0, 3],
              offsetX: 5,
              offsetY: -8,
              textAlign: "left",
            }),
          })
        );
        labelSource.addFeature(labelFeature);
      }
    }
  }, [map, mapGridControl, planetRadius, toMapCoord, toAegisPoint, config.grid.labelsEnabled]);

  // --- Listen for view changes to rebuild grid ---
  useEffect(() => {
    rebuildGrid();

    const view = map.getView();
    const keys: EventsKey[] = [
      view.on("change:center", rebuildGrid),
      view.on("change:resolution", rebuildGrid),
    ];

    return () => {
      for (const key of keys) unByKey(key);
    };
  }, [map, rebuildGrid]);

  return null;
}
