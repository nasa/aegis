/**
 * SelectionHighlight — behavior component for selection highlight on the OL map.
 *
 * Draws a white dashed circle behind the currently selected item (station, POI,
 * or pos entry) and auto-pans the map if the target is outside the viewport.
 *
 * Editor only. Returns null — headless behavior component.
 */

import { useEffect, useRef } from "react";
import Feature from "ol/Feature";
import { Point } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Circle, Style, Stroke } from "ol/style";
import { containsCoordinate } from "ol/extent";

import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useMapContext } from "../MapProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { Z_INDEX } from "../utils/zIndex";

// ---------------------------------------------------------------------------
// Style
// ---------------------------------------------------------------------------

const selectionCircleStyle = new Style({
  image: new Circle({
    radius: 25,
    stroke: new Stroke({ color: "#ffffff", width: 2, lineDash: [5, 5] }),
  }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMidpoint(points: AEGISPoint[]): AEGISPoint | null {
  if (!points || points.length === 0) return null;
  const valid = points.filter((p) => p?.lat != null && p?.lng != null);
  if (valid.length === 0) return null;
  const lat = valid.reduce((sum, p) => sum + p.lat, 0) / valid.length;
  const lng = valid.reduce((sum, p) => sum + p.lng, 0) / valid.length;
  return { lat, lng };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SelectionHighlight(): null {
  const { map, mode } = useMapContext();
  const { toMapCoord } = useCoordConverters();

  const sectionSelected = useAppSelector((s) => s.interface.sectionSelectedLabel, refEqual);
  const bottomSectionSelected = useAppSelector(
    (s) => s.interface.bottomSectionSelectedLabel,
    refEqual
  );
  const selectedStationUuid = useAppSelector((s) => s.station.selectedStationUuid, refEqual);
  const selectedPoiUuid = useAppSelector((s) => s.poi?.selectedPoiUuid, refEqual);
  const selectedPosEntryUuid = useAppSelector((s) => s.rex?.selectedPosEntryUuid ?? null, refEqual);
  const selectedEvaSequenceItemUuid = useAppSelector(
    (s) => s.eva?.selectedEvaSequenceItemUuid ?? null,
    refEqual
  );
  const selectedMeasurementUuid = useAppSelector(
    (s) => s.measure?.selectedMeasurementUuid ?? null,
    refEqual
  );
  const mapDirective = useAppSelector((s) => s.map.mapDirective, refEqual);

  const selectedEvaUuid = useAppSelector((s) => s.eva.selectedEvaUuid, refEqual);
  const selectedRexUuid = useAppSelector((s) => s.rex?.selectedRexUuid ?? null, refEqual);
  const measurements = useAppSelector((s) => s.measure?.measurements ?? [], deepEqual);

  const selectedStation = useMissionDocSelector((m) => {
    if (!selectedStationUuid) return null;
    return m.stations?.[selectedStationUuid] ?? null;
  }, deepEqual);

  const selectedPoi = useMissionDocSelector((m) => {
    if (!selectedPoiUuid) return null;
    return m.pois?.[selectedPoiUuid] ?? null;
  }, deepEqual);

  const selectedEva = useMissionDocSelector((m) => {
    return selectedEvaUuid ? (m.evas?.[selectedEvaUuid] ?? null) : null;
  }, deepEqual);

  const allStationsFromDoc = useMissionDocSelector(
    (m) => Object.values(m.stations ?? {}),
    deepEqual
  );

  const posEntries = useMissionDocSelector((m) => {
    return selectedRexUuid ? (m.rexes?.[selectedRexUuid]?.posEntries ?? []) : [];
  }, deepEqual);

  const allTraversesFromDoc = useMissionDocSelector(
    (m) => Object.values(m.traverses ?? {}),
    deepEqual
  );

  const sourceRef = useRef(new VectorSource());
  const layerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const featureRef = useRef<Feature | null>(null);
  // Track measurement uuids from the previous render so we can detect a
  // newly added measurement and stop the auto-pan. Newly-added
  // measurements are always placed inside the current viewport, and panning
  // to an ambient EVA/REX/etc. selection at that moment is disorienting.
  const prevMeasurementUuidsRef = useRef<Set<string>>(new Set());
  // Track the previous "selection identity" so we only auto-pan when the
  // user's selection actually changed. Without this, unrelated changes that
  // re-run the effect (most notably `mapDirective` transitioning back to
  // null after a Cancel Pos / Cancel Edit action) would snap the map to the
  // dominant ambient selection (usually the EVA). Initialised to `undefined`
  // so the very first render does not count as a change (no pan on mount).
  const prevSelectionKeyRef = useRef<string | undefined>(undefined);
  // Track the previously selected measurement uuid on its own so we can
  // detect measurement-tab switches. Clicking between measurement tabs must
  // not auto-pan (the map should stay put), even when some higher-priority
  // ambient selection (e.g. an EVA in the right panel) would otherwise
  // dictate the pan target.
  const prevSelectedMeasurementUuidRef = useRef<string | null>(null);
  // Track the previous bottom-section tab so we can suppress auto-pan when
  // the user is just switching bottom tabs (e.g. Measurement ↔ Timeline).
  // A bottom-tab switch is a UI navigation, not a "take me somewhere new"
  // signal, so it must not hijack the map to an ambient selection.
  const prevBottomSectionSelectedRef = useRef<string | null>(null);

  // --- Layer setup ---
  useEffect(() => {
    if (mode !== "editor") return;

    const layer = new VectorLayer({
      source: sourceRef.current,
      zIndex: Z_INDEX.SELECTION,
    });
    map.addLayer(layer);
    layerRef.current = layer;

    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, mode]);

  // --- Resolve selection target and draw highlight + auto-pan ---
  useEffect(() => {
    if (mode !== "editor") return;

    // Clear previous highlight
    if (featureRef.current) {
      sourceRef.current.removeFeature(featureRef.current);
      featureRef.current = null;
    }

    let highlightLocation: AEGISPoint | null = null;
    let panLocation: AEGISPoint | null = null;

    // Helper: midpoint of all stations in the selected EVA's sequence.
    const evaStationsMidpoint = (): AEGISPoint | null => {
      if (!selectedEva?.sequence) return null;
      const allStations = allStationsFromDoc ?? [];
      const stationUuids = selectedEva.sequence
        .filter((s) => s.type === "station")
        .map((s) => s.uuid);
      const stationLocations = allStations
        .filter((s) => stationUuids.includes(s.uuid))
        .map((s) => s.location);
      return getMidpoint(stationLocations);
    };

    if (selectedPosEntryUuid) {
      // Crew position selected — highlight + pan. Handled at the top level (not
      // nested under selectedEvaSequenceItemUuid, which pos selection nulls).
      const posEntry = posEntries.find((pe: PosEntry) => pe.uuid === selectedPosEntryUuid);
      if (posEntry?.location) {
        highlightLocation = posEntry.location;
        panLocation = posEntry.location;
      }
    } else if (sectionSelected === "poi" && selectedPoi?.location) {
      highlightLocation = selectedPoi.location;
      panLocation = selectedPoi.location;
    } else if (sectionSelected === "station" && selectedStation?.location) {
      highlightLocation = selectedStation.location;
      panLocation = selectedStation.location;
    } else if (sectionSelected === "evas" && selectedEvaSequenceItemUuid) {
      const allStations = allStationsFromDoc ?? [];
      const traverses = allTraversesFromDoc ?? [];
      // Check if it's a station in the sequence
      const seqItem = selectedEva?.sequence?.find((s) => s.uuid === selectedEvaSequenceItemUuid);
      if (seqItem?.type === "station") {
        const station = allStations.find((s) => s.uuid === seqItem.uuid);
        if (station?.location) {
          highlightLocation = station.location;
          panLocation = station.location;
        }
      } else if (seqItem?.type === "traverse") {
        // Pan to midpoint for traverses, no highlight circle
        const traverse = traverses.find((t) => t.uuid === seqItem.uuid);
        if (traverse?.path) {
          panLocation = getMidpoint(traverse.path);
        }
      }
    } else if (sectionSelected === "evas" && (selectedEvaUuid || selectedRexUuid)) {
      // EVA/REX selected (its title), no specific sequence item — pan to the
      // midpoint of the EVA's stations so clicking an EVA/REX pans the map.
      panLocation = evaStationsMidpoint();
    } else if (bottomSectionSelected === "measure" && selectedMeasurementUuid) {
      // Only anchor to a measurement while the measure tab is the active bottom
      // section. Otherwise a leftover measurement would hijack every deselect.
      const measurement = measurements.find((m) => m.uuid === selectedMeasurementUuid);
      if (measurement?.path) {
        panLocation = getMidpoint(measurement.path);
      }
    }

    // Draw highlight circle
    if (highlightLocation?.lat != null && highlightLocation?.lng != null) {
      const coord = toMapCoord(highlightLocation);
      const highlight = new Feature(new Point(coord));
      highlight.setStyle(selectionCircleStyle);
      highlight.setId("selection-highlight");
      sourceRef.current.addFeature(highlight);
      featureRef.current = highlight;
    }

    // Detect a newly added measurement: selected uuid exists now but was not
    // in the measurements list on the previous render. In that case, suppress
    // the auto-pan entirely so we don't jump to any ambient selection (e.g. an
    // EVA/REX title whose section is still active).
    const measurementJustAdded =
      selectedMeasurementUuid != null &&
      measurements.some((m) => m.uuid === selectedMeasurementUuid) &&
      !prevMeasurementUuidsRef.current.has(selectedMeasurementUuid);

    // Update the tracked set for the next render.
    prevMeasurementUuidsRef.current = new Set(measurements.map((m) => m.uuid));

    // Detect a measurement-tab interaction: the selected measurement uuid
    // changed while the measure tab is active. Covers selecting for the first
    // time (null → uuidA), switching between tabs (uuidA → uuidB), and
    // deselecting the active tab (uuidA → null). In every case the user is
    // interacting with the measurement tabs, not asking to be pulled
    // somewhere new — suppress the auto-pan so the map stays put. Without
    // this, higher-priority ambient selections (e.g. an EVA in the right
    // panel) would hijack the pan on every tab click.
    const measurementTabInteraction =
      bottomSectionSelected === "measure" &&
      prevSelectedMeasurementUuidRef.current !== (selectedMeasurementUuid ?? null);
    prevSelectedMeasurementUuidRef.current = selectedMeasurementUuid ?? null;

    // Detect a bottom-tab switch (e.g. Measurement ↔ Timeline). The user is
    // navigating the bottom panel, not asking for the map to move — suppress
    // the auto-pan. First render: `prev` is `null` so this is false (no false
    // positive on mount).
    const bottomSectionSwitched =
      prevBottomSectionSelectedRef.current !== null &&
      prevBottomSectionSelectedRef.current !== bottomSectionSelected;
    prevBottomSectionSelectedRef.current = bottomSectionSelected;

    // Auto-pan should only fire when the user's selection actually changed.
    // Serialise the identity of every "what is currently selected" input the
    // if-chain above reads. Notably excludes `mapDirective` and doc-derived
    // collections — those can change without any selection change (e.g.
    // starting/cancelling an edit) and must not trigger a pan on their own.
    const selectionKey = [
      sectionSelected,
      bottomSectionSelected,
      selectedStationUuid,
      selectedPoiUuid,
      selectedEvaSequenceItemUuid,
      selectedPosEntryUuid,
      selectedMeasurementUuid,
      selectedEvaUuid,
      selectedRexUuid,
    ].join("|");
    const selectionChanged =
      prevSelectionKeyRef.current !== undefined && prevSelectionKeyRef.current !== selectionKey;
    prevSelectionKeyRef.current = selectionKey;

    // Auto-pan if outside viewport
    if (
      selectionChanged &&
      !measurementJustAdded &&
      !measurementTabInteraction &&
      !bottomSectionSwitched &&
      panLocation?.lat != null &&
      panLocation?.lng != null &&
      mapDirective === null
    ) {
      const coord = toMapCoord(panLocation);
      const view = map.getView();
      const size = map.getSize();
      if (size) {
        const extent = view.calculateExtent(size);
        if (!containsCoordinate(extent, coord)) {
          view.animate({ center: coord, duration: 300 });
        }
      }
    }
  }, [
    mode,
    sectionSelected,
    bottomSectionSelected,
    selectedStation,
    selectedStationUuid,
    selectedPoi,
    selectedPoiUuid,
    selectedEvaSequenceItemUuid,
    selectedPosEntryUuid,
    selectedMeasurementUuid,
    selectedEvaUuid,
    selectedRexUuid,
    selectedEva,
    allStationsFromDoc,
    measurements,
    posEntries,
    allTraversesFromDoc,
    mapDirective,
    map,
    toMapCoord,
  ]);

  return null;
}
