/**
 * AutoFitBounds — minimap behavior that auto-zooms to fit all visible objects
 * and (when needed) the dashboard map's viewport bounds box.
 *
 * Behavior:
 * - On changes to stations / traverses / pos entries, fits the minimap to
 *   those mission objects.
 * - When the dashboard map's extent (`bigMapExtent`) changes, the minimap
 *   only re-fits if the bounds box would otherwise be clipped or off-screen
 *   (i.e. the dashboard is panned away or zoomed out beyond the minimap's
 *   current view). It does not re-fit on every dashboard zoom.
 *
 * Minimap only. Returns null — headless behavior component.
 */

import { useEffect, useMemo, useRef } from "react";
import { boundingExtent, containsExtent } from "ol/extent";
import type { Coordinate } from "ol/coordinate";

import { deepEqual, refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useMapContext } from "../MapProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { useDashboardBoundsContext } from "../DashboardBoundsProvider";
import { maxZoomForPlanet } from "../utils/planetScale";

export function AutoFitBounds(): null {
  const { map, mode } = useMapContext();
  const { toMapCoord } = useCoordConverters();
  const { bigMapExtent } = useDashboardBoundsContext();

  const planetRadius = useMissionDocSelector((doc) => doc.planetRadius, refEqual);

  const runningRex = useMissionDocSelector(
    (m) => Object.values(m.rexes ?? {}).find((r) => r.isRunning),
    deepEqual
  );
  const runningEva = useMissionDocSelector((m) => {
    if (!runningRex) return null;
    return m.evas?.[runningRex.evaUuid] ?? null;
  }, deepEqual);
  const allStationsFromDoc = useMissionDocSelector(
    (m) => Object.values(m.stations ?? {}),
    deepEqual
  );
  const allTraversesFromDoc = useMissionDocSelector(
    (m) => Object.values(m.traverses ?? {}),
    deepEqual
  );

  const latestPosEntriesByType = useMissionDocSelector((m) => {
    if (!runningRex?.uuid) return {};
    const allEntries = m.rexes?.[runningRex.uuid]?.posEntries ?? [];
    const byType: Record<string, PosEntry[]> = {};
    for (const entry of allEntries) {
      for (const posTypeUuid of entry.posTypeUuids) {
        if (!byType[posTypeUuid]) byType[posTypeUuid] = [];
        if (byType[posTypeUuid].length < 2) {
          byType[posTypeUuid].push(entry);
        }
      }
    }
    return byType;
  }, deepEqual);

  const stationsToShow = useMemo(() => {
    const allStations = allStationsFromDoc ?? [];
    if (!runningEva?.sequence) return [];
    const uuids = runningEva.sequence.filter((s) => s.type === "station").map((s) => s.uuid);
    return allStations.filter((s) => uuids.includes(s.uuid));
  }, [runningEva, allStationsFromDoc]);

  const traversesToShow = useMemo(() => {
    const allTraverses = allTraversesFromDoc ?? [];
    if (!runningEva?.sequence) return [];
    const uuids = runningEva.sequence.filter((s) => s.type === "traverse").map((s) => s.uuid);
    return allTraverses.filter((t) => uuids.includes(t.uuid));
  }, [runningEva, allTraversesFromDoc]);

  // --- Mission object points (shared by both auto-fit effects) ---
  const missionPoints = useMemo<Coordinate[]>(() => {
    const points: Coordinate[] = [];
    for (const station of stationsToShow) {
      if (station?.location) points.push(toMapCoord(station.location));
    }
    for (const traverse of traversesToShow) {
      if (traverse?.path) {
        for (const p of traverse.path) points.push(toMapCoord(p));
      }
    }
    for (const entries of Object.values(latestPosEntriesByType)) {
      if (entries?.[0]?.location) points.push(toMapCoord(entries[0].location));
    }
    return points;
  }, [stationsToShow, traversesToShow, latestPosEntriesByType, toMapCoord]);

  const maxZoom = maxZoomForPlanet(planetRadius);

  // Track the last extent each effect explicitly fit to so we don't re-fit
  // redundantly. `missionPoints` gets a fresh array reference on *any* mission
  // doc change (the deepEqual selectors return the whole station/traverse
  // collection, so editing an unrelated station produces a new — but
  // content-identical — points array). Without these content-based guards each
  // doc change would re-run `view.fit`, and because the two effects previously
  // shared one ref with different key prefixes they would ping-pong between the
  // mission-only extent and the mission+bounds extent on every edit.
  const lastMissionFitKeyRef = useRef<string>("");
  const lastBoundsFitKeyRef = useRef<string>("");

  // --- Auto-fit on mission object changes ---
  useEffect(() => {
    if (mode !== "minimap") return;
    if (missionPoints.length === 0) return;

    const extent = boundingExtent(missionPoints);
    const key = `${extent.join(",")}:${maxZoom}`;
    if (lastMissionFitKeyRef.current === key) return;
    lastMissionFitKeyRef.current = key;

    map.getView().fit(extent, { padding: [20, 20, 20, 20], maxZoom, duration: 300 });
  }, [mode, missionPoints, maxZoom, map]);

  // --- Conditional re-fit when the dashboard bounds box leaves the minimap ---
  // Only refit when the box is not fully contained in the current minimap
  // viewport (i.e. the dashboard panned away or zoomed out beyond us).
  useEffect(() => {
    if (mode !== "minimap") return;
    if (!bigMapExtent) return;

    const size = map.getSize();
    if (!size) return;
    const viewExtent = map.getView().calculateExtent(size);

    // If the bounds box is fully inside the minimap view, do nothing.
    if (containsExtent(viewExtent, bigMapExtent)) return;

    // Otherwise refit to mission objects + bounds box so the white box is visible.
    const points: Coordinate[] = [...missionPoints];
    points.push([bigMapExtent[0], bigMapExtent[1]]);
    points.push([bigMapExtent[2], bigMapExtent[3]]);
    if (points.length === 0) return;

    const extent = boundingExtent(points);
    const key = `${extent.join(",")}:${maxZoom}`;
    if (lastBoundsFitKeyRef.current === key) return;
    lastBoundsFitKeyRef.current = key;

    map.getView().fit(extent, { padding: [20, 20, 20, 20], maxZoom, duration: 300 });
  }, [mode, bigMapExtent, missionPoints, maxZoom, map]);

  return null;
}
