import { getPlanetRadius } from "utils/planets";
/**
 * Draws the mission grid lines and labels.
 *
 * Draws either the server-file grid (a loaded coordinate lattice) or the dynamic grid of the
 * mission's grid system (`createLgrsRenderPlan`: lunar LGRS, or Earth UTM/UPS in ACC or MGRS
 * labels) as OL features on dedicated VectorLayers.
 * Grid density adapts to the visible portion (zoom level) to avoid rendering thousands of lines.
 *
 * The dashboard publishes its spacing to `DashboardBoundsProvider`. The minimap
 * inherits that spacing and coarsens it as needed for legibility.
 *
 * This headless behavior returns null.
 */

import { useEffect, useRef, useCallback, useMemo } from "react";
import Feature from "ol/Feature";
import { LineString, Point } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import type { EventsKey } from "ol/events";
import { unByKey } from "ol/Observable";

import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getGridBaseSpacingMeters } from "utils/mapping/grid";
import {
  fileGridStride,
  gridCellWidth,
  GRID_LABEL_MIN_PX,
  MINIMAP_MIN_LINE_PX,
  nominalGridInterval,
} from "utils/mapping/gridSpacing";
import { adjustGridIndex, findClosestPointInGlobalGrid } from "utils/mapping/geoMath";
import { getLgrsCompatibility } from "utils/lgrs/compatibility";
import { createLgrsRenderPlan } from "@bfeist/planetary-grid-reference/grid";
import { getLgrsGridBinding } from "@bfeist/planetary-grid-reference/grid";

import { useMapContext } from "../MapProvider";
import { useMapMenuContext } from "../MapMenuProvider";
import {
  useOptionalDashboardBoundsContext,
  type GridSpacingMeters,
} from "../DashboardBoundsProvider";
import { MODE_CONFIGS } from "../utils/modeConfig";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { useMissionGridSystem } from "../hooks/useMissionGridSystem";
import { useResolvedMissionGrid } from "../hooks/useResolvedMissionGrid";
import { createGridLabelStyleFn, createGridLineStyles, gridLabelFits } from "../utils/styles/grid";
import {
  getGroundMetersPerPixel,
  GRID_INTERVAL_PROPERTY,
  type DrawnGridInterval,
} from "../utils/mapScale";
import { Z_INDEX } from "../utils/zIndex";

