/**
 * PathPlannerLines — behavior component for Newton Path Planner plans (editor only).
 *
 * Draws the selected plan's straight line through its start, midpoints and goal in the
 * Measure style, with S/G pins and midpoint markers (id = plan uuid; the feature
 * `editPolyline` modifies) and, once Newton answers, its A*
 * path (id `newton-${uuid}`). The last path found stays, greyed out, while newer points are
 * planned, until a new path replaces it. Clicking either
 * selects the plan.
 *
 * Returns null — headless behavior component.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Coordinate } from "ol/coordinate";
import { LineString } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import type { MapBrowserEvent } from "ol";

import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { useMissionDocSelector } from "utils/useDocSelector";
import { thunkPolylineOnClick } from "store/thunk/thunkMap";
import { isPathPlanRowCurrent } from "utils/pathPlanner";
import { getDistanceBetweenTwoCoordinates, getSegmentBearing } from "utils/mapping/geoMath";

import { useMapContext } from "../MapProvider";
import { useFeatureSourcesContext } from "../FeatureSourcesProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { reconcileFeatures, type FeatureDescriptor } from "../utils/featureReconciler";
import { pathPlanNewtonStyle, pathPlanPinStyles } from "../utils/styles/pathPlanner";
import { buildMeasurementStyleFunction } from "../utils/styles/polylines";
import { Z_INDEX } from "../utils/zIndex";

export const NEWTON_PATH_FEATURE_PREFIX = "newton-";

export function PathPlannerLines(): null {
  const { map } = useMapContext();
  const dispatch = useAppDispatch();
  const { pathPlannerSource } = useFeatureSourcesContext();
  const { toMapCoord, toAegisPoint } = useCoordConverters();

  const plans = useAppSelector((s) => s.pathPlanner.plans, deepEqual);
  const selectedPlanUuid = useAppSelector((s) => s.pathPlanner.selectedPlanUuid, refEqual);
  const mapDirective = useAppSelector((s) => s.map.mapDirective, refEqual);
  const planetRadius = useMissionDocSelector((m) => m.planetRadius, refEqual);
  const usingLGRSCoordinates = useMissionDocSelector((m) => m.usingLGRSCoordinates, refEqual);
  const editActive = !!mapDirective;

  // Newton paths live on their own source so the straight line's source holds only
  // features `editPolyline` may modify.
  const newtonSource = useMemo(() => new VectorSource(), []);
  const straightLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const newtonLayerRef = useRef<VectorLayer<VectorSource> | null>(null);

  useEffect(() => {
    const newtonLayer = new VectorLayer({
      source: newtonSource,
      zIndex: Z_INDEX.POLYLINES,
      style: pathPlanNewtonStyle,
    });
    const straightLayer = new VectorLayer({
      source: pathPlannerSource,
      zIndex: Z_INDEX.POLYLINES,
    });
    map.addLayer(newtonLayer);
    map.addLayer(straightLayer);
    newtonLayerRef.current = newtonLayer;
    straightLayerRef.current = straightLayer;
    return () => {
      map.removeLayer(newtonLayer);
      map.removeLayer(straightLayer);
      newtonLayerRef.current = null;
      straightLayerRef.current = null;
    };
  }, [map, pathPlannerSource, newtonSource]);

  const editingUuid =
    mapDirective?.mapAction === "editPolyline" && mapDirective.mapItemType === "pathPlan"
      ? mapDirective.uuid
      : null;

  // The selected plan, plus the one being edited so Modify can find its feature.
  const plansToShow = useMemo(
    () => plans.filter((plan) => plan.uuid === selectedPlanUuid || plan.uuid === editingUuid),
    [plans, selectedPlanUuid, editingUuid]
  );

  useEffect(() => {
    const mapper = (plan: PathPlan): FeatureDescriptor | null => {
      const editing = plan.uuid === editingUuid;
      return {
        id: plan.uuid,
        // While editing, Modify owns the geometry; setting it would detach the drag.
        geometry: editing ? null : new LineString(plan.points.map((point) => toMapCoord(point))),
        // Stable values only: a prop change fires feature.changed() and detaches a drag.
        // Blocked points are withheld while editing; the style ignores the stale value then.
        properties: {
          color: plan.color,
          mapItemType: "pathPlan",
          editing,
          ...(editing
            ? {}
            : { blockedWaypoints: (plan.request.error?.blockedWaypoints ?? []).join(",") }),
        },
      };
    };
    reconcileFeatures(pathPlannerSource, plansToShow, mapper);
  }, [plansToShow, pathPlannerSource, toMapCoord, editingUuid]);

  useEffect(() => {
    const withPaths = plansToShow.filter((plan) => (plan.request.pathRow?.path?.length ?? 0) >= 2);
    const mapper = (plan: PathPlan): FeatureDescriptor => ({
      id: `${NEWTON_PATH_FEATURE_PREFIX}${plan.uuid}`,
      geometry: new LineString(plan.request.pathRow.path.map((point) => toMapCoord(point))),
      properties: {
        color: plan.color,
        mapItemType: "pathPlan",
        planUuid: plan.uuid,
        current:
          plan.request.status === "ready" &&
          isPathPlanRowCurrent(plan, planetRadius, plan.request.pathRow),
      },
    });
    reconcileFeatures(newtonSource, withPaths, mapper);
  }, [plansToShow, newtonSource, toMapCoord, planetRadius]);

  // Segment labels are always computed from the live coords, so a drag never needs new props.
  const getSegmentDistanceMeters = useCallback(
    (a: Coordinate, b: Coordinate): number =>
      getDistanceBetweenTwoCoordinates(toAegisPoint(a), toAegisPoint(b), planetRadius) ?? 0,
    [toAegisPoint, planetRadius]
  );
  const getSegmentBearingDegrees = useCallback(
    (a: Coordinate, b: Coordinate): number =>
      getSegmentBearing(toAegisPoint(a), toAegisPoint(b), usingLGRSCoordinates),
    [toAegisPoint, usingLGRSCoordinates]
  );

  useEffect(() => {
    const layer = straightLayerRef.current;
    if (!layer) return;
    const lineStyleCache = new Map<string, ReturnType<typeof buildMeasurementStyleFunction>>();
    layer.setStyle((feature, resolution) => {
      const color = (feature.get("color") as string) || "#ff8c42";
      let lineStyle = lineStyleCache.get(color);
      if (!lineStyle) {
        lineStyle = buildMeasurementStyleFunction({
          color,
          weight: 3,
          arrowSize: 18,
          arrowRepeat: 60,
          getSegmentDistanceMeters,
          getSegmentBearingDegrees,
        });
        lineStyleCache.set(color, lineStyle);
      }
      const vertexCount =
        (feature.getGeometry() as LineString | undefined)?.getCoordinates().length ?? 0;
      return [
        ...lineStyle(feature, resolution),
        ...pathPlanPinStyles(
          color,
          vertexCount,
          feature.get("editing") ? "" : ((feature.get("blockedWaypoints") as string) ?? "")
        ),
      ];
    });
  }, [map, pathPlannerSource, getSegmentDistanceMeters, getSegmentBearingDegrees]);

  useEffect(() => {
    if (editActive) return;
    const handleClick = (evt: MapBrowserEvent) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === straightLayerRef.current || l === newtonLayerRef.current,
        hitTolerance: 5,
      });
      if (!hit) return;
      const planUuid = (hit.get("planUuid") as string | undefined) ?? (hit.getId() as string);
      dispatch(thunkPolylineOnClick({ polylineUuid: planUuid, mapItemType: "pathPlan" }));
    };
    map.on("click", handleClick);
    return () => map.un("click", handleClick);
  }, [map, dispatch, editActive]);

  return null;
}
