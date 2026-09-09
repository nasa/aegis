/**
 * Circles — behavior component that draws proximity circles around the lander
 * and around stations.
 *
 * Lander circles come from `mission.circleDefinitions` and preset `mapCircleControls`.
 * Station circles come from each station's own `mapCircleControls`.
 *
 * Uses the existing `createCircleLayer()` factory from utils/layers/circleLayer.ts
 * which handles solid, dashed, and checkerboard rendering modes.
 *
 * Returns null — headless behavior component.
 */

import { useEffect, useRef, useMemo } from "react";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";

import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { selectAsPlannedStations } from "store/selectors";
import { createCircleLayer } from "../utils/layers/circleLayer";
import { withAlpha } from "../utils/layers/layerFactory";

import { useMapContext } from "../MapProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { useMapMenuContext } from "../MapMenuProvider";
import { Z_INDEX } from "../utils/zIndex";
import { MODE_CONFIGS } from "../utils/modeConfig";

export function Circles(): null {
  const { map, mode } = useMapContext();
  const { toMapCoord } = useCoordConverters();
  const { submenuStations: mapDisplayStations } = useMapMenuContext();

  // Per-mode minimum stroke width so circles read clearly at each map scale
  // (e.g. thicker on the dashboard). Data `weight` is used when it exceeds this.
  const circleMinWidth = MODE_CONFIGS[mode].circle.minWidth;
  const circleLabelFontSize = MODE_CONFIGS[mode].circle.labelFontSize;

  // --- State -----------------------------------------------------------------
  const circleDefinitions = useMissionDocSelector((doc) => doc.circleDefinitions, deepEqual) as
    | CircleDefinitions
    | undefined;

  const landerLocation = useMissionDocSelector(
    (doc) => doc.landerLocation,
    deepEqual
  ) as AEGISPoint | null;

  const selectedPresetUuid = useAppSelector((s) => s.preset.selectedPresetUuid, refEqual);
  const presetCircleControls = useAppSelector(
    (s) => s.preset.presets.find((p) => p.uuid === selectedPresetUuid)?.mapCircleControls,
    deepEqual
  ) as MapCircleControls | undefined;

  const selectedEvaUuid = useAppSelector((s) => s.eva.selectedEvaUuid, refEqual);
  const selectedEva = useMissionDocSelector((m) => {
    return selectedEvaUuid ? m.evas?.[selectedEvaUuid] : null;
  }, deepEqual);

  const allStationsFromDoc = useMissionDocSelector(
    (m) => Object.values(m.stations ?? {}),
    deepEqual
  );
  const asPlannedStationsFromDoc = useMissionDocSelector(selectAsPlannedStations, deepEqual);
  const folders = useAppSelector((s) => s.interface.folders, deepEqual);
  const foldersInterface = useAppSelector((s) => s.interface.foldersInterface, deepEqual);

  // Compute the same set of visible stations as StationMarkers. Proximity
  // circles have no interactions, so they stay visible during an edit (they
  // are useful reference for placing paths/markers).
  const stationsWithCircles = useMemo((): Station[] => {
    const allStations = allStationsFromDoc ?? [];
    const asPlannedStations = asPlannedStationsFromDoc ?? [];

    const uuidsToShow = new Set<string>();

    // EVA sequence stations
    if (selectedEva) {
      const stationItems = selectedEva.sequence?.filter((item) => item.type === "station") ?? [];
      for (const item of stationItems) {
        if (item.uuid) uuidsToShow.add(item.uuid);
      }
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

    // Lander copies are not rendered as stations, so they get no circles either.
    return allStations.filter(
      (s) =>
        uuidsToShow.has(s.uuid) &&
        !s.isLanderXgress &&
        s.location?.lat != null &&
        s.location?.lng != null
    );
  }, [
    selectedEva,
    mapDisplayStations.show,
    allStationsFromDoc,
    asPlannedStationsFromDoc,
    folders,
    foldersInterface,
  ]);

  // --- Refs for managed layers -----------------------------------------------
  const landerCircleLayersRef = useRef<Map<string, VectorLayer<VectorSource>>>(new Map());
  const stationCircleLayersRef = useRef<Map<string, VectorLayer<VectorSource>>>(new Map());

  // --- Lander circles --------------------------------------------------------
  useEffect(() => {
    const prev = landerCircleLayersRef.current;

    // Remove all existing lander circle layers
    for (const [, layer] of prev) {
      map.removeLayer(layer);
    }
    prev.clear();

    if (
      !circleDefinitions ||
      !landerLocation ||
      landerLocation.lat == null ||
      landerLocation.lng == null ||
      !presetCircleControls
    ) {
      return;
    }

    const center = toMapCoord(landerLocation) as [number, number];

    for (const [uuid, def] of Object.entries(circleDefinitions)) {
      const ctrl = presetCircleControls[uuid];
      if (!ctrl?.visible || !ctrl.style) continue;

      const style = ctrl.style;
      const layer = createCircleLayer(center, def.radius, {
        zIndex: Z_INDEX.CIRCLES,
        stroke: {
          mode: style.isDashed ? "dashed" : "solid",
          color: withAlpha(style.color, style.opacity ?? 1),
          width: Math.max(style.weight, circleMinWidth),
          dashLength: style.dashLen || 10,
          gapLength: style.dashLen || 10,
        },
        label: {
          text: def.name || `${def.radius}m`,
          color: style.color,
          font: `bold ${circleLabelFontSize}px sans-serif`,
        },
      });
      map.addLayer(layer);
      prev.set(`lander-${uuid}`, layer);

      // If dashed, add the alternating-color offset layer
      if (style.isDashed && style.altColor) {
        const altLayer = createCircleLayer(center, def.radius, {
          zIndex: Z_INDEX.CIRCLES,
          stroke: {
            mode: "dashed",
            color: withAlpha(style.altColor, style.altOpacity ?? 1),
            width: Math.max(style.weight, circleMinWidth),
            dashLength: style.dashLen || 10,
            gapLength: style.dashLen || 10,
            dashOffset: style.dashLen || 10,
          },
          label: null,
        });
        map.addLayer(altLayer);
        prev.set(`lander-${uuid}-alt`, altLayer);
      }
    }

    return () => {
      for (const [, layer] of prev) {
        map.removeLayer(layer);
      }
      prev.clear();
    };
  }, [
    circleDefinitions,
    landerLocation,
    presetCircleControls,
    toMapCoord,
    map,
    circleMinWidth,
    circleLabelFontSize,
  ]);

  // --- Station circles -------------------------------------------------------
  useEffect(() => {
    const prev = stationCircleLayersRef.current;

    // Remove all existing station circle layers
    for (const [, layer] of prev) {
      map.removeLayer(layer);
    }
    prev.clear();

    const showCircles = mapDisplayStations.showCircles ?? true;
    if (!circleDefinitions || !showCircles) return;

    for (const station of stationsWithCircles) {
      if (!station?.location || station.location.lat == null || station.location.lng == null) {
        continue;
      }

      const center = toMapCoord(station.location) as [number, number];

      for (const [uuid, def] of Object.entries(circleDefinitions)) {
        const ctrl = station.mapCircleControls?.[uuid];
        if (!ctrl?.visible || !ctrl.style) continue;

        const style = ctrl.style;
        const layer = createCircleLayer(center, def.radius, {
          zIndex: Z_INDEX.CIRCLES,
          stroke: {
            mode: style.isDashed ? "dashed" : "solid",
            color: withAlpha(style.color, style.opacity ?? 1),
            width: Math.max(style.weight, circleMinWidth),
            dashLength: style.dashLen || 10,
            gapLength: style.dashLen || 10,
          },
          label: null, // station circles don't get labels
        });
        map.addLayer(layer);
        prev.set(`station-${station.uuid}-${uuid}`, layer);

        if (style.isDashed && style.altColor) {
          const altLayer = createCircleLayer(center, def.radius, {
            zIndex: Z_INDEX.CIRCLES,
            stroke: {
              mode: "dashed",
              color: withAlpha(style.altColor, style.altOpacity ?? 1),
              width: Math.max(style.weight, circleMinWidth),
              dashLength: style.dashLen || 10,
              gapLength: style.dashLen || 10,
              dashOffset: style.dashLen || 10,
            },
            label: null,
          });
          map.addLayer(altLayer);
          prev.set(`station-${station.uuid}-${uuid}-alt`, altLayer);
        }
      }
    }

    return () => {
      for (const [, layer] of prev) {
        map.removeLayer(layer);
      }
      prev.clear();
    };
  }, [
    circleDefinitions,
    stationsWithCircles,
    mapDisplayStations?.showCircles,
    toMapCoord,
    map,
    circleMinWidth,
  ]);

  return null;
}
