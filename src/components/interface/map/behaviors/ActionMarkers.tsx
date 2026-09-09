/**
 * ActionMarkers — behavior component for EVA action markers on the OL map.
 *
 * Editor: shows actions belonging to the currently selected station, POI, or
 * traverse. Dashboard has no selection, so it shows actions for the sequence
 * item(s) the running REX currently marks "in-progress".
 * Actions are only shown when mapDisplayActions.show is true.
 *
 * Returns null — headless behavior component.
 */

import { useEffect, useRef, useMemo } from "react";
import type Feature from "ol/Feature";
import Point from "ol/geom/Point";
import VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type { MapBrowserEvent } from "ol";
import { Translate } from "ol/interaction";
import { Collection } from "ol";

import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDocUpdateActionLocation } from "store/thunk/thunkAction";
import { useMissionDocSelector } from "utils/useDocSelector";
import { setHoverUuidsForSequence, clearMapItemHover } from "store/hover";
import { updateMapDirective } from "store/map";
import { getActionDisplayName } from "utils/component-helpers";

import { useMapContext } from "../MapProvider";
import { MODE_CONFIGS } from "../utils/modeConfig";
import { useFeatureSourcesContext } from "../FeatureSourcesProvider";
import { useMapMenuContext } from "../MapMenuProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { reconcileFeatures, type FeatureDescriptor } from "../utils/featureReconciler";
import { buildActionStyleFunction } from "../utils/styles/markers";
import { Z_INDEX } from "../utils/zIndex";

