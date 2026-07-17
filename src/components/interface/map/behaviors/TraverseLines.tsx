/**
 * TraverseLines — behavior component for traverse polylines on the OL map.
 *
 * Reads traverse data (filtered to the selected EVA's sequence),
 * reconciles features on the shared traverseSource, and renders via a
 * per-map VectorLayer with arrow decorators and selection highlighting.
 *
 * Returns null — headless behavior component.
 */

import { useEffect, useRef, useMemo } from "react";
import { LineString } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type { MapBrowserEvent } from "ol";

import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkPolylineOnClick } from "store/thunk/thunkMap";
import { setHoverUuidsForSequence, clearMapItemHover } from "store/hover";
import { getDistanceBetweenTwoCoordinates, getSegmentBearing } from "utils/mapping/geoMath";

import { useMapContext } from "../MapProvider";
import { MODE_CONFIGS } from "../utils/modeConfig";
import { useFeatureSourcesContext } from "../FeatureSourcesProvider";
import { useMapMenuContext } from "../MapMenuProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { reconcileFeatures, type FeatureDescriptor } from "../utils/featureReconciler";
import { buildTraverseStyleFunction } from "../utils/styles/polylines";
import { Z_INDEX } from "../utils/zIndex";

export function TraverseLines(): null {
  const { map, mode } = useMapContext();
  const config = MODE_CONFIGS[mode];
  const dispatch = useAppDispatch();
  const { traverseSource } = useFeatureSourcesContext();
  const { showArrows, showBearings, showDistances } = useMapMenuContext();
  const { toMapCoord } = useCoordConverters();

  // --- Redux UI state ---
  const selectedEvaUuid = useAppSelector((s) => s.eva.selectedEvaUuid, refEqual);
  const selectedEvaSequenceItemUuid = useAppSelector(
    (s) => s.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const sectionSelected = useAppSelector((s) => s.interface.sectionSelectedLabel, refEqual);
  const mapDirective = useAppSelector((s) => s.map.mapDirective, refEqual);

  // While any map directive is active — a marker/path edit OR a crew-position
  // placement — reference features stay visible but are made non-interactive.
  // Otherwise, hovering another item during placement would highlight it and
  // flip the placement crosshair back to the default arrow cursor.
  const editActive = !!mapDirective;

  // --- Automerge doc state ---
  const selectedEva = useMissionDocSelector((m) => {
    return selectedEvaUuid ? (m.evas?.[selectedEvaUuid] ?? null) : null;
  }, deepEqual);

  const allTraversesFromDoc = useMissionDocSelector(
    (m) => Object.values(m.traverses ?? {}),
    deepEqual
  );

  const planetRadius = useMissionDocSelector((m) => m.planetRadius ?? 1737400, refEqual) as number;
  const usingLGRSCoordinates = useMissionDocSelector((m) => m.usingLGRSCoordinates, refEqual);

  const selectedTraverseUuid = useMissionDocSelector((m) => {
    if (!selectedEvaSequenceItemUuid) return null;
    return m.traverses?.[selectedEvaSequenceItemUuid] ? selectedEvaSequenceItemUuid : null;
  }, refEqual);

  const layerRef = useRef<VectorLayer<VectorSource> | null>(null);

  // --- Layer setup ---
  useEffect(() => {
    const layer = new VectorLayer({
      source: traverseSource,
      zIndex: Z_INDEX.POLYLINES,
    });
    map.addLayer(layer);
    layerRef.current = layer;

    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, traverseSource]);

  // --- Traverses to show ---
  const traversesToShow = useMemo((): Traverse[] => {
    const traverses = allTraversesFromDoc ?? [];

    const collected: Traverse[] = [];
    if (sectionSelected === "evas") {
      if (selectedEva) {
        const traverseItems =
          selectedEva.sequence?.filter((item) => item.type === "traverse") ?? [];
        const traverseUuids = new Set(traverseItems.map((item) => item.uuid));
        collected.push(
          ...traverses.filter(
            (t) =>
              traverseUuids.has(t.uuid) &&
              t.path &&
              t.path.length >= 2 &&
              t.path.every((p) => p.lat != null && p.lng != null)
          )
        );
      } else if (selectedTraverseUuid) {
        // No EVA but a traverse is selected
        const t = traverses.find((t) => t.uuid === selectedTraverseUuid);
        if (t?.path && t.path.length >= 2) collected.push(t);
      }
    }

    // Ensure the traverse being edited is present so InteractionManager's Modify
    // interaction can find it, even if section/selection wouldn't include it.
    if (mapDirective?.mapAction === "editPolyline" && mapDirective.mapItemType === "traverse") {
      const editing = traverses.find((t) => t.uuid === mapDirective.uuid);
      if (
        editing?.path &&
        editing.path.length >= 2 &&
        !collected.some((t) => t.uuid === editing.uuid)
      ) {
        collected.push(editing);
      }
    }

    return collected;
  }, [mapDirective, sectionSelected, selectedEva, allTraversesFromDoc, selectedTraverseUuid]);

  // --- Reconcile features ---
  // During editPolyline, skip geometry updates — OL Modify interaction owns the feature geometry.
  const isEditingTraverse =
    mapDirective?.mapAction === "editPolyline" && mapDirective?.mapItemType === "traverse";

  useEffect(() => {
    const mapper = (traverse: Traverse): FeatureDescriptor | null => {
      if (!traverse.path || traverse.path.length < 2) return null;
      const validPath = traverse.path.filter((p) => p.lat != null && p.lng != null);
      const coords = validPath.map((p) => toMapCoord(p));
      if (coords.length < 2) return null;

      // While this feature is being edited, OL's Modify interaction owns the
      // geometry AND the feature must not receive a `change` event: reconcile
      // calls feature.changed() on any property update, which fires Modify's
      // handleFeatureChange_ → clears its active dragSegments_ mid-drag (the
      // vertex overlay keeps following the pointer, but the line/elevation
      // freeze). So skip both the geometry and the per-tick segment arrays.
      const isThisFeatureEditing = isEditingTraverse && traverse.uuid === mapDirective?.uuid;

      // Precompute geodesic per-segment bearing + distance (haversine) from
      // lat/lng so the on-map labels match the traverse info panel rather than
      // using projected-grid geometry (which is distorted near the pole).
      const segmentBearings: number[] = [];
      const segmentDistances: number[] = [];
      if (!isThisFeatureEditing) {
        for (let i = 0; i < validPath.length - 1; i++) {
          segmentBearings.push(
            getSegmentBearing(validPath[i], validPath[i + 1], usingLGRSCoordinates)
          );
          segmentDistances.push(
            getDistanceBetweenTwoCoordinates(validPath[i], validPath[i + 1], planetRadius) ?? 0
          );
        }
      }

      return {
        id: traverse.uuid,
        geometry: isThisFeatureEditing ? null : new LineString(coords),
        properties: {
          name: traverse.name,
          color: traverse.color || selectedEva?.traverseColor || "#03adfc",
          mapItemType: "traverse",
          // Withheld while editing to avoid a feature.changed() that would
          // detach the in-progress Modify drag (see note above).
          ...(isThisFeatureEditing ? {} : { segmentBearings, segmentDistances }),
        },
      };
    };

    reconcileFeatures(traverseSource, traversesToShow, mapper);
  }, [
    traversesToShow,
    traverseSource,
    toMapCoord,
    selectedEva,
    isEditingTraverse,
    mapDirective?.uuid,
    planetRadius,
    usingLGRSCoordinates,
  ]);

  // --- Style function ---
  // Built once per (config, showArrows, selectedTraverseUuid) change, not per feature per frame.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const styleFn = buildTraverseStyleFunction({
      weight: config.traverse.weight,
      selectedWeight: config.traverse.selectedWeight,
      showArrows,
      // Per-mode config gates capability (e.g. minimap never shows these);
      // the eyeball-menu toggles let the user turn them off where supported.
      showBearings: config.traverse.showBearings && showBearings,
      showDistances: config.traverse.showDistances && showDistances,
      arrowSize: config.traverse.arrowSize,
      arrowRepeat: config.traverse.arrowRepeat,
      bearingLabelFontSize: config.traverse.bearingLabelFontSize,
      bearingLabelColor: config.traverse.bearingLabelColor,
      distanceLabelFontSize: config.traverse.distanceLabelFontSize,
      distanceLabelColor: config.traverse.distanceLabelColor,
      getColor: (feature) => (feature.get("color") as string) || "#03adfc",
      getIsSelected: (feature) => feature.getId() === selectedTraverseUuid,
    });
    layer.setStyle(styleFn);
  }, [config, showArrows, showBearings, showDistances, selectedTraverseUuid]);

  // --- Click handler (disabled during any active edit) ---
  useEffect(() => {
    if (!config.traverse.clickable) return;
    if (editActive) return; // reference lines are non-interactive during an edit

    const handleClick = (evt: MapBrowserEvent) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === layerRef.current,
        hitTolerance: 5,
      });
      if (hit) {
        dispatch(
          thunkPolylineOnClick({ polylineUuid: hit.getId() as string, mapItemType: "traverse" })
        );
      }
    };

    map.on("click", handleClick);
    return () => map.un("click", handleClick);
  }, [map, config.traverse.clickable, dispatch, editActive]);

  // --- Hover handler (disabled during any active edit) ---
  useEffect(() => {
    if (!config.traverse.clickable) return;
    if (editActive) return; // reference lines are non-interactive during an edit

    let isHovering = false;

    const handlePointerMove = (evt: MapBrowserEvent) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === layerRef.current,
        hitTolerance: 5,
      });
      if (hit) {
        dispatch(
          setHoverUuidsForSequence({
            sequenceUuid: hit.getId() as string,
            mapItemType: "traverse",
          })
        );
        const el = map.getTargetElement();
        if (el) el.style.cursor = "pointer";
        isHovering = true;
      } else if (isHovering) {
        dispatch(clearMapItemHover());
        const el = map.getTargetElement();
        if (el) el.style.cursor = "";
        isHovering = false;
      }
    };

    map.on("pointermove", handlePointerMove);
    return () => {
      map.un("pointermove", handlePointerMove);
      if (isHovering) {
        dispatch(clearMapItemHover());
        isHovering = false;
      }
      const el = map.getTargetElement();
      if (el) el.style.cursor = "";
    };
  }, [map, config.traverse.clickable, dispatch, editActive]);

  return null;
}
