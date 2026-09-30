/**
 * WalkbackLines — behavior component for station walkback polylines.
 *
 * Draws the walkback path (dashed red line) for the currently selected station.
 * Only shown in editor mode when the station/evas section is active and
 * showWalkbacks is enabled in the map menu settings.
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
import { setSectionSelected } from "store/interface";
import { setSelectedStationUuid } from "store/station";
import { setHoverUuidsForSequence, clearMapItemHover } from "store/hover";

import { useMapContext } from "../MapProvider";
import { useFeatureSourcesContext } from "../FeatureSourcesProvider";
import { useMapMenuContext } from "../MapMenuProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { reconcileFeatures, type FeatureDescriptor } from "../utils/featureReconciler";
import { buildWalkbackStyleFunction } from "../utils/styles/polylines";
import { Z_INDEX } from "../utils/zIndex";

export function WalkbackLines(): null {
  const { map } = useMapContext();
  const dispatch = useAppDispatch();
  const { walkbackSource } = useFeatureSourcesContext();
  const { submenuStations: mapDisplayStations } = useMapMenuContext();
  const { toMapCoord } = useCoordConverters();

  // --- Redux UI state ---
  const selectedStationUuid = useAppSelector((s) => s.station.selectedStationUuid, refEqual);
  const sectionSelected = useAppSelector((s) => s.interface.sectionSelectedLabel, refEqual);
  const mapDirective = useAppSelector((s) => s.map.mapDirective, refEqual);

  // While any map directive is active — a marker/path edit OR a crew-position
  // placement — reference features stay visible but are made non-interactive.
  // Otherwise, hovering another item during placement would highlight it and
  // flip the placement crosshair back to the default arrow cursor.
  const editActive = !!mapDirective;

  // --- Automerge doc state ---
  const selectedStation = useMissionDocSelector((m) => {
    return selectedStationUuid ? (m.stations?.[selectedStationUuid] ?? null) : null;
  }, deepEqual);

  const layerRef = useRef<VectorLayer<VectorSource> | null>(null);

  // --- Layer setup ---
  useEffect(() => {
    const layer = new VectorLayer({
      source: walkbackSource,
      zIndex: Z_INDEX.POLYLINES,
      style: buildWalkbackStyleFunction(),
    });
    map.addLayer(layer);
    layerRef.current = layer;

    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, walkbackSource]);

  // --- Walkback path data ---
  const walkbackItems = useMemo(() => {
    let items: { uuid: string; path: AEGISPoint[] }[] = [];

    if (
      (sectionSelected === "station" || sectionSelected === "evas") &&
      selectedStation?.walkbackPath &&
      mapDisplayStations.showWalkbacks
    ) {
      const path = selectedStation.walkbackPath;
      if (path.length >= 2 && path.every((p) => p.lat != null && p.lng != null)) {
        items = [{ uuid: selectedStation.uuid, path }];
      }
    }

    // Ensure the walkback being edited is present so InteractionManager's Modify
    // interaction can find it.
    if (
      mapDirective?.mapAction === "editPolyline" &&
      mapDirective.mapItemType === "walkback" &&
      selectedStation?.walkbackPath &&
      selectedStation.walkbackPath.length >= 2 &&
      !items.some((i) => i.uuid === selectedStation.uuid)
    ) {
      items = [...items, { uuid: selectedStation.uuid, path: selectedStation.walkbackPath }];
    }

    return items;
  }, [mapDirective, sectionSelected, selectedStation, mapDisplayStations.showWalkbacks]);

  // --- Reconcile ---
  // During editPolyline, skip geometry updates — OL Modify interaction owns the feature geometry.
  const isEditingWalkback =
    mapDirective?.mapAction === "editPolyline" && mapDirective?.mapItemType === "walkback";

  useEffect(() => {
    const mapper = (item: { uuid: string; path: AEGISPoint[] }): FeatureDescriptor | null => {
      const coords = item.path
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => toMapCoord(p));
      if (coords.length < 2) return null;
      return {
        id: `walkback-${item.uuid}`,
        geometry: isEditingWalkback ? null : new LineString(coords),
        properties: {
          mapItemType: "walkback",
          stationUuid: item.uuid,
        },
      };
    };

    reconcileFeatures(walkbackSource, walkbackItems, mapper);
  }, [walkbackItems, walkbackSource, toMapCoord, isEditingWalkback]);

  // --- Click handler ---
  useEffect(() => {
    if (editActive) return; // reference lines are non-interactive during an edit

    const handleClick = (evt: MapBrowserEvent) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === layerRef.current,
        hitTolerance: 5,
      });
      if (hit) {
        const stationUuid = hit.get("stationUuid") as string;
        if (stationUuid) {
          dispatch(setSectionSelected("station"));
          dispatch(setSelectedStationUuid(stationUuid));
        }
      }
    };

    map.on("click", handleClick);
    return () => map.un("click", handleClick);
  }, [map, editActive, dispatch]);

  // --- Hover handler ---
  useEffect(() => {
    if (editActive) return; // reference lines are non-interactive during an edit

    let isHovering = false;

    const handlePointerMove = (evt: MapBrowserEvent) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === layerRef.current,
        hitTolerance: 5,
      });
      if (hit) {
        const stationUuid = hit.get("stationUuid") as string;
        if (stationUuid) {
          dispatch(
            setHoverUuidsForSequence({ sequenceUuid: stationUuid, mapItemType: "walkback" })
          );
        }
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
      }
      const el = map.getTargetElement();
      if (el) el.style.cursor = "";
    };
  }, [map, editActive, dispatch]);

  return null;
}
