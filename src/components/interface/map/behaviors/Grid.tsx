/**
 * Grid — behavior component that draws the mission grid lines and labels.
 *
 * Draws either the server-file grid (a loaded coordinate lattice) or the dynamic LGRS grid
 * (`createLgrsRenderPlan`, any lunar map projection) as OL features on dedicated VectorLayers.
 * Grid density adapts to the visible portion (zoom level) to avoid rendering thousands of lines.
 *
 * Density is decided by the dashboard: the dashboard map publishes the spacing it
 * drew to `DashboardBoundsProvider` and the minimap redraws at that same
 * ground spacing, so the bounds box on the minimap contains as many grid lines
 * as the dashboard shows. The editor map is unaffected (no provider).
 *
 * Returns null — headless behavior component.
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
import { adjustGridIndex, findClosestPointInGlobalGrid } from "utils/mapping/geoMath";
import { getLgrsCompatibility } from "utils/lgrs/compatibility";
import { coarsenForMinimap, createLgrsRenderPlan } from "utils/lgrs/grid/plan";
import { getLgrsGridBinding } from "utils/lgrs/gridBinding";

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
import { createGridLabelStyleFn, createGridLineStyles } from "../utils/styles/grid";
import { Z_INDEX } from "../utils/zIndex";

// Hide labels once adjacent labels would be closer than this many screen pixels.
const LABEL_MIN_PX = 60;

export function Grid(): null {
  const { map, mode } = useMapContext();
  const config = MODE_CONFIGS[mode];
  const { toMapCoord, toAegisPoint } = useCoordConverters();
  const { gridSpacingMode, gridLabelInterval } = useMapMenuContext();
  const resolvedGrid = useResolvedMissionGrid();

  // Dashboard↔minimap grid-density channel. Absent on the editor map.
  const dashboardBounds = useOptionalDashboardBoundsContext();
  const publishSpacing = mode === "dashboard" ? dashboardBounds?.setGridSpacing : undefined;
  const inheritedSpacing = mode === "minimap" ? (dashboardBounds?.gridSpacing ?? null) : null;

  const projectionConfig = useMissionDocSelector(
    (doc) => ({
      id: doc.id,
      planetRadius: doc.planetRadius,
      projIsCustom: doc.projIsCustom,
      projEpsg: doc.projEpsg,
      projProj4String: doc.projProj4String,
    }),
    deepEqual
  );
  const planetRadius = projectionConfig?.planetRadius;
  // One instance per `system.key`, so the binding memo is keyed by projection and system.
  const gridSystem = useMissionGridSystem();
  const gridBinding = useMemo(() => {
    if (!projectionConfig) return null;
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

    /** Draws the grid; returns the spacing it used, or null when nothing was drawn. */
    const drawGrid = (): GridSpacingMeters | null => {
      const lineSource = lineLayer.getSource()!;
      const labelSource = labelLayer.getSource()!;
      lineSource.clear();
      labelSource.clear();
      if (!mapGridControl?.visible || resolvedGrid.kind === "none") return null;

      const lineStyles = createGridLineStyles(mapGridControl.style);
      const extent = map.getView().calculateExtent(map.getSize());
      const resolution = map.getView().getResolution() ?? 0;
      const labelsEnabled = !!mapGridControl.labelsVisible && config.grid.labelsEnabled;

      if (resolvedGrid.kind === "dynamic-lgrs") {
        if (!gridBinding) return null;
        const plan = createLgrsRenderPlan({
          binding: gridBinding,
          extent: [extent[0], extent[1], extent[2], extent[3]],
          resolution,
          gridSpacingMode,
          gridLabelInterval,
          labelsVisible: labelsEnabled,
          inheritedSpacing,
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
        return plan.tier === "box" ? { line: plan.lineSpacing, label: plan.labelSpacing } : null;
      }

      if (!planetRadius) return null;
      const gridCoordinates = resolvedGrid.grid.coordinates;
      const numRows = gridCoordinates.length;
      const numCols = gridCoordinates[0].length;

      // Compute visible bounds in AEGISPoint space
      const topLeft = toAegisPoint([extent[0], extent[3]]);
      const bottomRight = toAegisPoint([extent[2], extent[1]]);

      const startGridIdx = findClosestPointInGlobalGrid(gridCoordinates, topLeft, planetRadius);
      const endGridIdx = findClosestPointInGlobalGrid(gridCoordinates, bottomRight, planetRadius);
      if (!startGridIdx || !endGridIdx) return null;

      // Base spacing (metres between adjacent grid lines), derived from the grid
      // geometry — the single source of truth (see getGridBaseSpacingMeters).
      const baseSpacing = getGridBaseSpacingMeters(resolvedGrid.grid, planetRadius);

      const basePointsShown =
        (endGridIdx.row - startGridIdx.row) * (endGridIdx.col - startGridIdx.col);

      // --- Line stride ---
      // The minimap mirrors the dashboard's ground spacing. Otherwise fixed mode
      // draws every Nth grid line at a fixed ground spacing, independent of zoom,
      // and auto mode targets ~100 visible cells at any zoom.
      let lineZoomLevel: number;
      if (inheritedSpacing && baseSpacing > 0) {
        const spacing = coarsenForMinimap(inheritedSpacing.line, resolution);
        lineZoomLevel = Math.max(1, Math.round(spacing / baseSpacing));
      } else if (gridSpacingMode !== "auto" && baseSpacing > 0) {
        lineZoomLevel = Math.max(1, Math.round(gridSpacingMode / baseSpacing));
      } else {
        lineZoomLevel = Math.max(1, Math.ceil(Math.sqrt(basePointsShown / 100)));
      }

      // --- Label stride + overlap cutoff ---
      // Labels are always placed on a multiple of the line stride so they sit on
      // drawn lines. The auto label interval hides labels when they would overlap
      // (the "zoom-out cutoff"); a fixed label interval is always shown.
      let labelZoomLevel: number;
      let hideLabels = false;
      if (inheritedSpacing && baseSpacing > 0) {
        const rawLabelStride = Math.max(1, Math.round(inheritedSpacing.label / baseSpacing));
        labelZoomLevel = Math.max(
          lineZoomLevel,
          Math.ceil(rawLabelStride / lineZoomLevel) * lineZoomLevel
        );
      } else if (gridSpacingMode === "auto") {
        // Adaptive labels target ~25 visible.
        const rawLabelInterval = Math.ceil(Math.sqrt(basePointsShown / 25));
        labelZoomLevel = Math.ceil(rawLabelInterval / lineZoomLevel) * lineZoomLevel;
      } else if (gridLabelInterval === "auto") {
        // A label on every drawn line, hidden once they would overlap.
        labelZoomLevel = lineZoomLevel;
        if (baseSpacing > 0 && resolution > 0) {
          const pxSpacing = (labelZoomLevel * baseSpacing) / resolution;
          if (pxSpacing < LABEL_MIN_PX) hideLabels = true;
        }
      } else if (baseSpacing > 0) {
        // Fixed label interval, aligned up to a multiple of the line stride.
        const rawLabelStride = Math.max(1, Math.round(gridLabelInterval / baseSpacing));
        labelZoomLevel = Math.max(
          lineZoomLevel,
          Math.ceil(rawLabelStride / lineZoomLevel) * lineZoomLevel
        );
      } else {
        labelZoomLevel = lineZoomLevel;
      }

      const spacing: GridSpacingMeters | null =
        baseSpacing > 0
          ? { line: lineZoomLevel * baseSpacing, label: labelZoomLevel * baseSpacing }
          : null;

      const startIndex = adjustGridIndex(startGridIdx, numRows, numCols, lineZoomLevel, true);
      const endIndex = adjustGridIndex(endGridIdx, numRows, numCols, lineZoomLevel, false);

      const labelStartIndex = adjustGridIndex(startGridIdx, numRows, numCols, labelZoomLevel, true);
      const labelEndIndex = adjustGridIndex(endGridIdx, numRows, numCols, labelZoomLevel, false);

      // --- Lines ---
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
        feature.setStyle(lineStyles.grid);
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
        feature.setStyle(lineStyles.grid);
        lineSource.addFeature(feature);
      }

      // --- Labels ---
      if (!labelsEnabled || hideLabels) return spacing;

      for (let i = labelEndIndex.row; i >= labelStartIndex.row; i -= labelZoomLevel) {
        for (let j = labelStartIndex.col; j <= labelEndIndex.col; j += labelZoomLevel) {
          if (i < 0 || i >= numRows || j < 0 || j >= numCols) continue;
          if (i === startIndex.row && j === endIndex.col) continue;
          const point = gridCoordinates[i][j];
          if (!point.name) continue;

          const coord = toMapCoord(point.coordinates);
          const labelFeature = new Feature(new Point(coord));
          labelFeature.setStyle(labelStyle(point.name, false));
          labelSource.addFeature(labelFeature);
        }
      }

      return spacing;
    };

    // Note the separate statement: `publishSpacing?.(drawGrid())` would skip the
    // draw entirely on maps that don't publish.
    const spacing = drawGrid();
    // The dashboard publishes what it drew so the minimap can mirror it.
    publishSpacing?.(spacing);
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
    ];

    return () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      for (const key of keys) unByKey(key);
    };
  }, [map, rebuildGrid]);

  return null;
}
