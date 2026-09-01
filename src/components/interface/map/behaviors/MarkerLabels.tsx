/**
 * MarkerLabels — behavior component managing draggable labels with overlap dimming.
 *
 * Labels are positioned at a fixed pixel offset below their marker. When labels
 * overlap, lower-priority ones dim (become transparent). Users can drag any
 * label to a new position — the pixel offset is maintained across zoom/pan.
 * Dragging a label out from under another restores full opacity.
 *
 * ## How it works
 *
 * 1. Collects all visible markers that should have labels (respects showLabels toggle).
 * 2. For each marker, positions a Point feature at (anchor + pixelOffset * resolution).
 * 3. Computes overlap-based opacities: higher-priority labels occlude lower-priority ones.
 * 4. The style function (`createMarkerLabelStyle`) renders each label + connector line
 *    with the computed opacity.
 * 5. Dragging via `ol/interaction/Translate` stores the new pixel offset.
 *
 * ## Priority
 *
 * Lander = 0 (highest), Station = 1, POI = 2, Action = 3.
 * Higher-priority labels render on top and at full opacity.
 *
 * Returns null — headless behavior component.
 */

import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import { Translate } from "ol/interaction";
import orderBy from "lodash/orderBy";

import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { selectAsPlannedStations } from "store/selectors";
import { hhmmssFromSeconds, secondsFromhhmmss } from "utils/formatting";
import { getActionDisplayName } from "utils/component-helpers";
import { getEgressStationUuid } from "operations/helpers/evaSequence";

import { useMapContext } from "../MapProvider";
import { MODE_CONFIGS } from "../utils/modeConfig";
import { useFeatureSourcesContext } from "../FeatureSourcesProvider";
import { useMapMenuContext } from "../MapMenuProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { Z_INDEX } from "../utils/zIndex";
import { useRexPetTime } from "../hooks/useRexPetTime";
import { createMarkerLabelStyle } from "../utils/styles/markerLabels";
import {
  computeLabelOpacities,
  measureLabelText,
  DEFAULT_LABEL_OFFSET,
  type LabelDescriptor,
} from "../utils/labelLayout";

// ---------------------------------------------------------------------------
// Priority constants
// ---------------------------------------------------------------------------

const PRIORITY_LANDER = 0;
const PRIORITY_STATION = 1;
const PRIORITY_POI = 2;
const PRIORITY_ACTION = 3;
const PRIORITY_POS = 4;

// ---------------------------------------------------------------------------
// POS entry helpers (mirror logic from PosEntries.tsx)
// ---------------------------------------------------------------------------

function filterPosEntries(posEntries: PosEntry[], mapDisplayPos: MapSubmenuPos): PosEntry[] {
  const withLocations = posEntries.filter(
    (e) => e.location && !isNaN(e.location.lat) && !isNaN(e.location.lng)
  );
  if (mapDisplayPos.sourceUuids.length > 0) {
    return withLocations.filter((e) => mapDisplayPos.sourceUuids.includes(e.posSourceUuid));
  }
  return withLocations;
}

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LabelInfo {
  id: string;
  name: string;
  labelType: "lander" | "station" | "poi" | "action" | "pos";
  anchorCoord: [number, number]; // projected map coordinate
  priority: number;
  /** Transient hover tooltip — always renders at full opacity, never draggable */
  isHover?: boolean;
}

