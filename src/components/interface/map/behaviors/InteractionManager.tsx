/**
 * InteractionManager — behavior component that maps `mapDirective` Redux state
 * to OpenLayers interactions (Translate, Modify, click handlers).
 *
 * Replaces the Leaflet `handleMapDirective()` pattern with OL
 * interactions. Only one interaction is active at a time. The Redux dispatch
 * pattern is preserved — UI components still dispatch `updateMapDirective(...)`.
 *
 * Supported directives:
 *   createMarker        — crosshair cursor, one-shot click → save position
 *   cancelCreateMarker  — clear directive, reset cursor
 *   editMarker          — Translate interaction on target feature
 *   cancelEditMarker    — clear directive, reset cursor
 *   editPolyline        — Modify interaction on target feature (add/move/delete vertices)
 *   saveEditPolyline    — remove interaction, clear directive
 *   cancelEditPolyline  — revert path from DB, clear directive
 *
 * Returns null — headless behavior component.
 */

import { useEffect, useRef } from "react";
import type { MapBrowserEvent } from "ol";
import type OLMap from "ol/Map";
import type Feature from "ol/Feature";
import type { Geometry } from "ol/geom";
import type { Coordinate } from "ol/coordinate";
import { Point, LineString } from "ol/geom";
import { Translate, Modify } from "ol/interaction";
import { Collection } from "ol";
import { singleClick, primaryAction } from "ol/events/condition";
import { Style, Circle as CircleStyle, Fill, Stroke } from "ol/style";
import throttle from "lodash/throttle";

import { useAppSelector, refEqual } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { updateMapDirective } from "store/map";
import { thunkDocUpdateTraverse, thunkDocResetTraverse } from "store/thunk/thunkTraverse";
import { thunkDocUpdateWalkback, thunkDocResetWalkback } from "store/thunk/thunkStation";
import { thunkUpdateMeasurementPath } from "store/thunk/thunkMeasurement";
import { cancelAllMeasurementElevations } from "store/thunk/measurementElevationScheduler";

import { thunkDocUpdateLanderLocation } from "store/thunk/thunkMission";
import { thunkDocUpdateStationLocation } from "store/thunk/thunkStation";
import { thunkDocUpdatePoiLocation } from "store/thunk/thunkPoi";
import { thunkDocUpdateActionLocation } from "store/thunk/thunkAction";
import { thunkDocUpdatePosEntryWithLocation } from "store/thunk/thunkRexPosEntry";

import { useMapContext } from "../MapProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Search all VectorLayer sources on the map to find a feature by ID.
 * OL doesn't have a global feature registry, so we iterate layers.
 */
function findFeatureOnMap(map: OLMap, featureId: string): Feature<Geometry> | null {
  let found: Feature<Geometry> | null = null;
  map.getLayers().forEach((layer) => {
    if (found) return;
    const source = (
      layer as { getSource?: () => { getFeatureById?: (id: string) => Feature | null } }
    ).getSource?.();
    if (source?.getFeatureById) {
      const f = source.getFeatureById(featureId);
      if (f) found = f as Feature<Geometry>;
    }
  });
  return found;
}

/**
 * Dispatch the correct save-position thunk based on `mapItemType`.
 */
function saveItemPosition(
  dispatch: ReturnType<typeof useAppDispatch>,
  uuid: string,
  mapItemType: string,
  location: AEGISPoint
) {
  switch (mapItemType) {
    case "lander":
      dispatch(thunkDocUpdateLanderLocation({ location }));
      break;
    case "station":
      dispatch(thunkDocUpdateStationLocation({ location, stationUuid: uuid }));
      break;
    case "poi":
      dispatch(thunkDocUpdatePoiLocation({ location, poiUuid: uuid }));
      break;
    case "action":
      dispatch(thunkDocUpdateActionLocation({ location, actionUuid: uuid }));
      break;
    case "posEntry":
      dispatch(thunkDocUpdatePosEntryWithLocation({ location, posEntryUuid: uuid }));
      break;
  }
}

// ---------------------------------------------------------------------------
// Module-scope constants
// ---------------------------------------------------------------------------

const vertexStyle = new Style({
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: "rgba(255, 255, 255, 0.9)" }),
    stroke: new Stroke({ color: "#ff6600", width: 2 }),
  }),
});

// Pixel radius around an anchored endpoint within which pointer interactions are
// blocked. Matches OL Modify's default vertex pixelTolerance (10) so that any
// point close enough for Modify to snap to the endpoint vertex is also guarded.
const ENDPOINT_PIXEL_TOLERANCE = 10;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ActiveInteraction {
  cleanup: () => void;
}

