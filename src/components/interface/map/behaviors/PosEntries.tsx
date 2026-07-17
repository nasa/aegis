/**
 * PosEntries — behavior component for Position Entry (POS) markers and paths.
 *
 * POS markers are OL vector features on the shared `posSource` (one Point per
 * entry), styled by `buildPosMarkerStyleFunction` (stacked posType icons + color
 * bars). Rendering them as features — rather than the former `ol/Overlay` DOM
 * nodes — makes them hit-testable and editable through the same paths as every
 * other marker: `InteractionManager` finds them via `getFeatureById`, and
 * click/hover go through `forEachFeatureAtPixel`.
 *
 * POS paths use a canvas-rendered VectorLayer for performance (`posPathSource`).
 *
 * Labels (ticking PET-relative text) are NOT rendered here — they live on the
 * shared label layer (`MarkerLabels`), anchored to each entry's location.
 *
 * Display modes are controlled by `mapDisplayPos` from the eyeball menu:
 *   - 4 marker modes (all/latest/faded/none)
 *   - 3 label modes (all/latest/none)
 *   - 4 path modes (all/latest/faded/none)
 *   - N source filters
 *
 * Returns null — headless behavior component.
 */

import { useEffect, useRef, useMemo } from "react";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { LineString } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type { MapBrowserEvent } from "ol";
import orderBy from "lodash/orderBy";

import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { setSelectedPosEntryUuid } from "store/rex";
import { setHoverUuidsForPosEntry, clearMapItemHover } from "store/hover";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";

import { useMapContext } from "../MapProvider";
import { MODE_CONFIGS } from "../utils/modeConfig";
import { useFeatureSourcesContext } from "../FeatureSourcesProvider";
import { useMapMenuContext } from "../MapMenuProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { reconcileFeatures, type FeatureDescriptor } from "../utils/featureReconciler";
import { buildPosPathStyleFunction } from "../utils/styles/posPath";
import { buildPosMarkerStyleFunction, type PosMarkerIcon } from "../utils/styles/posMarker";
import { Z_INDEX } from "../utils/zIndex";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns up to 2 most recent entries per posType UUID.
 */
function getLatestPosEntryByType(allPosEntries: PosEntry[]): Record<string, PosEntry[]> {
  const result: Record<string, PosEntry[]> = {};
  const sorted = orderBy(allPosEntries, ["createdAt"], ["desc"]);

  for (const entry of sorted) {
    for (const posTypeUuid of entry.posTypeUuids) {
      if (!result[posTypeUuid]) result[posTypeUuid] = [];
      if (result[posTypeUuid].length < 2) {
        result[posTypeUuid].push(entry);
      }
    }
  }
  return result;
}

/**
 * Filter POS entries by source UUIDs and location validity.
 */
function filterPosEntries(posEntries: PosEntry[], mapDisplayPos: MapSubmenuPos): PosEntry[] {
  const withLocations = posEntries.filter(
    (e) => e.location && !isNaN(e.location.lat) && !isNaN(e.location.lng)
  );

  if (mapDisplayPos.sourceUuids.length > 0) {
    return withLocations.filter((e) => mapDisplayPos.sourceUuids.includes(e.posSourceUuid));
  }
  return withLocations;
}

