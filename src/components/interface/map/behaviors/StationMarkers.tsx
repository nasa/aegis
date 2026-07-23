/**
 * StationMarkers — behavior component for station markers on the OL map.
 *
 * Reads station data, computes which stations to show (EVA sequence +
 * as-planned + folder visibility), reconciles features on the shared stationSource,
 * and attaches a per-map VectorLayer with mode-specific styles.
 *
 * Supports click, hover, and drag interactions per mode config.
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
import { selectAsPlannedStations } from "store/selectors";
import { thunkMarkerOnClick } from "store/thunk/thunkMap";
import { thunkDocUpdateStationLocation } from "store/thunk/thunkStation";
import { useMissionDocSelector } from "utils/useDocSelector";
import { setHoverUuidsForSequence, clearMapItemHover } from "store/hover";
import { updateMapDirective } from "store/map";

import { useMapContext } from "../MapProvider";
import { MODE_CONFIGS } from "../utils/modeConfig";
import { useFeatureSourcesContext } from "../FeatureSourcesProvider";
import { useMapMenuContext } from "../MapMenuProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { reconcileFeatures, type FeatureDescriptor } from "../utils/featureReconciler";
import { buildStationStyleFunction } from "../utils/styles/markers";
import { Z_INDEX } from "../utils/zIndex";

export function StationMarkers(): null {
  const { map, mode } = useMapContext();
  const config = MODE_CONFIGS[mode];
  const dispatch = useAppDispatch();
  const { stationSource } = useFeatureSourcesContext();
  const { submenuStations: mapDisplayStations } = useMapMenuContext();
  const { toMapCoord, toAegisPoint } = useCoordConverters();

  // --- Redux UI state ---
  const selectedEvaUuid = useAppSelector((s) => s.eva.selectedEvaUuid, refEqual);
  const selectedStationUuid = useAppSelector((s) => s.station.selectedStationUuid, refEqual);
  const sectionSelected = useAppSelector((s) => s.interface.sectionSelectedLabel, refEqual);
  const folders = useAppSelector((s) => s.interface.folders, deepEqual);
  const foldersInterface = useAppSelector((s) => s.interface.foldersInterface, deepEqual);
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

  const allStationsFromDoc = useMissionDocSelector(
    (m) => Object.values(m.stations ?? {}),
    deepEqual
  );
  const asPlannedStationsFromDoc = useMissionDocSelector(selectAsPlannedStations, deepEqual);

  // Dashboard in-progress stations for highlighting. Only stations whose REX
  // activity status is actually "in-progress" get the green ring — merely
  // belonging to the running EVA's sequence (e.g. still "pending") does not.
  const stationsInProgressFromDoc = useMissionDocSelector((m) => {
    if (mode !== "dashboard") return [];
    const runningRex = Object.values(m.rexes ?? {}).find((r) => r.isRunning);
    if (!runningRex?.stationEntries) return [];
    const eva = m.evas?.[runningRex.evaUuid];
    if (!eva?.sequence) return [];
    return eva.sequence
      .filter(
        (item) =>
          item.type === "station" &&
          runningRex.stationEntries?.[item.uuid]?.rexStatus === "in-progress"
      )
      .map((item) => item.uuid);
  }, deepEqual);
  const stationsInProgress = useMemo(
    () => stationsInProgressFromDoc ?? [],
    [stationsInProgressFromDoc]
  );

  // Minimap: scope stations to the running REX EVA only (config-driven, so the
  // minimap never shows the eyeball/as-planned stations that the big map does).
  const runningEvaStationUuids = useMissionDocSelector((m) => {
    if (!config.station.limitToRunningEva) return null;
    const runningRex = Object.values(m.rexes ?? {}).find((r) => r.isRunning);
    const eva = runningRex ? m.evas?.[runningRex.evaUuid] : null;
    if (!eva?.sequence) return [];
    const uuids = eva.sequence.filter((item) => item.type === "station").map((item) => item.uuid);
    if (eva.egressLocationUuid && eva.egressLocationUuid !== "lander") {
      uuids.push(eva.egressLocationUuid);
    }
    if (eva.ingressLocationUuid && eva.ingressLocationUuid !== "lander") {
      uuids.push(eva.ingressLocationUuid);
    }
    return uuids;
  }, deepEqual);

  // Refs
  const layerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const translateRef = useRef<Translate | null>(null);

  // --- VectorLayer (one per map, shared source) ---
  useEffect(() => {
    const layer = new VectorLayer({
      source: stationSource,
      zIndex: Z_INDEX.STATIONS,
    });
    map.addLayer(layer);
    layerRef.current = layer;

    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, stationSource]);

  // --- Compute stations to show ---
  const stationsToShow = useMemo((): Station[] => {
    const allStations = allStationsFromDoc ?? [];
    const asPlannedStations = asPlannedStationsFromDoc ?? [];

    // Minimap: show only the running REX EVA's stations, bypassing all the
    // eyeball / as-planned / folder logic below.
    if (config.station.limitToRunningEva) {
      const set = new Set(runningEvaStationUuids ?? []);
      return allStations.filter(
        (s) => set.has(s.uuid) && s.location?.lat != null && s.location?.lng != null
      );
    }

    const uuidsToShow = new Set<string>();

    // Always show EVA sequence stations
    if (selectedEva) {
      const stationItems = selectedEva.sequence?.filter((item) => item.type === "station") ?? [];
      for (const item of stationItems) {
        if (item.uuid) uuidsToShow.add(item.uuid);
      }
      if (selectedEva.egressLocationUuid !== "lander") {
        uuidsToShow.add(selectedEva.egressLocationUuid);
      }
      if (selectedEva.ingressLocationUuid !== "lander") {
        uuidsToShow.add(selectedEva.ingressLocationUuid);
      }
    } else if (
      selectedStationUuid &&
      (sectionSelected === "station" || sectionSelected === "evas")
    ) {
      uuidsToShow.add(selectedStationUuid);
    }

    // As-planned stations (filtered by eyeball + folders)
    if (mapDisplayStations.show) {
      const stationFolders = folders.filter((f: Folder) => f.type === "station");
      for (const station of asPlannedStations) {
        const folder = stationFolders.find((f: Folder) => f.items.includes(station.uuid));
        if (!folder) {
          uuidsToShow.add(station.uuid);
        } else {
          const fi = foldersInterface.find(
            (fi: { uuid: string; visible: boolean }) => fi.uuid === folder.uuid
          );
          if (!fi || fi.visible) {
            uuidsToShow.add(station.uuid);
          }
        }
      }
    }

    // Keep the station being edited/created visible even if its folder/eyeball
    // would hide it, so InteractionManager can find its feature.
    if (
      (mapDirective?.mapAction === "editMarker" || mapDirective?.mapAction === "createMarker") &&
      mapDirective.mapItemType === "station"
    ) {
      uuidsToShow.add(mapDirective.uuid);
    }

    return allStations.filter(
      (s) => uuidsToShow.has(s.uuid) && s.location?.lat != null && s.location?.lng != null
    );
  }, [
    config.station.limitToRunningEva,
    runningEvaStationUuids,
    mapDirective,
    selectedEva,
    selectedStationUuid,
    sectionSelected,
    mapDisplayStations.show,
    allStationsFromDoc,
    asPlannedStationsFromDoc,
    folders,
    foldersInterface,
  ]);

  // --- Reconcile features on shared source ---
  useEffect(() => {
    const mapper = (station: Station): FeatureDescriptor | null => {
      if (!station.location || station.location.lat == null || station.location.lng == null) {
        return null;
      }
      return {
        id: station.uuid,
        geometry: new Point(toMapCoord(station.location)),
        properties: {
          emoji: station.icon || "2754",
          name: station.name,
          mapItemType: "station",
        },
      };
    };

    reconcileFeatures(stationSource, stationsToShow, mapper);
    // Force repaint so property changes (e.g. icon) are picked up by style functions
    stationSource.changed();
  }, [stationsToShow, stationSource, toMapCoord]);

  // --- Style function (updates when selection / display changes) ---
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const styleFn = buildStationStyleFunction(config, selectedStationUuid, stationsInProgress);
    layer.setStyle(styleFn);
  }, [config, selectedStationUuid, stationsInProgress]);

  // --- Click handler ---
  useEffect(() => {
    if (!config.station.clickable) return;
    if (editActive) return; // reference markers are non-interactive during an edit

    const handleClick = (evt: MapBrowserEvent) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === layerRef.current,
      });
      if (hit) {
        evt.stopPropagation();
        const uuid = hit.getId() as string;
        dispatch(thunkMarkerOnClick({ markerUuid: uuid, mapItemType: "station" }));
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
        dispatch(setHoverUuidsForSequence({ sequenceUuid: uuid, mapItemType: "station" }));
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
    // Translate; reference stations must not be draggable.
    if (editActive) return;

    // Only allow dragging the currently selected station
    const translate = new Translate({
      features: new Collection<Feature>([]),
      filter: (feature) => {
        return feature.getId() === selectedStationUuid;
      },
    });

    translate.on("translateend", (evt) => {
      const feature = evt.features.item(0);
      if (!feature) return;
      const uuid = feature.getId() as string;
      const geom = feature.getGeometry() as Point;
      const newLocation = toAegisPoint(geom.getCoordinates());
      dispatch(thunkDocUpdateStationLocation({ location: newLocation, stationUuid: uuid }));
      dispatch(updateMapDirective(null));
    });

    map.addInteraction(translate);
    translateRef.current = translate;

    return () => {
      map.removeInteraction(translate);
      translateRef.current = null;
    };
  }, [map, config.station.draggable, editActive, selectedStationUuid, toAegisPoint, dispatch]);

  return null;
}
