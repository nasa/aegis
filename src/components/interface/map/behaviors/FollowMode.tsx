/**
 * FollowMode — dashboard behavior that auto-pans/zooms to fit tracked objects.
 *
 * Tracks configurable follow options (stations, traverses, pos types).
 * Computes a bounding extent from all tracked objects and animates the view.
 * Also publishes the current viewport extent to DashboardBoundsProvider.
 *
 * Dashboard only. Returns null — headless behavior component.
 */

import { useEffect, useMemo } from "react";
import { boundingExtent } from "ol/extent";
import type { Coordinate } from "ol/coordinate";
import orderBy from "lodash/orderBy";

import { deepEqual, refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useMapContext } from "../MapProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { useDashboardBoundsContext } from "../DashboardBoundsProvider";
import { useFollowModeContext } from "../FollowModeProvider";
import { useMapMenuContext } from "../MapMenuProvider";
import { maxZoomForPlanet } from "../utils/planetScale";

export function FollowMode(): null {
  const { map, mode } = useMapContext();
  const { toMapCoord } = useCoordConverters();
  const { setBigMapExtent } = useDashboardBoundsContext();
  const { followMode, followModeOptions } = useFollowModeContext();
  const { submenuPos: mapDisplayPos } = useMapMenuContext();

  const planetRadius = useMissionDocSelector((doc) => doc.planetRadius, refEqual);
  const landerLocation = useMissionDocSelector((doc) => doc.landerLocation, deepEqual);

  const runningRex = useMissionDocSelector(
    (m) => Object.values(m.rexes ?? {}).find((r) => r.isRunning) ?? null,
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
  const allActionsFromDoc = useMissionDocSelector((m) => Object.values(m.actions ?? {}), deepEqual);
  const allTraversesFromDoc = useMissionDocSelector(
    (m) => Object.values(m.traverses ?? {}),
    deepEqual
  );
  const posSourceUuids = mapDisplayPos.sourceUuids;
  const latestPosEntriesByType = useMissionDocSelector((m) => {
    if (!runningRex?.uuid) return {};
    const allEntries = m.rexes?.[runningRex.uuid]?.posEntries ?? [];
    // Respect the eyeball menu source filter — only follow positions from
    // sources the user is viewing. An empty list means "all sources" (matches
    // the display filter in PosEntries).
    const sourceFiltered =
      posSourceUuids.length > 0
        ? allEntries.filter((e) => posSourceUuids.includes(e.posSourceUuid))
        : allEntries;
    // Sort newest-first so `[0]` is the latest position per type. Without this,
    // the raw (append-ordered) array yields the oldest entries — the follow
    // effect would track a stale point and, since deepEqual sees no change when
    // a newer entry is appended, never re-fire to pan to the new drop.
    const sortedEntries = orderBy(sourceFiltered, ["createdAt"], ["desc"]);
    const byType: Record<string, PosEntry[]> = {};
    for (const entry of sortedEntries) {
      for (const posTypeUuid of entry.posTypeUuids) {
        if (!byType[posTypeUuid]) byType[posTypeUuid] = [];
        if (byType[posTypeUuid].length < 2) {
          byType[posTypeUuid].push(entry);
        }
      }
    }
    return byType;
  }, deepEqual);

  // --- Publish viewport extent on move ---
  useEffect(() => {
    if (mode !== "dashboard") return;

    const update = () => {
      const size = map.getSize();
      if (!size) return;
      const extent = map.getView().calculateExtent(size);
      setBigMapExtent(extent);
    };

    map.on("moveend", update);
    // Initial publish
    update();

    return () => {
      map.un("moveend", update);
    };
  }, [map, mode, setBigMapExtent]);

  // --- Compute in-progress stations/traverses ---
  // "In progress" is driven by the running REX's per-activity rexStatus, not by
  // mere membership in the EVA sequence. Following the whole sequence would keep
  // the entire EVA in view instead of focusing on the active station/traverse.
  const stationsInProgress = useMemo(() => {
    const stationsFromDoc = allStationsFromDoc ?? [];
    const stationEntries = runningRex?.stationEntries;
    if (!stationEntries) return [];
    return stationsFromDoc.filter((s) => stationEntries[s.uuid]?.rexStatus === "in-progress");
  }, [runningRex, allStationsFromDoc]);

  const traversesInProgress = useMemo(() => {
    const traversesFromDoc = allTraversesFromDoc ?? [];
    const traverseEntries = runningRex?.traverseEntries;
    if (!traverseEntries) return [];
    return traversesFromDoc.filter((t) => traverseEntries[t.uuid]?.rexStatus === "in-progress");
  }, [runningRex, allTraversesFromDoc]);

  // --- Auto-pan/zoom ---
  useEffect(() => {
    if (mode !== "dashboard" || !followMode) return;

    const points: Coordinate[] = [];

    const actionsFromDoc = allActionsFromDoc ?? [];
    const stationsFromDoc = allStationsFromDoc ?? [];

    if (followModeOptions.stations?.follow) {
      for (const station of stationsInProgress) {
        if (station?.location) {
          points.push(toMapCoord(station.location));
          for (const action of actionsFromDoc) {
            if (action.stationUuid === station.uuid && action.location && action.enabled) {
              points.push(toMapCoord(action.location));
            }
          }
        }
      }
    }

    if (followModeOptions.traverses?.follow) {
      for (const traverse of traversesInProgress) {
        if (traverse?.path) {
          for (const p of traverse.path) {
            points.push(toMapCoord(p));
          }
          for (const action of actionsFromDoc) {
            if (action.traverseUuid === traverse.uuid && action.location && action.enabled) {
              points.push(toMapCoord(action.location));
            }
          }
        }
      }
    }

    // Per pos type follow — only when positions are visible in the eyeball menu.
    if (mapDisplayPos.show) {
      for (const posTypeUuid of Object.keys(latestPosEntriesByType)) {
        if (followModeOptions[posTypeUuid]?.follow) {
          const entries = latestPosEntriesByType[posTypeUuid];
          if (entries?.[0]?.location) {
            points.push(toMapCoord(entries[0].location));
          }
        }
      }
    }

    // Egress/ingress
    if (runningRex?.xgressEntries?.egress?.rexStatus === "in-progress") {
      if (runningEva?.egressLocationUuid === "lander" && landerLocation) {
        points.push(toMapCoord(landerLocation));
      } else {
        const station = stationsFromDoc.find((s) => s.uuid === runningEva?.egressLocationUuid);
        if (station?.location) points.push(toMapCoord(station.location));
      }
    }
    if (runningRex?.xgressEntries?.ingress?.rexStatus === "in-progress") {
      if (runningEva?.ingressLocationUuid === "lander" && landerLocation) {
        points.push(toMapCoord(landerLocation));
      } else {
        const station = stationsFromDoc.find((s) => s.uuid === runningEva?.ingressLocationUuid);
        if (station?.location) points.push(toMapCoord(station.location));
      }
    }

    if (points.length === 0) return;

    const extent = boundingExtent(points);
    const maxZoom = maxZoomForPlanet(planetRadius);
    map.getView().fit(extent, { padding: [100, 100, 100, 100], maxZoom, duration: 500 });
  }, [
    mode,
    followMode,
    followModeOptions,
    stationsInProgress,
    traversesInProgress,
    latestPosEntriesByType,
    mapDisplayPos.show,
    allActionsFromDoc,
    runningRex,
    runningEva,
    allStationsFromDoc,
    landerLocation,
    planetRadius,
    toMapCoord,
    map,
  ]);

  return null;
}
