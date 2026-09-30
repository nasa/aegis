/**
 * TimelineAstronaut — behavior component that shows an astronaut emoji marker
 * moving along a traverse path based on timeline hover percentage.
 *
 * Uses OL's `LineString.getCoordinateAt(fraction)` for interpolation in
 * projected CRS coordinates — more accurate than Leaflet's pixel-space
 * approach, especially at the south pole.
 *
 * Editor only. Returns null — headless behavior component.
 */

import { useEffect, useRef } from "react";
import Overlay from "ol/Overlay";
import { LineString } from "ol/geom";

import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useMapContext } from "../MapProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";

export function TimelineAstronaut(): null {
  const { map, mode } = useMapContext();
  const { toMapCoord } = useCoordConverters();

  const hoverItemUuid = useAppSelector((s) => s.hover.mapItemUuid, refEqual);
  const percentElapsed = useAppSelector((s) => s.hover.sequenceItemPercentElapsed, refEqual);
  const measurementUuid = useAppSelector((s) => s.hover.measurementUuid, refEqual);
  const measurementPercent = useAppSelector((s) => s.hover.measurementPercentDistance, refEqual);

  const selectedEvaUuid = useAppSelector((s) => s.eva.selectedEvaUuid, refEqual);
  const measurements = useAppSelector((s) => s.measure?.measurements ?? [], deepEqual);

  const selectedEva = useMissionDocSelector((m) => {
    return selectedEvaUuid ? (m.evas?.[selectedEvaUuid] ?? null) : null;
  }, deepEqual);
  const allTraversesFromDoc = useMissionDocSelector(
    (m) => Object.values(m.traverses ?? {}),
    deepEqual
  );
  const allStationsFromDoc = useMissionDocSelector(
    (m) => Object.values(m.stations ?? {}),
    deepEqual
  );

  const overlayRef = useRef<Overlay | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);

  // --- Create overlay once ---
  useEffect(() => {
    if (mode !== "editor") return;

    const el = document.createElement("div");
    el.textContent = "🧑‍🚀";
    el.style.fontSize = "24px";
    el.style.pointerEvents = "none";
    el.style.userSelect = "none";
    elRef.current = el;

    const overlay = new Overlay({
      element: el,
      positioning: "center-center",
      stopEvent: false,
    });
    map.addOverlay(overlay);
    overlayRef.current = overlay;

    // Hide initially
    overlay.setPosition(undefined);

    return () => {
      map.removeOverlay(overlay);
      overlayRef.current = null;
      elRef.current = null;
    };
  }, [map, mode]);

  // --- Update position from traverse hover ---
  useEffect(() => {
    if (mode !== "editor" || !overlayRef.current) return;

    // Reset to the astronaut's normal size.
    if (elRef.current) elRef.current.style.fontSize = "24px";

    // Allow percentElapsed === 0 (start of traverse). Only skip when truly absent.
    if (percentElapsed == null || !hoverItemUuid || !selectedEva) {
      overlayRef.current.setPosition(undefined);
      return;
    }

    // Find the sequence item
    const seqItem = selectedEva.sequence?.find((s) => s.uuid === hoverItemUuid);
    if (!seqItem) {
      overlayRef.current.setPosition(undefined);
      return;
    }

    if (seqItem.type === "station") {
      const station = (allStationsFromDoc ?? []).find((s) => s.uuid === seqItem.uuid);
      if (station?.location) {
        overlayRef.current.setPosition(toMapCoord(station.location));
        if (elRef.current) elRef.current.textContent = "🧑\u200d🚀";
      }
    } else if (seqItem.type === "traverse") {
      const traverse = (allTraversesFromDoc ?? []).find((t) => t.uuid === seqItem.uuid);
      if (traverse?.path && traverse.path.length >= 2) {
        const coords = traverse.path.map((p) => toMapCoord(p));
        const line = new LineString(coords);
        const position = line.getCoordinateAt(percentElapsed);
        overlayRef.current.setPosition(position);
        if (elRef.current) elRef.current.textContent = "🧑\u200d🚀";
      }
    }
  }, [
    mode,
    percentElapsed,
    hoverItemUuid,
    selectedEva,
    allTraversesFromDoc,
    allStationsFromDoc,
    toMapCoord,
  ]);

  // --- Update position from measurement hover ---
  useEffect(() => {
    if (mode !== "editor" || !overlayRef.current) return;

    if (measurementPercent == null || !measurementUuid) {
      // Don't clear here if traverse hover is active (including the 0 fraction).
      if (percentElapsed == null) {
        overlayRef.current.setPosition(undefined);
      }
      return;
    }

    const measurement = measurements.find((m) => m.uuid === measurementUuid);
    if (measurement?.path && measurement.path.length >= 2) {
      const coords = measurement.path.map((p) => toMapCoord(p));
      const line = new LineString(coords);
      const position = line.getCoordinateAt(measurementPercent);
      overlayRef.current.setPosition(position);
      if (elRef.current) {
        elRef.current.textContent = "❌";
        elRef.current.style.fontSize = "15px";
      }
    }
  }, [mode, measurementPercent, measurementUuid, measurements, percentElapsed, toMapCoord]);

  return null;
}