export function MarkerLabels(): null {
  const { map, mode } = useMapContext();
  const config = MODE_CONFIGS[mode];
  const { labelSource } = useFeatureSourcesContext();
  const {
    submenuStations: mapDisplayStations,
    submenuPois: mapDisplayPois,
    submenuActions: mapDisplayActions,
    submenuPos: mapDisplayPos,
  } = useMapMenuContext();
  const { toMapCoord } = useCoordConverters();

  // --- Redux UI state ---
  const selectedEvaUuid = useAppSelector((s) => s.eva.selectedEvaUuid, refEqual);
  const selectedStationUuid = useAppSelector((s) => s.station.selectedStationUuid, refEqual);
  const sectionSelected = useAppSelector((s) => s.interface.sectionSelectedLabel, refEqual);
  const selectedPoiUuid = useAppSelector((s) => s.poi.selectedPoiUuid, refEqual);
  const selectedSeqItemUuid = useAppSelector((s) => s.eva.selectedEvaSequenceItemUuid, refEqual);
  const folders = useAppSelector((s) => s.interface.folders, deepEqual);
  const foldersInterface = useAppSelector((s) => s.interface.foldersInterface, deepEqual);
  const mapDirective = useAppSelector((s) => s.map.mapDirective, refEqual);
  // While any map directive is active — a marker/path edit OR a crew-position
  // placement — labels stay visible as reference but are not draggable.
  const editActive = !!mapDirective;
  const hoverMapItemUuid = useAppSelector((s) => s.hover.mapItemUuid, refEqual);
  const hoverMapItemType = useAppSelector((s) => s.hover.mapItemType, refEqual);
  const selectedRexUuid = useAppSelector((s) => s.rex.selectedRexUuid, refEqual);

  // --- Automerge doc state ---
  const selectedEva = useMissionDocSelector((m) => {
    return selectedEvaUuid ? (m.evas?.[selectedEvaUuid] ?? null) : null;
  }, deepEqual);

  const allStationsFromDoc = useMissionDocSelector(
    (m) => Object.values(m.stations ?? {}),
    deepEqual
  );
  const asPlannedStationsFromDoc = useMissionDocSelector(selectAsPlannedStations, deepEqual);
  const poisFromDoc = useMissionDocSelector((m) => Object.values(m.pois ?? {}), deepEqual);
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

  const selectedTraverseUuid = useMissionDocSelector((m) => {
    if (!selectedSeqItemUuid) return null;
    return m.traverses?.[selectedSeqItemUuid] ? selectedSeqItemUuid : null;
  }, refEqual);

  // Dashboard action-label gating — mirrors ActionMarkers: with no marker
  // selection, show labels only for the station/traverse (and egress/ingress
  // station) the running REX currently marks "in-progress".
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

  // --- POS entry state (from doc) ---
  const selectedRex = useMissionDocSelector((m) => {
    return selectedRexUuid ? (m.rexes?.[selectedRexUuid] ?? null) : null;
  }, deepEqual);

  const posEntries = useMissionDocSelector((m) => {
    return selectedRexUuid ? (m.rexes?.[selectedRexUuid]?.posEntries ?? []) : [];
  }, deepEqual);

  const posTypes = useMissionDocSelector((m) => {
    return selectedRexUuid ? (m.rexes?.[selectedRexUuid]?.posTypes ?? []) : [];
  }, deepEqual);

  const posSources = useMissionDocSelector((m) => {
    return selectedRexUuid ? (m.rexes?.[selectedRexUuid]?.posSources ?? []) : [];
  }, deepEqual);

  const posEgressLocation = useMissionDocSelector((m) => {
    if (!selectedRexUuid) return null;
    const rex = m.rexes?.[selectedRexUuid];
    if (!rex) return null;
    const eva = m.evas?.[rex.evaUuid];
    return m.stations?.[getEgressStationUuid(eva?.sequence)]?.location ?? null;
  }, deepEqual);

  const landerLocation = useMissionDocSelector(
    (doc) => doc.landerLocation,
    deepEqual
  ) as AEGISPoint | null;

  // --- PET time (ticks while REX is running) ---
  const petTime = useRexPetTime();

  // --- Refs ---
  const layerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const translateRef = useRef<Translate | null>(null);
  /** Track dragged label positions: labelId → [mapX, mapY] absolute map coordinate */
  const dragCoordsRef = useRef<Map<string, [number, number]>>(new Map());
  const layoutScheduledRef = useRef(false);
  /** Incremented after each drag-end to trigger a layout re-run */
  const [dragVersion, setDragVersion] = useState(0);
  /** True while a label drag is in progress — PET ticks are frozen to avoid
   * rebuilding labelInfos (and thus runLayout) mid-drag, which would snap the
   * dragged feature back to its pre-drag position. */
  const isDraggingRef = useRef(false);
  /**
   * The PET time value used by labelInfos. Only advances when NOT dragging.
   * Stays frozen at its last value while a drag is active so the memo
   * (and runLayout) are not triggered mid-drag.
   */
  const [committedPetTime, setCommittedPetTime] = useState(petTime);

  // --- Layer setup ---
  useEffect(() => {
    const styleFn = createMarkerLabelStyle(
      config.markerLabel.fontSize,
      config.markerLabel.connectorWidth
    );
    const layer = new VectorLayer({
      source: labelSource,
      style: styleFn as never,
      zIndex: Z_INDEX.PLACE_LABELS,
    });
    map.addLayer(layer);
    layerRef.current = layer;

    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, labelSource, config.markerLabel.fontSize, config.markerLabel.connectorWidth]);

  // --- Drag interaction ---
  useEffect(() => {
    if (mode === "minimap") return;
    if (editActive) return; // labels are non-draggable during an active edit

    const translate = new Translate({
      layers: layerRef.current ? [layerRef.current] : [],
      hitTolerance: 5,
    });

    translate.on("translatestart", () => {
      isDraggingRef.current = true;
    });

    translate.on("translateend", (evt) => {
      const feature = evt.features.item(0) as Feature<Point> | undefined;
      if (!feature) return;

      const id = feature.getId() as string;
      const geom = feature.getGeometry() as Point;
      const newCoord = geom.getCoordinates() as [number, number];

      // Store the absolute map coordinate the label was dragged to
      dragCoordsRef.current.set(id, newCoord);

      // Unfreeze PET time — the effect below will immediately commit the
      // latest petTime on the next render after dragging stops.
      isDraggingRef.current = false;

      // Increment version — triggers layout effect which recomputes opacities
      setDragVersion((v) => v + 1);
    });

    map.addInteraction(translate);
    translateRef.current = translate;

    return () => {
      map.removeInteraction(translate);
      translateRef.current = null;
    };
  }, [map, mode, editActive]);

  // Advance committedPetTime only when no drag is active.
  // This prevents PET ticks from triggering labelInfos rebuilds mid-drag,
  // which would call runLayout and snap the dragged feature back to its
  // pre-drag map coordinate.
  useEffect(() => {
    if (!isDraggingRef.current) {
      setCommittedPetTime(petTime);
    }
  }, [petTime]);

  // --- Compute label infos ---
  const labelInfos = useMemo((): LabelInfo[] => {
    const infos: LabelInfo[] = [];

    // Note: the lander label is NOT shown permanently — it only appears on hover
    // (handled in the hover tooltip block below).

    const allStations = allStationsFromDoc ?? [];
    const asPlannedStations = asPlannedStationsFromDoc ?? [];
    const pois = poisFromDoc ?? [];
    const actions = actionsFromDoc ?? [];

    // Station labels
    const showStationLabels = config.station.tooltipPermanent && mapDisplayStations.showLabels;
    if (showStationLabels && mapDisplayStations.show) {
      const uuidsToShow = new Set<string>();

      if (selectedEva) {
        const stationItems = selectedEva.sequence?.filter((item) => item.type === "station") ?? [];
        for (const item of stationItems) {
          if (item.uuid) uuidsToShow.add(item.uuid);
        }
      } else if (
        selectedStationUuid &&
        (sectionSelected === "station" || sectionSelected === "evas")
      ) {
        uuidsToShow.add(selectedStationUuid);
      }

      const stationFolders = folders.filter((f: Folder) => f.type === "station");
      for (const station of asPlannedStations) {
        const folder = stationFolders.find((f: Folder) => f.items.includes(station.uuid));
        if (!folder) {
          uuidsToShow.add(station.uuid);
        } else {
          const fi = foldersInterface.find(
            (fi: { uuid: string; visible: boolean }) => fi.uuid === folder.uuid
          );
          if (!fi || fi.visible) uuidsToShow.add(station.uuid);
        }
      }

      for (const station of allStations) {
        // Lander copies have no marker, so they get no label either
        if (
          uuidsToShow.has(station.uuid) &&
          !station.isLanderXgress &&
          station.location?.lat != null &&
          station.location?.lng != null
        ) {
          infos.push({
            id: `station-${station.uuid}`,
            name: station.name,
            labelType: "station",
            anchorCoord: toMapCoord(station.location) as [number, number],
            priority: PRIORITY_STATION,
          });
        }
      }
    }

    // POI labels
    const showPoiLabels = config.station.tooltipPermanent && mapDisplayPois.showLabels;
    if (showPoiLabels && mapDisplayPois.show) {
      const poiFolders = folders.filter((f: Folder) => f.type === "poi");
      for (const poi of pois) {
        if (poi.location?.lat == null || poi.location?.lng == null) continue;

        const folder = poiFolders.find((f: Folder) => f.items.includes(poi.uuid));
        if (folder) {
          const fi = foldersInterface.find(
            (fi: { uuid: string; visible: boolean }) => fi.uuid === folder.uuid
          );
          if (fi && !fi.visible && poi.uuid !== selectedPoiUuid) continue;
        }

        infos.push({
          id: `poi-${poi.uuid}`,
          name: poi.name,
          labelType: "poi",
          anchorCoord: toMapCoord(poi.location) as [number, number],
          priority: PRIORITY_POI,
        });
      }
    }

    // Action labels — filter same way as ActionMarkers.tsx
    const showActionLabels = config.station.tooltipPermanent && mapDisplayActions.showLabels;
    if (showActionLabels && mapDisplayActions.show) {
      let visibleActions: Action[] = [];
      if (mode === "dashboard") {
        // Dashboard has no marker selection, so mirror ActionMarkers: show
        // labels only for actions on the station/traverse currently marked
        // "in-progress" by the running REX.
        const parentSet = new Set(dashboardActionParentUuids ?? []);
        visibleActions = actions.filter(
          (a) =>
            a.enabled &&
            (((a.stationUuid ?? null) !== null && parentSet.has(a.stationUuid!)) ||
              ((a.traverseUuid ?? null) !== null && parentSet.has(a.traverseUuid!)))
        );
      } else if (
        (sectionSelected === "station" || sectionSelected === "evas") &&
        selectedStationUuid
      ) {
        visibleActions = actions.filter((a) => a.stationUuid === selectedStationUuid);
      } else if (sectionSelected === "poi" && selectedPoiUuid) {
        visibleActions = actions.filter((a) => a.poiUuid === selectedPoiUuid);
      } else if (sectionSelected === "evas" && selectedTraverseUuid) {
        visibleActions = actions.filter((a) => a.traverseUuid === selectedTraverseUuid);
      }

      for (const action of visibleActions) {
        if (action.location?.lat != null && action.location?.lng != null) {
          infos.push({
            id: `action-${action.uuid}`,
            name: getActionDisplayName({ action, mission: actionNaming }),
            labelType: "action",
            anchorCoord: toMapCoord(action.location) as [number, number],
            priority: PRIORITY_ACTION,
          });
        }
      }
    }

    // POS entry labels
    const showPosLabels =
      mapDisplayPos.show &&
      sectionSelected === "evas" &&
      !!selectedRex &&
      (mapDisplayPos.showAllLabels || mapDisplayPos.showLatestLabels);

    if (showPosLabels) {
      const filteredPosEntries = filterPosEntries(posEntries ?? [], mapDisplayPos);
      const sortedPosEntries = orderBy(filteredPosEntries, ["createdAt"], ["desc"]);
      const latestByType = getLatestPosEntryByType(sortedPosEntries);

      const latestUuids = new Set<string>();
      for (const entries of Object.values(latestByType)) {
        if (entries[0]) latestUuids.add(entries[0].uuid);
      }

      for (const entry of sortedPosEntries) {
        if (!entry.location) continue;

        // Skip entries at egress location
        if (
          posEgressLocation &&
          entry.location.lat === posEgressLocation.lat &&
          entry.location.lng === posEgressLocation.lng
        ) {
          continue;
        }

        const isLatest = latestUuids.has(entry.uuid);

        // Only show marker-visible entries
        if (!mapDisplayPos.showOldMarkers && !isLatest) continue;

        // Apply label visibility
        const showLabel =
          mapDisplayPos.showAllLabels || (mapDisplayPos.showLatestLabels && isLatest);
        if (!showLabel) continue;

        // Visible posTypes for this entry
        let visiblePosTypeUuids: string[];
        if (!mapDisplayPos.showOldMarkers && isLatest) {
          visiblePosTypeUuids = entry.posTypeUuids.filter(
            (ptUuid) => latestByType[ptUuid]?.[0]?.uuid === entry.uuid
          );
        } else {
          visiblePosTypeUuids = entry.posTypeUuids;
        }

        // Order abbrs by posTypes list position (EV1, EV2, Cart, …) so the label
        // matches the marker icon stack regardless of toggle order.
        const posTypeIdx = (uuid: string): number => posTypes.findIndex((pt) => pt.uuid === uuid);
        const abbrs = [...visiblePosTypeUuids]
          .sort((a, b) => posTypeIdx(a) - posTypeIdx(b))
          .map((uuid) => posTypes.find((pt) => pt.uuid === uuid)?.abbr)
          .filter(Boolean);
        const sourceAbbr = posSources.find((ps) => ps.uuid === entry.posSourceUuid)?.abbr ?? "";
        // Show age of this entry: how long ago it was placed relative to current PET.
        // petSeconds on the entry is the absolute PET when it was recorded.
        // committedPetTime stops advancing while a drag is in progress so
        // this memo isn't rebuilt mid-drag (which would snap the label back).
        const currentPetSeconds = committedPetTime
          ? secondsFromhhmmss(committedPetTime)
          : entry.petSeconds;
        const ageSeconds = Math.max(0, currentPetSeconds - entry.petSeconds);
        const labelText = `${hhmmssFromSeconds(ageSeconds)} / ${abbrs.join(",")} (${sourceAbbr})`;

        infos.push({
          id: `pos-${entry.uuid}`,
          name: labelText,
          labelType: "pos",
          anchorCoord: toMapCoord(entry.location) as [number, number],
          priority: PRIORITY_POS,
        });
      }
    }

    // Hover tooltip — show label for hovered marker even when showLabels is off
    if (hoverMapItemUuid && hoverMapItemType) {
      // Hovering a lander copy resolves to the lander itself
      const hoveredIsLanderXgress =
        hoverMapItemType === "station" &&
        allStations.some((s) => s.uuid === hoverMapItemUuid && s.isLanderXgress);

      const hoverLabelId =
        hoverMapItemType === "lander" || hoveredIsLanderXgress
          ? "lander"
          : hoverMapItemType === "station"
            ? `station-${hoverMapItemUuid}`
            : hoverMapItemType === "poi"
              ? `poi-${hoverMapItemUuid}`
              : hoverMapItemType === "action"
                ? `action-${hoverMapItemUuid}`
                : null;

      if (hoverLabelId && !infos.some((i) => i.id === hoverLabelId)) {
        if (hoverMapItemType === "lander" || hoveredIsLanderXgress) {
          if (landerLocation && landerLocation.lat != null && landerLocation.lng != null) {
            infos.push({
              id: "lander",
              name: "Lander",
              labelType: "lander",
              anchorCoord: toMapCoord(landerLocation) as [number, number],
              priority: PRIORITY_LANDER,
              isHover: true,
            });
          }
        } else if (
          hoverMapItemType === "station" &&
          (mapDisplayStations.show || hoverMapItemUuid === selectedStationUuid)
        ) {
          const station = allStations.find((s) => s.uuid === hoverMapItemUuid);
          if (station?.location?.lat != null && station?.location?.lng != null) {
            infos.push({
              id: hoverLabelId,
              name: station.name,
              labelType: "station",
              anchorCoord: toMapCoord(station.location) as [number, number],
              priority: PRIORITY_STATION,
              isHover: true,
            });
          }
        } else if (
          hoverMapItemType === "poi" &&
          (mapDisplayPois.show || hoverMapItemUuid === selectedPoiUuid)
        ) {
          const poi = pois.find((p) => p.uuid === hoverMapItemUuid);
          if (poi?.location?.lat != null && poi?.location?.lng != null) {
            infos.push({
              id: hoverLabelId,
              name: poi.name,
              labelType: "poi",
              anchorCoord: toMapCoord(poi.location) as [number, number],
              priority: PRIORITY_POI,
              isHover: true,
            });
          }
        } else if (hoverMapItemType === "action" && mapDisplayActions.show) {
          const action = actions.find((a) => a.uuid === hoverMapItemUuid);
          if (action?.location?.lat != null && action?.location?.lng != null) {
            infos.push({
              id: hoverLabelId,
              name: getActionDisplayName({ action, mission: actionNaming }),
              labelType: "action",
              anchorCoord: toMapCoord(action.location) as [number, number],
              priority: PRIORITY_ACTION,
              isHover: true,
            });
          }
        }
      }
    }

    return infos;
  }, [
    mode,
    landerLocation,
    config.station.tooltipPermanent,
    mapDisplayStations,
    mapDisplayPois,
    mapDisplayActions,
    selectedEva,
    allStationsFromDoc,
    asPlannedStationsFromDoc,
    selectedStationUuid,
    sectionSelected,
    poisFromDoc,
    selectedPoiUuid,
    actionsFromDoc,
    actionNaming,
    selectedTraverseUuid,
    dashboardActionParentUuids,
    folders,
    foldersInterface,
    toMapCoord,
    hoverMapItemUuid,
    hoverMapItemType,
    mapDisplayPos,
    selectedRex,
    posEntries,
    posTypes,
    posSources,
    posEgressLocation,
    committedPetTime,
  ]);

  // --- Position labels + compute opacities ---
  const runLayout = useCallback(() => {
    const view = map.getView();
    if (!view) return;
    const resolution = view.getResolution();
    if (!resolution) return;

    const drags = dragCoordsRef.current;
    const existingIds = new Set<string>();

    // 1. Position every label feature
    for (const info of labelInfos) {
      existingIds.add(info.id);

      // Use dragged map coordinate if available, otherwise default pixel offset from anchor
      let labelCoord: [number, number];
      const dragCoord = drags.get(info.id);
      if (dragCoord) {
        labelCoord = dragCoord;
      } else {
        // Default: pixel offset above marker (positive Y = north = up on screen)
        const mapX = info.anchorCoord[0] + DEFAULT_LABEL_OFFSET[0] * resolution;
        const mapY = info.anchorCoord[1] + DEFAULT_LABEL_OFFSET[1] * resolution;
        labelCoord = [mapX, mapY];
      }

      let feature = labelSource.getFeatureById(info.id) as Feature<Point> | null;
      if (feature) {
        // Don't move dragged labels — their geometry is already at dragCoord
        if (!dragCoord) {
          feature.getGeometry()!.setCoordinates(labelCoord);
        }
        feature.set("anchorCoord", info.anchorCoord);
        feature.set("name", info.name);
        feature.set("labelType", info.labelType);
        feature.set("isHover", info.isHover ?? false);
      } else {
        feature = new Feature({ geometry: new Point(labelCoord) });
        feature.setId(info.id);
        feature.set("anchorCoord", info.anchorCoord);
        feature.set("name", info.name);
        feature.set("labelType", info.labelType);
        feature.set("isHover", info.isHover ?? false);
        labelSource.addFeature(feature);
      }
    }

    // Remove stale labels
    for (const feature of labelSource.getFeatures()) {
      const id = feature.getId() as string;
      if (!existingIds.has(id)) {
        labelSource.removeFeature(feature);
        drags.delete(id);
      }
    }

    // 2. Compute overlap-based opacities in pixel space
    const descriptors: LabelDescriptor[] = [];
    for (const info of labelInfos) {
      const measurement = measureLabelText(info.name, config.markerLabel.fontSize);
      if (!measurement) continue;

      const feature = labelSource.getFeatureById(info.id) as Feature<Point> | null;
      if (!feature) continue;
      const labelPx = map.getPixelFromCoordinate(feature.getGeometry()!.getCoordinates());
      if (!labelPx) continue;

      descriptors.push({
        id: info.id,
        labelPx: labelPx as [number, number],
        textWidth: measurement.width,
        textHeight: measurement.height,
        priority: info.priority,
      });
    }

    const opacities = computeLabelOpacities(descriptors);
    for (const { id, opacity } of opacities) {
      const feature = labelSource.getFeatureById(id) as Feature<Point> | null;
      if (feature) {
        // Hover tooltips always render at full opacity regardless of overlap
        const isHover = feature.get("isHover") as boolean;
        feature.set("labelOpacity", isHover ? 1.0 : opacity);
      }
    }

    layerRef.current?.changed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, labelInfos, labelSource, dragVersion]);

  // --- Run on data changes or drag ---
  useEffect(() => {
    runLayout();
  }, [runLayout]);

  // --- Reposition on zoom (pixel offsets need map-coord recalc) ---
  useEffect(() => {
    const view = map.getView();
    if (!view) return;

    const handleChange = () => {
      if (!layoutScheduledRef.current) {
        layoutScheduledRef.current = true;
        requestAnimationFrame(() => {
          layoutScheduledRef.current = false;
          runLayout();
        });
      }
    };

    view.on("change:resolution", handleChange);
    return () => view.un("change:resolution", handleChange);
  }, [map, runLayout]);

  // --- Reposition on pan ---
  useEffect(() => {
    map.on("moveend", runLayout);
    return () => map.un("moveend", runLayout);
  }, [map, runLayout]);

  return null;
}