export function Grid(): null {
  const { map, mode } = useMapContext();
  const config = MODE_CONFIGS[mode];
  const { toMapCoord, toAegisPoint } = useCoordConverters();
  const { gridSpacingMode, gridLabelInterval } = useMapMenuContext();
  const resolvedGrid = useResolvedMissionGrid();

  // Grid spacing shared by the dashboard and minimap.
  const dashboardBounds = useOptionalDashboardBoundsContext();
  const publishSpacing = mode === "dashboard" ? dashboardBounds?.setGridSpacing : undefined;
  const inheritedSpacing = mode === "minimap" ? (dashboardBounds?.gridSpacing ?? null) : null;

  const projectionConfig = useMissionDocSelector(
    (doc) => ({
      id: doc.id,
      planet: doc.planet,
      projIsCustom: doc.projIsCustom,
      projEpsg: doc.projEpsg,
      projProj4String: doc.projProj4String,
    }),
    deepEqual
  );
  const planetRadius = getPlanetRadius(projectionConfig);
  // One instance per `system.key`, so the binding memo is keyed by projection and system.
  const gridSystem = useMissionGridSystem();
  const gridBinding = useMemo(() => {
    if (!projectionConfig || !gridSystem) return null;
    const compatibility = getLgrsCompatibility(gridSystem, projectionConfig);
    return compatibility.compatible
      ? getLgrsGridBinding(compatibility.projection, gridSystem)
      : null;
  }, [projectionConfig, gridSystem]);

  const selectedPresetUuid = useAppSelector((s) => s.preset.selectedPresetUuid, refEqual);
  const mapGridControl = useMissionDocSelector(
    (m) => m.presets?.[selectedPresetUuid]?.mapGridControl,
    deepEqual
  ) as MapGridControl | undefined;

  const labelStyle = useMemo(
    () => createGridLabelStyleFn(mapGridControl?.style, config.grid.labelFontSize),
    [mapGridControl?.style, config.grid.labelFontSize]
  );

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
      declutter: "mission-grid-labels",
    });

    map.addLayer(lineLayer);
    map.addLayer(labelLayer);
    lineLayerRef.current = lineLayer;
    labelLayerRef.current = labelLayer;

    return () => {
      map.removeLayer(lineLayer);
      map.removeLayer(labelLayer);
      map.set(GRID_INTERVAL_PROPERTY, null);
      lineLayerRef.current = null;
      labelLayerRef.current = null;
    };
  }, [map]);

  // --- Rebuild grid on view changes ---
  const rebuildGrid = useCallback(() => {
    const lineLayer = lineLayerRef.current;
    const labelLayer = labelLayerRef.current;
    if (!lineLayer || !labelLayer) return;

    const drawGrid = (): GridSpacingMeters | "lgrs-zones" | null => {
      const lineSource = lineLayer.getSource()!;
      const labelSource = labelLayer.getSource()!;
      lineSource.clear();
      labelSource.clear();
      if (!mapGridControl?.visible || resolvedGrid.kind === "none") return null;

      const lineStyles = createGridLineStyles(mapGridControl.style);
      const view = map.getView();
      const resolution = view.getResolution();
      if (!resolution || !view.getCenter()) return null;
      const extent = view.calculateExtent(map.getSize());
      const labelsEnabled = !!mapGridControl.labelsVisible && config.grid.labelsEnabled;

      if (resolvedGrid.kind === "dynamic-lgrs") {
        if (!gridBinding) return null;
        const systemKey = gridBinding.system.key;
        // A spacing published under another system (e.g. mid scheme switch) does not apply.
        const inheritedLgrsSpacing =
          inheritedSpacing?.systemKey === undefined || inheritedSpacing.systemKey === systemKey
            ? inheritedSpacing
            : null;
        const plan = createLgrsRenderPlan({
          binding: gridBinding,
          extent: [extent[0], extent[1], extent[2], extent[3]],
          resolution,
          gridSpacingMode,
          gridLabelInterval,
          labelsVisible: labelsEnabled,
          labelFits: (text, cellPixels) => gridLabelFits(labelStyle(text, false), cellPixels),
          inheritedSpacing: inheritedLgrsSpacing,
        });

        const lineFeatures = plan.lines.map((line) => {
          const feature = new Feature(new LineString(line.coordinates, "XY"));
          feature.setStyle(line.kind === "seam" ? lineStyles.seam : lineStyles.grid);
          return feature;
        });
        const labelFeatures = plan.labels.map(({ coordinate, text, centered }) => {
          const feature = new Feature(new Point(coordinate));
          feature.setStyle(labelStyle(text, centered));
          return feature;
        });
        lineSource.addFeatures(lineFeatures);
        labelSource.addFeatures(labelFeatures);
        if (plan.tier === "zone") return lineFeatures.length ? "lgrs-zones" : null;
        if (!plan.lines.some((line) => line.kind === "grid")) return null;
        return { line: plan.lineSpacing, label: plan.labelSpacing, systemKey };
      }

      if (!planetRadius) return null;
      const gridCoordinates = resolvedGrid.grid.coordinates;
      const numRows = gridCoordinates.length;
      const numCols = gridCoordinates[0]?.length;
      if (!numCols) return null;

      // Compute visible bounds in AEGISPoint space
      const topLeft = toAegisPoint([extent[0], extent[3]]);
      const bottomRight = toAegisPoint([extent[2], extent[1]]);

      const startGridIdx = findClosestPointInGlobalGrid(gridCoordinates, topLeft, planetRadius);
      const endGridIdx = findClosestPointInGlobalGrid(gridCoordinates, bottomRight, planetRadius);
      if (!startGridIdx || !endGridIdx) return null;

      // Base spacing (metres between adjacent grid lines), derived from the grid
      // geometry (see getGridBaseSpacingMeters).
      const baseSpacing = getGridBaseSpacingMeters(resolvedGrid.grid, planetRadius);

      const basePointsShown =
        (Math.abs(endGridIdx.row - startGridIdx.row) + 1) *
        (Math.abs(endGridIdx.col - startGridIdx.col) + 1);
      const metersPerPixel = getGroundMetersPerPixel(view, planetRadius) || 0;
      const lineMinimum = inheritedSpacing
        ? Math.max(inheritedSpacing.line, MINIMAP_MIN_LINE_PX * metersPerPixel)
        : gridSpacingMode === "auto"
          ? Math.max(
              (Math.sqrt(basePointsShown) / 10) * baseSpacing,
              labelsEnabled ? GRID_LABEL_MIN_PX * metersPerPixel : 0
            )
          : gridSpacingMode;
      const inheritedStride =
        inheritedSpacing && baseSpacing > 0
          ? Math.max(1, Math.round(inheritedSpacing.line / baseSpacing))
          : 1;
      const lineZoomLevel =
        baseSpacing > 0 ? fileGridStride(baseSpacing, lineMinimum, inheritedStride) : 1;

      const labelMinimum =
        inheritedSpacing?.label ??
        (gridSpacingMode === "auto"
          ? (Math.sqrt(basePointsShown) / 5) * baseSpacing
          : gridLabelInterval === "auto"
            ? lineZoomLevel * baseSpacing
            : gridLabelInterval);
      const labelZoomLevel =
        baseSpacing > 0 ? fileGridStride(baseSpacing, labelMinimum, lineZoomLevel) : lineZoomLevel;

      const spacing: GridSpacingMeters | null =
        baseSpacing > 0
          ? { line: lineZoomLevel * baseSpacing, label: labelZoomLevel * baseSpacing }
          : null;

      const startIndex = adjustGridIndex(startGridIdx, numRows, numCols, lineZoomLevel, true);
      const endIndex = adjustGridIndex(endGridIdx, numRows, numCols, lineZoomLevel, false);
      const lineStart = adjustGridIndex(startGridIdx, numRows, numCols, 1, true);
      const lineEnd = adjustGridIndex(endGridIdx, numRows, numCols, 1, false);

      const labelStartIndex = adjustGridIndex(startGridIdx, numRows, numCols, labelZoomLevel, true);
      const labelEndIndex = adjustGridIndex(endGridIdx, numRows, numCols, labelZoomLevel, false);

      // --- Lines ---
      // Horizontal lines (rows)
      for (let i = endIndex.row; i >= startIndex.row; i -= lineZoomLevel) {
        if (i < 0 || i >= numRows) continue;
        const p1 = gridCoordinates[i][lineStart.col]?.coordinates;
        const p2 = gridCoordinates[i][lineEnd.col]?.coordinates;
        if (!p1 || !p2) continue;

        const coords = [toMapCoord(p1), toMapCoord(p2)];
        const feature = new Feature(new LineString(coords));
        feature.setStyle(lineStyles.grid);
        lineSource.addFeature(feature);
      }

      // Vertical lines (columns)
      for (let i = startIndex.col; i <= endIndex.col; i += lineZoomLevel) {
        if (i < 0 || i >= numCols) continue;
        const p1 = gridCoordinates[lineStart.row]?.[i]?.coordinates;
        const p2 = gridCoordinates[lineEnd.row]?.[i]?.coordinates;
        if (!p1 || !p2) continue;

        const coords = [toMapCoord(p1), toMapCoord(p2)];
        const feature = new Feature(new LineString(coords));
        feature.setStyle(lineStyles.grid);
        lineSource.addFeature(feature);
      }

      // --- Labels ---
      if (lineSource.isEmpty()) return null;
      if (!labelsEnabled) return spacing;

      for (let i = labelEndIndex.row; i >= labelStartIndex.row; i -= labelZoomLevel) {
        for (let j = labelStartIndex.col; j <= labelEndIndex.col; j += labelZoomLevel) {
          if (i < 0 || i >= numRows || j < 0 || j >= numCols) continue;
          if (i === startIndex.row && j === endIndex.col) continue;
          const point = gridCoordinates[i][j];
          if (!point.name) continue;

          const coord = toMapCoord(point.coordinates);
          const style = labelStyle(point.name, false);
          const rowNeighbor =
            gridCoordinates[i + lineZoomLevel]?.[j] ?? gridCoordinates[i - lineZoomLevel]?.[j];
          const colNeighbor =
            gridCoordinates[i][j + lineZoomLevel] ?? gridCoordinates[i][j - lineZoomLevel];
          if (!rowNeighbor?.coordinates || !colNeighbor?.coordinates) continue;
          const cellPixels =
            gridCellWidth(
              coord,
              toMapCoord(rowNeighbor.coordinates),
              toMapCoord(colNeighbor.coordinates)
            ) / resolution;
          if (!gridLabelFits(style, cellPixels)) continue;
          const labelFeature = new Feature(new Point(coord));
          labelFeature.setStyle(style);
          labelSource.addFeature(labelFeature);
        }
      }

      return spacing;
    };

    // Note the separate statement: `publishSpacing?.(drawGrid())` would skip the
    // draw entirely on maps that don't publish.
    const spacing = drawGrid();
    const interval: DrawnGridInterval =
      spacing === "lgrs-zones" ? spacing : spacing && nominalGridInterval(spacing.line);
    map.set(GRID_INTERVAL_PROPERTY, interval);
    // The dashboard publishes what it drew so the minimap can mirror it.
    publishSpacing?.(spacing === "lgrs-zones" ? null : spacing);
  }, [
    map,
    mapGridControl,
    planetRadius,
    gridBinding,
    resolvedGrid,
    toMapCoord,
    toAegisPoint,
    config.grid.labelsEnabled,
    labelStyle,
    gridSpacingMode,
    gridLabelInterval,
    inheritedSpacing,
    publishSpacing,
  ]);

  // --- Listen for view changes to rebuild grid ---
  useEffect(() => {
    rebuildGrid();

    const view = map.getView();
    let animationFrame: number | null = null;
    const scheduleRebuild = () => {
      if (animationFrame !== null) return;
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        rebuildGrid();
      });
    };
    const finalRebuild = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
      rebuildGrid();
    };
    const keys: EventsKey[] = [
      view.on("change:center", scheduleRebuild),
      view.on("change:resolution", scheduleRebuild),
      map.on("moveend", finalRebuild),
      map.on("change:size", scheduleRebuild),
    ];

    return () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      for (const key of keys) unByKey(key);
    };
  }, [map, rebuildGrid]);

  return null;
}