export function ActionMarkers(): null {
  const { map, mode } = useMapContext();
  const config = MODE_CONFIGS[mode];
  const dispatch = useAppDispatch();
  const { actionSource } = useFeatureSourcesContext();
  const { submenuActions: mapDisplayActions } = useMapMenuContext();
  const { toMapCoord, toAegisPoint } = useCoordConverters();

  const actionsFromDoc = useMissionDocSelector((m) => Object.values(m.actions ?? {}), deepEqual);

  // Naming inputs for STM (v2) actions, whose label is built from the
  // verb/noun/adjective definition joined by the mission's custom conjunctions.
  const actionNaming = useMissionDocSelector(
    (m) => ({
      actionSystemVersion: m.actionSystemVersion,
      actionDefinitions: m.actionDefinitions,
      actionDefinitionConjunctions: m.actionDefinitionConjunctions,
    }),
    deepEqual
  );

  // --- Redux state ---
  const selectedStationUuid = useAppSelector((s) => s.station.selectedStationUuid, refEqual);
  const selectedPoiUuid = useAppSelector((s) => s.poi.selectedPoiUuid, refEqual);
  const selectedSeqItemUuid = useAppSelector((s) => s.eva.selectedEvaSequenceItemUuid, refEqual);
  const selectedTraverseUuid = useMissionDocSelector((m) => {
    if (!selectedSeqItemUuid) return null;
    return m.traverses?.[selectedSeqItemUuid] ? selectedSeqItemUuid : null;
  }, refEqual);

  // Dashboard has no marker selection, so actions can't be gated on a selected
  // parent. Instead, gate on the running REX's per-activity status: show actions
  // only for the station/traverse (and egress/ingress station) currently marked
  // "in-progress" — the same signal that draws the green in-progress ring on
  // StationMarkers. Merely belonging to the running EVA's sequence is not enough.
  const dashboardActionParentUuids = useMissionDocSelector((m) => {
    if (mode !== "dashboard") return null;
    const runningRex = Object.values(m.rexes ?? {}).find((r) => r.isRunning);
    if (!runningRex) return [];
    const uuids: string[] = [];
    for (const [uuid, entry] of Object.entries(runningRex.stationEntries ?? {})) {
      if (entry.rexStatus === "in-progress") uuids.push(uuid);
    }
    for (const [uuid, entry] of Object.entries(runningRex.traverseEntries ?? {})) {
      if (entry.rexStatus === "in-progress") uuids.push(uuid);
    }
    return uuids;
  }, deepEqual);

  const sectionSelected = useAppSelector((s) => s.interface.sectionSelectedLabel, refEqual);
  const mapDirective = useAppSelector((s) => s.map.mapDirective, refEqual);

  // While any map directive is active — a marker/path edit OR a crew-position
  // placement — reference features stay visible but are made non-interactive.
  // Otherwise, hovering another item during placement would highlight it and
  // flip the placement crosshair back to the default arrow cursor.
  const editActive = !!mapDirective;

  const layerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const translateRef = useRef<Translate | null>(null);

  // --- Layer setup ---
  useEffect(() => {
    const layer = new VectorLayer({
      source: actionSource,
      zIndex: Z_INDEX.ACTIONS,
    });
    map.addLayer(layer);
    layerRef.current = layer;

    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, actionSource]);

  // --- Actions to show ---
  const actionsToShow = useMemo((): Action[] => {
    const actions = actionsFromDoc ?? [];

    // The action being edited/created stays visible even when the actions
    // eyeball is off, so InteractionManager can find its feature.
    const editingActionUuid =
      (mapDirective?.mapAction === "editMarker" || mapDirective?.mapAction === "createMarker") &&
      mapDirective.mapItemType === "action"
        ? mapDirective.uuid
        : null;

    let result: Action[] = [];

    if (mapDisplayActions.show) {
      if (mode === "dashboard") {
        const parentSet = new Set(dashboardActionParentUuids ?? []);
        result = actions.filter(
          (a) =>
            a.enabled &&
            (((a.stationUuid ?? null) !== null && parentSet.has(a.stationUuid!)) ||
              ((a.traverseUuid ?? null) !== null && parentSet.has(a.traverseUuid!)))
        );
      } else if (
        (sectionSelected === "station" || sectionSelected === "evas") &&
        selectedStationUuid
      ) {
        result = actions.filter((a) => a.stationUuid === selectedStationUuid && a.enabled);
      } else if (sectionSelected === "poi" && selectedPoiUuid) {
        result = actions.filter((a) => a.poiUuid === selectedPoiUuid && a.enabled);
      } else if (sectionSelected === "evas" && selectedTraverseUuid) {
        result = actions.filter((a) => a.traverseUuid === selectedTraverseUuid && a.enabled);
      }
    }

    if (editingActionUuid && !result.some((a) => a.uuid === editingActionUuid)) {
      const editing = actions.find((a) => a.uuid === editingActionUuid);
      if (editing) result = [...result, editing];
    }

    return result.filter((a) => a.location?.lat != null && a.location?.lng != null);
  }, [
    mode,
    mapDirective,
    mapDisplayActions.show,
    actionsFromDoc,
    dashboardActionParentUuids,
    selectedStationUuid,
    selectedPoiUuid,
    selectedTraverseUuid,
    sectionSelected,
  ]);

  // --- Reconcile ---
  useEffect(() => {
    const mapper = (action: Action): FeatureDescriptor | null => {
      if (!action.location || action.location.lat == null || action.location.lng == null) {
        return null;
      }
      return {
        id: action.uuid,
        geometry: new Point(toMapCoord(action.location)),
        properties: {
          emoji: action.icon || "2754",
          name: getActionDisplayName({ action, mission: actionNaming }),
          mapItemType: "action",
        },
      };
    };

    reconcileFeatures(actionSource, actionsToShow, mapper);
  }, [actionsToShow, actionSource, toMapCoord, actionNaming]);

  // --- Style ---
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const styleFn = buildActionStyleFunction(null, config.station.iconSize);
    layer.setStyle(styleFn);
  }, [config.station.iconSize]);

  // --- Hover handler ---
  useEffect(() => {
    if (!config.station.hoverable) return;
    if (editActive) return; // reference markers are non-interactive during an edit

    let isHovering = false;

    const handlePointerMove = (evt: MapBrowserEvent) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === layerRef.current,
        hitTolerance: 8,
      });
      if (hit) {
        const uuid = hit.getId() as string;
        dispatch(setHoverUuidsForSequence({ sequenceUuid: uuid, mapItemType: "action" }));
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
  }, [map, config.station.hoverable, editActive, dispatch]);

  // --- Drag interaction (editor only) ---
  useEffect(() => {
    if (!config.station.draggable) return;
    // During an edit, the edited marker is dragged via InteractionManager's
    // Translate; reference actions must not be draggable.
    if (editActive) return;

    const translate = new Translate({
      features: new Collection<Feature>([]),
      filter: (feature) => feature.get("mapItemType") === "action",
    });

    translate.on("translateend", (evt) => {
      const feature = evt.features.item(0);
      if (!feature) return;
      const uuid = feature.getId() as string;
      const geom = feature.getGeometry() as Point;
      const newLocation = toAegisPoint(geom.getCoordinates());
      dispatch(thunkDocUpdateActionLocation({ location: newLocation, actionUuid: uuid }));
      dispatch(updateMapDirective(null));
    });

    map.addInteraction(translate);
    translateRef.current = translate;

    return () => {
      map.removeInteraction(translate);
      translateRef.current = null;
    };
  }, [map, config.station.draggable, editActive, toAegisPoint, dispatch]);

  return null;
}
