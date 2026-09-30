/**
 * MeasurementLines — behavior component for measurement polylines.
 *
 * Shows the currently selected measurement as a polyline with arrows.
 * Editor-only feature.
 *
 * Returns null — headless behavior component.
 */

import { useEffect, useRef, useMemo, useCallback } from "react";
import { LineString } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type { MapBrowserEvent } from "ol";
import type { Coordinate } from "ol/coordinate";

import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { useMissionDocSelector } from "utils/useDocSelector";
import { thunkPolylineOnClick } from "store/thunk/thunkMap";
import { setMeasureInitialCoords } from "store/map";
import { getDistanceBetweenTwoCoordinates, getSegmentBearing } from "utils/mapping/geoMath";

import { useMapContext } from "../MapProvider";
import { useFeatureSourcesContext } from "../FeatureSourcesProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { reconcileFeatures, type FeatureDescriptor } from "../utils/featureReconciler";
import { buildMeasurementStyleFunction } from "../utils/styles/polylines";
import { Z_INDEX } from "../utils/zIndex";

export function MeasurementLines(): null {
  const { map } = useMapContext();
  const dispatch = useAppDispatch();
  const { measurementSource } = useFeatureSourcesContext();
  const { toMapCoord, toAegisPoint } = useCoordConverters();

  // --- Redux state ---
  const measurements = useAppSelector((s) => s.measure.measurements, deepEqual);
  const selectedMeasurementUuid = useAppSelector(
    (s) => s.measure.selectedMeasurementUuid,
    refEqual
  );
  const mapDirective = useAppSelector((s) => s.map.mapDirective, refEqual);
  const planetRadius = useMissionDocSelector((m) => m.planetRadius, refEqual);
  const usingLGRSCoordinates = useMissionDocSelector((m) => m.usingLGRSCoordinates, refEqual);

  // While any map directive is active — a marker/path edit OR a crew-position
  // placement — reference features stay visible but are made non-interactive.
  // Otherwise, hovering another item during placement would highlight it and
  // flip the placement crosshair back to the default arrow cursor.
  const editActive = !!mapDirective;

  const layerRef = useRef<VectorLayer<VectorSource> | null>(null);

  // --- Layer setup ---
  useEffect(() => {
    const layer = new VectorLayer({
      source: measurementSource,
      zIndex: Z_INDEX.POLYLINES,
    });
    map.addLayer(layer);
    layerRef.current = layer;

    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, measurementSource]);

  // --- Keep measureInitialCoords in sync with map viewport ---
  // New measurements use these coords as their initial path (two points at 1/3 width from each side)
  useEffect(() => {
    const updateInitialCoords = () => {
      const size = map.getSize();
      if (!size) return;
      const left = map.getCoordinateFromPixel([size[0] / 3, size[1] / 3]);
      const right = map.getCoordinateFromPixel([(size[0] * 2) / 3, size[1] / 3]);
      if (left && right) {
        dispatch(setMeasureInitialCoords([toAegisPoint(left), toAegisPoint(right)]));
      }
    };
    updateInitialCoords();
    map.on("moveend", updateInitialCoords);
    return () => map.un("moveend", updateInitialCoords);
  }, [map, dispatch, toAegisPoint]);

  // --- Measurements to show ---
  const measurementsToShow = useMemo((): Measurement[] => {
    const result: Measurement[] = [];
    if (selectedMeasurementUuid) {
      const sel = measurements.find((m) => m.uuid === selectedMeasurementUuid);
      if (sel?.path && sel.path.length >= 2) result.push(sel);
    }

    // Ensure the measurement being edited is present so InteractionManager's
    // Modify interaction can find it, even if it isn't the selected one.
    if (mapDirective?.mapAction === "editPolyline" && mapDirective.mapItemType === "measurement") {
      const editing = measurements.find((m) => m.uuid === mapDirective.uuid);
      if (
        editing?.path &&
        editing.path.length >= 2 &&
        !result.some((m) => m.uuid === editing.uuid)
      ) {
        result.push(editing);
      }
    }

    return result;
  }, [mapDirective, selectedMeasurementUuid, measurements]);

  // --- Reconcile ---
  // During editPolyline, skip geometry updates — OL Modify interaction owns the feature geometry.
  const isEditing =
    mapDirective?.mapAction === "editPolyline" && mapDirective?.mapItemType === "measurement";

  useEffect(() => {
    const mapper = (measurement: Measurement): FeatureDescriptor | null => {
      if (!measurement.path || measurement.path.length < 2) return null;
      const coords = measurement.path
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => toMapCoord(p));
      if (coords.length < 2) return null;
      return {
        id: measurement.uuid,
        geometry: isEditing ? null : new LineString(coords),
        properties: {
          color: measurement.color,
          mapItemType: "measurement",
          // Drives the persistent start/end edit pins in the style function.
          // (Stable during a drag, so it never re-triggers feature.changed().)
          editing: isEditing,
          // Precomputed geodesic values (haversine distance, LPS bearing) so the
          // on-line labels match the elevation/timeline panel. Withheld while
          // editing: these arrays get a new reference on every throttled drag
          // save, and reconcile calls feature.changed() on any prop change,
          // which fires OL Modify's handleFeatureChange_ and clears its active
          // dragSegments_ mid-drag — detaching the drag (the vertex overlay
          // keeps following the pointer while the line/elevation freeze).
          ...(isEditing
            ? {}
            : {
                segmentDistances: measurement.pathSegmentDistances ?? [],
                segmentBearings: measurement.pathSegmentBearings ?? [],
              }),
        },
      };
    };

    reconcileFeatures(measurementSource, measurementsToShow, mapper);
  }, [measurementsToShow, measurementSource, toMapCoord, isEditing]);

  // --- Geodesic resolvers for on-line labels while editing ---
  // The precomputed segment distances/bearings are withheld from the feature
  // during an edit (setting them would fire feature.changed() and detach OL
  // Modify's drag), but reconcile merges properties so the pre-edit arrays linger
  // stale on the feature. The style therefore ignores them while editing and uses
  // these resolvers to compute per-segment values from the live projected coords,
  // keeping every segment's label in sync with the elevation panel during a drag.
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

  // --- Style function ---
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const styleFnCache = new Map<string, ReturnType<typeof buildMeasurementStyleFunction>>();

    layer.setStyle((feature, resolution) => {
      const color = (feature.get("color") as string) || "#ff0000";
      let styleFn = styleFnCache.get(color);
      if (!styleFn) {
        styleFn = buildMeasurementStyleFunction({
          color,
          weight: 3,
          arrowSize: 18,
          arrowRepeat: 60,
          getSegmentDistanceMeters,
          getSegmentBearingDegrees,
        });
        styleFnCache.set(color, styleFn);
      }
      return styleFn(feature, resolution);
    });
  }, [map, measurementSource, getSegmentDistanceMeters, getSegmentBearingDegrees]);

  // --- Click handler (disabled during any active edit) ---
  useEffect(() => {
    if (editActive) return; // reference lines are non-interactive during an edit

    const handleClick = (evt: MapBrowserEvent) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === layerRef.current,
        hitTolerance: 5,
      });
      if (hit) {
        dispatch(
          thunkPolylineOnClick({
            polylineUuid: hit.getId() as string,
            mapItemType: "measurement",
          })
        );
      }
    };

    map.on("click", handleClick);
    return () => map.un("click", handleClick);
  }, [map, dispatch, editActive]);

  return null;
}
