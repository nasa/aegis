/**
 * PoiMarkers — behavior component for POI markers on the OL map.
 *
 * Reads POI data, applies folder visibility filtering, reconciles
 * features on the shared poiSource, and renders via a per-map VectorLayer.
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
import { thunkMarkerOnClick } from "store/thunk/thunkMap";
import { thunkDocUpdatePoiLocation } from "store/thunk/thunkPoi";
import { useMissionDocSelector } from "utils/useDocSelector";
import { setHoverUuidsForSequence, clearMapItemHover } from "store/hover";
import { updateMapDirective } from "store/map";

import { useMapContext } from "../MapProvider";
import { MODE_CONFIGS } from "../utils/modeConfig";
import { useFeatureSourcesContext } from "../FeatureSourcesProvider";
import { useMapMenuContext } from "../MapMenuProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { reconcileFeatures, type FeatureDescriptor } from "../utils/featureReconciler";
import { buildPoiStyleFunction } from "../utils/styles/markers";
import { Z_INDEX } from "../utils/zIndex";

export function PoiMarkers(): null {
  const { map, mode } = useMapContext();
  const config = MODE_CONFIGS[mode];
  const dispatch = useAppDispatch();
  const { poiSource } = useFeatureSourcesContext();
  const { submenuPois: mapDisplayPois } = useMapMenuContext();
  const { toMapCoord, toAegisPoint } = useCoordConverters();

  // --- Redux UI state ---
  const selectedPoiUuid = useAppSelector((s) => s.poi.selectedPoiUuid, refEqual);

  // --- Automerge doc state ---
  const poisFromDoc = useMissionDocSelector((m) => Object.values(m.pois ?? {}), deepEqual);
  const sectionSelected = useAppSelector((s) => s.interface.sectionSelectedLabel, refEqual);
  const folders = useAppSelector((s) => s.interface.folders, deepEqual);
  const foldersInterface = useAppSelector((s) => s.interface.foldersInterface, deepEqual);
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
      source: poiSource,
      zIndex: Z_INDEX.POIS,
    });
    map.addLayer(layer);
    layerRef.current = layer;

    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, poiSource]);

  // --- POIs to show ---
  const poisToShow = useMemo((): POI[] => {
    const pois = poisFromDoc ?? [];

    let result: POI[] = [];

    if (mapDisplayPois.show) {
      const poiFolders = folders.filter((f: Folder) => f.type === "poi");
      result = pois.filter((poi) => {
        if (poi.uuid === selectedPoiUuid) return true;
        const folder = poiFolders.find((f: Folder) => f.items.includes(poi.uuid));
        if (!folder) return true;
        const fi = foldersInterface.find(
          (fi: { uuid: string; visible: boolean }) => fi.uuid === folder.uuid
        );
        return !fi || fi.visible;
      });
    } else if (selectedPoiUuid && sectionSelected === "poi") {
      const sel = pois.find((p) => p.uuid === selectedPoiUuid);
      if (sel) result = [sel];
    }

    // Keep the POI being edited/created visible even if hidden by folder/eyeball,
    // so InteractionManager can find its feature.
    if (
      (mapDirective?.mapAction === "editMarker" || mapDirective?.mapAction === "createMarker") &&
      mapDirective.mapItemType === "poi" &&
      !result.some((p) => p.uuid === mapDirective.uuid)
    ) {
      const editing = pois.find((p) => p.uuid === mapDirective.uuid);
      if (editing) result = [...result, editing];
    }

    return result.filter((p) => p.location?.lat != null && p.location?.lng != null);
  }, [
    mapDirective,
    mapDisplayPois.show,
    poisFromDoc,
    selectedPoiUuid,
    sectionSelected,
    folders,
    foldersInterface,
  ]);

  // --- Reconcile features ---
  useEffect(() => {
    const mapper = (poi: POI): FeatureDescriptor | null => {
      if (!poi.location || poi.location.lat == null || poi.location.lng == null) return null;
      return {
        id: poi.uuid,
        geometry: new Point(toMapCoord(poi.location)),
        properties: {
          emoji: poi.icon || "1f534",
          name: poi.name,
          mapItemType: "poi",
        },
      };
    };

    reconcileFeatures(poiSource, poisToShow, mapper);
    // Force repaint so property changes (e.g. icon) are picked up by style functions
    poiSource.changed();
  }, [poisToShow, poiSource, toMapCoord]);

  // --- Style function ---
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const styleFn = buildPoiStyleFunction(selectedPoiUuid, config.station.iconSize);
    layer.setStyle(styleFn);
  }, [selectedPoiUuid, config.station.iconSize]);

  // --- Click handler ---
  useEffect(() => {
    if (!config.station.clickable) return; // POI clickable follows station config
    if (editActive) return; // reference markers are non-interactive during an edit

    const handleClick = (evt: MapBrowserEvent) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === layerRef.current,
      });
      if (hit) {
        evt.stopPropagation();
        dispatch(thunkMarkerOnClick({ markerUuid: hit.getId() as string, mapItemType: "poi" }));
      }
    };

    map.on("click", handleClick);
    return () => map.un("click", handleClick);
  }, [map, config.station.clickable, editActive, dispatch]);

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
        dispatch(setHoverUuidsForSequence({ sequenceUuid: uuid, mapItemType: "poi" }));
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

  // --- Drag interaction ---
  useEffect(() => {
    if (!config.station.draggable) return;
    // During an edit, the edited marker is dragged via InteractionManager's
    // Translate; reference POIs must not be draggable.
    if (editActive) return;

    const translate = new Translate({
      features: new Collection<Feature>([]),
      filter: (feature) => feature.getId() === selectedPoiUuid,
    });

    translate.on("translateend", (evt) => {
      const feature = evt.features.item(0);
      if (!feature) return;
      const uuid = feature.getId() as string;
      const geom = feature.getGeometry() as Point;
      const newLocation = toAegisPoint(geom.getCoordinates());
      dispatch(thunkDocUpdatePoiLocation({ location: newLocation, poiUuid: uuid }));
      dispatch(updateMapDirective(null));
    });

    map.addInteraction(translate);
    translateRef.current = translate;

    return () => {
      map.removeInteraction(translate);
      translateRef.current = null;
    };
  }, [map, config.station.draggable, editActive, selectedPoiUuid, toAegisPoint, dispatch]);

  return null;
}