export function InteractionManager(): null {
  const { map } = useMapContext();
  const dispatch = useAppDispatch();
  const { toAegisPoint } = useCoordConverters();

  const mapDirective = useAppSelector((s) => s.map.mapDirective, refEqual);

  // Selection/navigation context — used to auto-cancel an in-progress edit when
  // the user navigates away (selects a different traverse, station, POI,
  // measurement, or switches section / bottom tab). See the watcher effect below.
  const sectionSelected = useAppSelector((s) => s.interface.sectionSelectedLabel, refEqual);
  const bottomSectionSelected = useAppSelector(
    (s) => s.interface.bottomSectionSelectedLabel,
    refEqual
  );
  const selectedPoiUuid = useAppSelector((s) => s.poi.selectedPoiUuid, refEqual);
  const selectedStationUuid = useAppSelector((s) => s.station.selectedStationUuid, refEqual);
  const selectedSeqItemUuid = useAppSelector((s) => s.eva.selectedEvaSequenceItemUuid, refEqual);
  const selectedMeasurementUuid = useAppSelector(
    (s) => s.measure.selectedMeasurementUuid,
    refEqual
  );
  const selectionKey = `${sectionSelected}|${bottomSectionSelected}|${selectedPoiUuid}|${selectedStationUuid}|${selectedSeqItemUuid}|${selectedMeasurementUuid}`;
  const selectionKeyAtEditStartRef = useRef<string | null>(null);

  useEffect(() => () => cancelAllMeasurementElevations(), []);

  // Track the active interaction so we can clean up on directive change
  const activeRef = useRef<ActiveInteraction | null>(null);

  // Auto-cancel an in-progress edit when the user navigates away.
  // An active edit implies its target item is selected. If ANY selection
  // (section, POI, station, EVA sequence item, measurement) then changes, the
  // user has moved on — so tear the edit down. This prevents a stale OL
  // Modify/Translate interaction from surviving a context switch (which lets the
  // user "drag when not in edit mode" and crashes when starting a new edit).
  // A snapshot ref avoids clearing on the initial selection mismatch that exists
  // when the edit first becomes active.
  useEffect(() => {
    const isEditAction =
      mapDirective != null &&
      mapDirective.mapItemType !== "posEntry" &&
      (mapDirective.mapAction === "editPolyline" ||
        mapDirective.mapAction === "editMarker" ||
        mapDirective.mapAction === "createMarker");

    if (!isEditAction) {
      selectionKeyAtEditStartRef.current = null;
      return;
    }

    if (selectionKeyAtEditStartRef.current === null) {
      // Edit just became active — snapshot the current selection context.
      selectionKeyAtEditStartRef.current = selectionKey;
    } else if (selectionKeyAtEditStartRef.current !== selectionKey) {
      // Selection/navigation changed while editing → cancel the edit.
      dispatch(updateMapDirective(null));
    }
  }, [mapDirective, selectionKey, dispatch]);

  useEffect(() => {
    const el = map.getTargetElement();

    if (!mapDirective) {
      if (el) el.style.cursor = "";
      return;
    }

    switch (mapDirective.mapAction) {
      // -----------------------------------------------------------------
      // CREATE MARKER — crosshair + one-shot click
      // -----------------------------------------------------------------
      case "createMarker": {
        if (el) el.style.cursor = "crosshair";

        const handleClick = (evt: MapBrowserEvent<PointerEvent>) => {
          const location = toAegisPoint(evt.coordinate);
          saveItemPosition(dispatch, mapDirective.uuid, mapDirective.mapItemType, location);
          dispatch(updateMapDirective(null));
        };

        map.once("click", handleClick);

        activeRef.current = {
          cleanup: () => {
            map.un("click", handleClick);
            if (el) el.style.cursor = "";
          },
        };
        break;
      }

      // -----------------------------------------------------------------
      // CANCEL CREATE — just clear
      // -----------------------------------------------------------------
      case "cancelCreateMarker": {
        dispatch(updateMapDirective(null));
        if (el) el.style.cursor = "";
        break;
      }

      // -----------------------------------------------------------------
      // EDIT MARKER — Translate interaction on the target feature
      // -----------------------------------------------------------------
      case "editMarker": {
        const feature = findFeatureOnMap(map, mapDirective.uuid);
        if (!feature) {
          dispatch(updateMapDirective(null));
          break;
        }

        if (el) el.style.cursor = "crosshair";

        const translate = new Translate({
          features: new Collection([feature]),
        });

        // Click-to-place: clicking anywhere moves the marker to that point and finishes the edit.
        const handleClick = (evt: MapBrowserEvent<PointerEvent>) => {
          const location = toAegisPoint(evt.coordinate);
          saveItemPosition(dispatch, mapDirective.uuid, mapDirective.mapItemType, location);
          dispatch(updateMapDirective(null));
        };
        map.once("click", handleClick);

        // Show pointer cursor when hovering the draggable marker, default otherwise
        const handlePointerMove = (evt: MapBrowserEvent<PointerEvent>) => {
          const hit = map.hasFeatureAtPixel(evt.pixel, {
            layerFilter: (layer) => {
              const src = (layer as { getSource?: () => unknown }).getSource?.();
              return !!(
                src &&
                typeof (src as { getFeatureById?: unknown }).getFeatureById === "function" &&
                (src as { getFeatureById: (id: string) => unknown }).getFeatureById(
                  mapDirective.uuid
                )
              );
            },
            hitTolerance: 8,
          });
          // Crosshair over empty map (click-to-place), pointer over the marker (drag).
          if (el) el.style.cursor = hit ? "pointer" : "crosshair";
        };

        map.on("pointermove", handlePointerMove);

        translate.on("translatestart", () => {
          if (el) el.style.cursor = "grabbing";
        });

        translate.on("translateend", () => {
          const geom = feature.getGeometry();
          if (geom instanceof Point) {
            const location = toAegisPoint(geom.getCoordinates());
            saveItemPosition(dispatch, mapDirective.uuid, mapDirective.mapItemType, location);
          }
          dispatch(updateMapDirective(null));
        });

        map.addInteraction(translate);

        activeRef.current = {
          cleanup: () => {
            map.removeInteraction(translate);
            map.un("pointermove", handlePointerMove);
            map.un("click", handleClick);
            if (el) el.style.cursor = "";
          },
        };
        break;
      }

      // -----------------------------------------------------------------
      // CANCEL EDIT MARKER — just clear
      // -----------------------------------------------------------------
      case "cancelEditMarker": {
        dispatch(updateMapDirective(null));
        if (el) el.style.cursor = "";
        break;
      }

      // -----------------------------------------------------------------
      // EDIT POLYLINE — Modify interaction with throttled path saves
      // -----------------------------------------------------------------
      case "editPolyline": {
        if (el) el.style.cursor = "crosshair";

        // Walkback features use a prefixed ID: `walkback-${uuid}`
        const featureId =
          mapDirective.mapItemType === "walkback"
            ? `walkback-${mapDirective.uuid}`
            : mapDirective.uuid;
        const feature = findFeatureOnMap(map, featureId);
        if (!feature) {
          dispatch(updateMapDirective(null));
          break;
        }

        const geom = feature.getGeometry()!;

        // Pin anchored endpoints. Traverse and walkback endpoints are locked to
        // their neighboring station/lander (they snap back there on save
        // regardless), so the endpoint nodes must be non-interactive: they can't
        // be dragged, delete-clicked, or grabbed to add a node — only interior
        // vertices move, and new nodes can still be inserted elsewhere on the
        // line. Measurements are free-form, so their endpoints stay movable.
        const pinsEndpoints =
          mapDirective.mapItemType === "traverse" || mapDirective.mapItemType === "walkback";
        let pinnedFirst: Coordinate | null = null;
        let pinnedLast: Coordinate | null = null;
        if (pinsEndpoints && geom instanceof LineString) {
          const coords = geom.getCoordinates();
          pinnedFirst = coords[0];
          pinnedLast = coords[coords.length - 1];
        }

        // A coordinate is an anchored endpoint if it matches a pinned endpoint.
        const isPinnedEndpoint = (c: Coordinate): boolean =>
          !!(
            (pinnedFirst && c[0] === pinnedFirst[0] && c[1] === pinnedFirst[1]) ||
            (pinnedLast && c[0] === pinnedLast[0] && c[1] === pinnedLast[1])
          );

        // True when the pointer is within grab range of an anchored endpoint.
        const nearPinnedEndpoint = (evt: MapBrowserEvent): boolean => {
          for (const anchor of [pinnedFirst, pinnedLast]) {
            if (!anchor) continue;
            const px = map.getPixelFromCoordinate(anchor);
            if (!px) continue;
            const dx = px[0] - evt.pixel[0];
            const dy = px[1] - evt.pixel[1];
            if (dx * dx + dy * dy <= ENDPOINT_PIXEL_TOLERANCE ** 2) return true;
          }
          return false;
        };

        const modify = new Modify({
          features: new Collection([feature]),
          // Block starting a drag/insert on an anchored endpoint vertex.
          condition: pinsEndpoints
            ? (evt) => primaryAction(evt) && !nearPinnedEndpoint(evt)
            : primaryAction,
          // Block delete-clicking an anchored endpoint vertex.
          deleteCondition: pinsEndpoints
            ? (evt) => singleClick(evt) && !nearPinnedEndpoint(evt)
            : singleClick,
          // Hide the drag-anchor overlay on anchored endpoints so they don't
          // look draggable.
          style: pinsEndpoints
            ? (vertexFeat) => {
                const g = vertexFeat.getGeometry();
                return g instanceof Point && isPinnedEndpoint(g.getCoordinates())
                  ? undefined
                  : vertexStyle;
              }
            : vertexStyle,
        });

        // Throttled live save: fires during drag via geometry change event.
        // Measurements compute distances/bearings synchronously (no elevation fetch)
        // to update the timeline in real time. Full thunk runs on modifyend.
        const throttledSave = throttle(() => {
          const liveGeom = feature.getGeometry();
          if (!(liveGeom instanceof LineString)) return;
          const path = liveGeom.getCoordinates().map((c) => toAegisPoint(c));

          if (mapDirective.mapItemType === "traverse") {
            dispatch(thunkDocUpdateTraverse({ path, traverseUuid: mapDirective.uuid }));
          } else if (mapDirective.mapItemType === "walkback") {
            dispatch(thunkDocUpdateWalkback({ path, stationUuid: mapDirective.uuid }));
          } else if (mapDirective.mapItemType === "measurement") {
            dispatch(thunkUpdateMeasurementPath({ path, measurementUuid: mapDirective.uuid }));
          }
        }, 100);

        // Attach to geometry change — fires on every vertex move during drag.
        // Safety net: even though the conditions above prevent grabbing an
        // anchored endpoint, re-pin it here if any change ever slips through
        // (e.g. when the endpoint pixel isn't resolvable), so the line never
        // visually detaches from the lander/station.
        let restoringEndpoints = false;
        const restoreEndpoints = () => {
          if (restoringEndpoints || !(geom instanceof LineString)) return;
          if (!pinnedFirst && !pinnedLast) return;
          const coords = geom.getCoordinates();
          const last = coords.length - 1;
          let changed = false;
          if (pinnedFirst && (coords[0][0] !== pinnedFirst[0] || coords[0][1] !== pinnedFirst[1])) {
            coords[0] = pinnedFirst;
            changed = true;
          }
          if (
            pinnedLast &&
            (coords[last][0] !== pinnedLast[0] || coords[last][1] !== pinnedLast[1])
          ) {
            coords[last] = pinnedLast;
            changed = true;
          }
          if (changed) {
            restoringEndpoints = true;
            geom.setCoordinates(coords);
            restoringEndpoints = false;
          }
        };

        // Restore before the throttled save so it always persists pinned endpoints.
        if (pinsEndpoints) geom.on("change", restoreEndpoints);
        geom.on("change", throttledSave);

        // Full save on modify end: includes elevation + endpoint snapping for traverses
        const handleModifyEnd = async () => {
          if (mapDirective.mapItemType === "measurement") throttledSave.cancel();
          else throttledSave.flush();
          const geomEnd = feature.getGeometry();
          if (!(geomEnd instanceof LineString)) return;
          const path = geomEnd.getCoordinates().map((c) => toAegisPoint(c));

          if (mapDirective.mapItemType === "traverse") {
            await dispatch(thunkDocUpdateTraverse({ traverseUuid: mapDirective.uuid, path }));
          } else if (mapDirective.mapItemType === "walkback") {
            dispatch(thunkDocUpdateWalkback({ path, stationUuid: mapDirective.uuid }));
          } else if (mapDirective.mapItemType === "measurement") {
            dispatch(
              thunkUpdateMeasurementPath({
                path,
                measurementUuid: mapDirective.uuid,
                final: true,
              })
            );
          }
        };

        modify.on("modifyend", handleModifyEnd);
        map.addInteraction(modify);

        activeRef.current = {
          cleanup: () => {
            geom.un("change", throttledSave);
            if (pinsEndpoints) geom.un("change", restoreEndpoints);
            throttledSave.cancel();
            map.removeInteraction(modify);
            if (el) el.style.cursor = "";
          },
        };
        break;
      }

      // -----------------------------------------------------------------
      // SAVE EDIT POLYLINE — just clear (store already has latest path)
      // -----------------------------------------------------------------
      case "saveEditPolyline": {
        dispatch(updateMapDirective(null));
        if (el) el.style.cursor = "";
        break;
      }

      // -----------------------------------------------------------------
      // CANCEL EDIT POLYLINE — revert path from DB copy
      // -----------------------------------------------------------------
      case "cancelEditPolyline": {
        if (mapDirective.mapItemType === "traverse") {
          dispatch(thunkDocResetTraverse({ traverseUuid: mapDirective.uuid }));
        } else if (mapDirective.mapItemType === "walkback") {
          dispatch(thunkDocResetWalkback({ stationUuid: mapDirective.uuid }));
        }
        dispatch(updateMapDirective(null));
        if (el) el.style.cursor = "";
        break;
      }

      default:
        break;
    }

    // Effect cleanup: if the component unmounts or directive changes, clean up
    return () => {
      if (activeRef.current) {
        activeRef.current.cleanup();
        activeRef.current = null;
      }
    };
  }, [mapDirective, map, dispatch, toAegisPoint]);

  return null;
}