/** A POS entry resolved to the data the marker style function needs. */
interface PosMarkerFeature {
  uuid: string;
  location: AEGISPoint;
  posMarkers: PosMarkerIcon[];
  faded: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PosEntries(): null {
  const { map, mode } = useMapContext();
  const config = MODE_CONFIGS[mode];
  const dispatch = useAppDispatch();
  const { posSource, posPathSource } = useFeatureSourcesContext();
  const { submenuPos: mapDisplayPos } = useMapMenuContext();
  const { toMapCoord } = useCoordConverters();

  // --- Redux UI state ---
  const sectionSelected = useAppSelector((s) => s.interface.sectionSelectedLabel, refEqual);
  const selectedRexUuid = useAppSelector((s) => s.rex.selectedRexUuid, refEqual);
  const mapDirective = useAppSelector((s) => s.map.mapDirective, refEqual);

  // While any map directive is active, reference markers stay visible but become
  // non-interactive — the edited item is manipulated only by InteractionManager.
  const editActive = !!mapDirective;

  // --- Automerge doc state ---
  const selectedRex = useMissionDocSelector((m) => {
    return selectedRexUuid ? (m.rexes?.[selectedRexUuid] ?? null) : null;
  }, deepEqual);

  const posEntries = useMissionDocSelector((m) => {
    return selectedRexUuid ? (m.rexes?.[selectedRexUuid]?.posEntries ?? []) : [];
  }, deepEqual);

  const posTypes = useMissionDocSelector((m) => {
    return selectedRexUuid ? (m.rexes?.[selectedRexUuid]?.posTypes ?? []) : [];
  }, deepEqual);

  const egressLocation = useMissionDocSelector((m) => {
    if (!selectedRexUuid) return null;
    const rex = m.rexes?.[selectedRexUuid];
    if (!rex) return null;
    const eva = m.evas?.[rex.evaUuid];
    if (!eva || eva.egressLocationUuid === "lander") return null;
    return m.stations?.[eva.egressLocationUuid]?.location ?? null;
  }, deepEqual);

  // --- Layers (one per map) ---
  const markerLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const pathLayerRef = useRef<VectorLayer<VectorSource> | null>(null);

  useEffect(() => {
    const markerLayer = new VectorLayer({ source: posSource, zIndex: Z_INDEX.POS_MARKERS });
    const pathLayer = new VectorLayer({ source: posPathSource, zIndex: Z_INDEX.POS_ENTRIES });
    map.addLayer(markerLayer);
    map.addLayer(pathLayer);
    markerLayerRef.current = markerLayer;
    pathLayerRef.current = pathLayer;

    return () => {
      map.removeLayer(markerLayer);
      map.removeLayer(pathLayer);
      markerLayerRef.current = null;
      pathLayerRef.current = null;
    };
  }, [map, posSource, posPathSource]);

  // --- Compute which entries to show ---
  const shouldShow = mapDisplayPos.show && sectionSelected === "evas" && !!selectedRex;

  const filteredEntries = useMemo(() => {
    if (!shouldShow) return [];
    return orderBy(filterPosEntries(posEntries, mapDisplayPos), ["createdAt"], ["desc"]);
  }, [shouldShow, posEntries, mapDisplayPos]);

  const latestByType = useMemo(() => getLatestPosEntryByType(filteredEntries), [filteredEntries]);

  // Set of UUIDs that are "latest" for at least one posType
  const latestUuids = useMemo(() => {
    const set = new Set<string>();
    for (const entries of Object.values(latestByType)) {
      if (entries[0]) set.add(entries[0].uuid);
    }
    return set;
  }, [latestByType]);

  // The pos entry currently being edited/created on the map, if any. Kept
  // visible regardless of eyeball/source filters so InteractionManager can find
  // its feature to attach the Translate.
  const editingUuid =
    mapDirective?.mapItemType === "posEntry" &&
    (mapDirective.mapAction === "editMarker" || mapDirective.mapAction === "createMarker")
      ? mapDirective.uuid
      : null;

  // --- Resolve visible marker features ---
  const markerFeatures = useMemo((): PosMarkerFeature[] => {
    // Order icons by their position in the REX's posTypes list (EV1, EV2, Cart, …)
    // so the stack is stable regardless of the order the user toggled types in.
    const posTypeIndex = (uuid: string): number => {
      const idx = posTypes.findIndex((p) => p.uuid === uuid);
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    };
    const toPosMarkers = (uuids: string[]): PosMarkerIcon[] =>
      [...uuids]
        .sort((a, b) => posTypeIndex(a) - posTypeIndex(b))
        .map((ptUuid) => {
          const pt = posTypes.find((p) => p.uuid === ptUuid);
          return {
            emoji: pt?.icon ?? "2754",
            isEV: (pt?.name ?? "").substring(0, 2) === "EV",
            color: pt?.pathColor ?? "#888",
          };
        });

    const result: PosMarkerFeature[] = [];
    const drawn = new Set<string>();

    if (shouldShow && mapDisplayPos.showMarkers) {
      for (const entry of filteredEntries) {
        if (!entry.location) continue;

        // Skip entries at egress location (epsilon — exact float equality misses
        // entries that round-tripped through projection or were edited/re-saved).
        // 1e-7° ≈ 1 cm at Earth-equator latitudes; below any meaningful pos drift.
        if (
          entry.uuid !== editingUuid &&
          egressLocation &&
          Math.abs(entry.location.lat - egressLocation.lat) < 1e-7 &&
          Math.abs(entry.location.lng - egressLocation.lng) < 1e-7
        ) {
          continue;
        }

        const isRecent = latestUuids.has(entry.uuid);
        const effectiveShowOldMarkers = config.pos.showOldMarkers && mapDisplayPos.showOldMarkers;
        if (!effectiveShowOldMarkers && !isRecent && entry.uuid !== editingUuid) continue;

        // Latest-only mode shows only the posTypes this entry is latest for.
        let visiblePosTypeUuids: string[];
        if (!effectiveShowOldMarkers && isRecent) {
          visiblePosTypeUuids = entry.posTypeUuids.filter(
            (ptUuid) => latestByType[ptUuid]?.[0]?.uuid === entry.uuid
          );
        } else {
          visiblePosTypeUuids = entry.posTypeUuids;
        }

        const posMarkers = toPosMarkers(visiblePosTypeUuids);
        if (posMarkers.length === 0) continue;

        result.push({
          uuid: entry.uuid,
          location: entry.location,
          posMarkers,
          faded: mapDisplayPos.fadeOldMarkers && !isRecent,
        });
        drawn.add(entry.uuid);
      }
    }

    // Always keep the entry being edited on the map, even if filters hide it.
    if (editingUuid && !drawn.has(editingUuid)) {
      const entry = posEntries.find((e) => e.uuid === editingUuid);
      if (entry?.location) {
        const posMarkers = toPosMarkers(entry.posTypeUuids);
        if (posMarkers.length > 0) {
          result.push({ uuid: entry.uuid, location: entry.location, posMarkers, faded: false });
        }
      }
    }

    return result;
  }, [
    shouldShow,
    mapDisplayPos,
    filteredEntries,
    latestUuids,
    latestByType,
    egressLocation,
    config,
    posTypes,
    posEntries,
    editingUuid,
  ]);

  // --- Reconcile marker features on shared source ---
  useEffect(() => {
    const mapper = (m: PosMarkerFeature): FeatureDescriptor => ({
      id: m.uuid,
      geometry: new Point(toMapCoord(m.location)),
      properties: {
        mapItemType: "posEntry",
        posMarkers: m.posMarkers,
        faded: m.faded,
      },
    });

    reconcileFeatures(posSource, markerFeatures, mapper);
    // Force repaint so composite icon/bar changes are picked up by the style fn.
    posSource.changed();
  }, [markerFeatures, posSource, toMapCoord]);

  // --- Marker style ---
  useEffect(() => {
    const layer = markerLayerRef.current;
    if (!layer) return;
    layer.setStyle(buildPosMarkerStyleFunction(config));
  }, [config]);

  // --- Click handler ---
  useEffect(() => {
    if (!config.map.interactive) return;
    if (editActive) return; // reference markers are non-interactive during an edit

    const handleClick = (evt: MapBrowserEvent) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === markerLayerRef.current,
        hitTolerance: 8,
      });
      if (hit) {
        evt.stopPropagation();
        const uuid = hit.getId() as string;
        dispatch(setSelectedPosEntryUuid(uuid));
        dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid: null }));
      }
    };

    map.on("click", handleClick);
    return () => map.un("click", handleClick);
  }, [map, config.map.interactive, editActive, dispatch]);

  // --- Hover handler ---
  useEffect(() => {
    if (!config.map.interactive) return;
    if (editActive) return; // reference markers are non-interactive during an edit

    let isHovering = false;

    const handlePointerMove = (evt: MapBrowserEvent) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === markerLayerRef.current,
        hitTolerance: 8,
      });
      if (hit) {
        dispatch(setHoverUuidsForPosEntry(hit.getId() as string));
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
      if (isHovering) dispatch(clearMapItemHover());
      const el = map.getTargetElement();
      if (el) el.style.cursor = "";
    };
  }, [map, config.map.interactive, editActive, dispatch]);

  // --- Reconcile path features ---
  useEffect(() => {
    posPathSource.clear();

    if (!shouldShow || !mapDisplayPos.showPaths || config.pos.drawPathWeight === false) return;

    if (!mapDisplayPos.showOldPaths) {
      // Latest-only paths: one short polyline per posType (latest 2 entries)
      for (const posType of posTypes) {
        const latestEntries = latestByType[posType.uuid];
        if (!latestEntries || latestEntries.length < 2) continue;

        const coords = latestEntries
          .slice()
          .reverse()
          .map((e) => toMapCoord(e.location));

        const feature = new Feature({
          geometry: new LineString(coords),
          color: posType.pathColor,
          opacity: 0.6,
        });
        feature.setId(`posPath-${posType.uuid}`);
        posPathSource.addFeature(feature);
      }
    } else {
      // All paths: one polyline per posType
      for (const posType of posTypes) {
        const entriesForType = filteredEntries.filter((e) => e.posTypeUuids.includes(posType.uuid));
        if (entriesForType.length < 2) continue;

        if (mapDisplayPos.fadeOldPaths) {
          // Faded old segment
          const oldEntries = entriesForType.slice(1);
          if (oldEntries.length >= 2) {
            const oldCoords = oldEntries
              .slice()
              .reverse()
              .map((e) => toMapCoord(e.location));
            const oldFeature = new Feature({
              geometry: new LineString(oldCoords),
              color: posType.pathColor,
              opacity: 0.2,
            });
            oldFeature.setId(`posPath-${posType.uuid}-faded`);
            posPathSource.addFeature(oldFeature);
          }

          // Latest segment (not faded)
          const latestEntries = entriesForType.slice(0, 2);
          if (latestEntries.length === 2) {
            const latestCoords = latestEntries
              .slice()
              .reverse()
              .map((e) => toMapCoord(e.location));
            const latestFeature = new Feature({
              geometry: new LineString(latestCoords),
              color: posType.pathColor,
              opacity: 0.6,
            });
            latestFeature.setId(`posPath-${posType.uuid}-latest`);
            posPathSource.addFeature(latestFeature);
          }
        } else {
          // No fade — single path per type
          const coords = entriesForType
            .slice()
            .reverse()
            .map((e) => toMapCoord(e.location));
          const feature = new Feature({
            geometry: new LineString(coords),
            color: posType.pathColor,
            opacity: 0.6,
          });
          feature.setId(`posPath-${posType.uuid}`);
          posPathSource.addFeature(feature);
        }
      }
    }
  }, [
    shouldShow,
    filteredEntries,
    latestByType,
    posTypes,
    mapDisplayPos,
    config,
    posPathSource,
    toMapCoord,
  ]);

  // --- Style for path layer ---
  useEffect(() => {
    const layer = pathLayerRef.current;
    if (!layer) return;
    const weight = config.pos.drawPathWeight;
    if (weight === false) {
      layer.setStyle(buildPosPathStyleFunction());
      return;
    }
    // Match the traverse chevrons for this mode: same arrow size, rendered at
    // scale 1 exactly like the traverse arrows (`pushSegmentArrows`).
    layer.setStyle(buildPosPathStyleFunction(weight, config.traverse.arrowSize));
  }, [config.pos.drawPathWeight, config.traverse.arrowSize]);

  return null;
}
