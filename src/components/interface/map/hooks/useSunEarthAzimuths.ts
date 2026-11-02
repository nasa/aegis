import { useMemo } from "react";
import proj4 from "proj4";

import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getLunarSunEarthPositions, getMapAzimuthFromTrueAzimuth } from "utils/mapping/lunarSky";
import { useCoordConverters } from "./useCoordConverters";

const DEFAULT_LUNAR_RADIUS_METERS = 1737400;

export function useSunEarthAzimuths(followTimelineHover = false): SunEarthAzimuths {
  const selectedEvaUuid = useAppSelector((s) => s.eva.selectedEvaUuid, refEqual);
  const timelineTime = useAppSelector(
    (s) => (followTimelineHover ? s.hover.timelineTime : null),
    deepEqual
  );
  const eva = useMissionDocSelector((m) => m.evas?.[selectedEvaUuid], deepEqual);
  const { toMapCoord } = useCoordConverters();
  const landerLocation = useMissionDocSelector((m) => m.landerLocation, deepEqual);
  const landerElevationMeters = useMissionDocSelector((m) => m.landerElevationMeters, refEqual);
  const planetRadius = useMissionDocSelector((m) => m.planetRadius, refEqual);
  const customProjection = useMissionDocSelector(
    (m) => (m.projIsCustom ? m.projProj4String : null),
    refEqual
  );

  const manualSun = eva?.sunAzimuth ?? 0;
  const manualEarth = eva?.earthAzimuth ?? 0;
  const fromDate = eva?.sunEarthFromDate ?? true;

  return useMemo<SunEarthAzimuths>(() => {
    const manual: SunEarthAzimuths = {
      sunAzimuth: manualSun,
      earthAzimuth: manualEarth,
      source: "manual",
      datetime: null,
      datetimeSourceLabel: null,
      statusLabel: "Manual",
      warning: null,
      available: true,
    };
    const unavailable = (warning: string): SunEarthAzimuths => ({
      ...manual,
      available: false,
      warning,
    });
    if (!eva) return unavailable("No EVA selected.");
    if (!fromDate) return manual;
    if (planetRadius !== DEFAULT_LUNAR_RADIUS_METERS)
      return unavailable(
        "Calculated values are unavailable because this mission is not on the Moon."
      );
    if (eva.datetime == null || !Number.isFinite(new Date(eva.datetime).getTime()))
      return unavailable("The selected EVA has no valid start date.");
    if (!Number.isFinite(landerLocation?.lat) || !Number.isFinite(landerLocation?.lng))
      return unavailable("Lander location is unavailable.");
    const hoverDatetime =
      timelineTime?.evaUuid === selectedEvaUuid &&
      Number.isFinite(timelineTime.elapsedSeconds) &&
      timelineTime.elapsedSeconds >= 0
        ? eva.datetime + timelineTime.elapsedSeconds * 1000
        : NaN;
    const isTimelineHover = Number.isFinite(new Date(hoverDatetime).getTime());
    const epochMs = isTimelineHover ? hoverDatetime : eva.datetime;

    const { sun, earth } = getLunarSunEarthPositions(
      landerLocation,
      landerElevationMeters ?? 0,
      planetRadius ?? DEFAULT_LUNAR_RADIUS_METERS,
      epochMs
    );
    const toMapAzimuth = (trueAzimuth: number) => {
      // The EVA panel can render before MapProvider registers the mission projection.
      const project = customProjection
        ? (point: AEGISPoint) => proj4("EPSG:4326", customProjection, [point.lng, point.lat])
        : toMapCoord;
      const mapAzimuth = getMapAzimuthFromTrueAzimuth(landerLocation, trueAzimuth, (point) => {
        const coordinates = project(point);
        if (!coordinates.every(Number.isFinite)) throw new Error("Invalid map projection");
        return coordinates;
      });
      return mapAzimuth;
    };

    try {
      return {
        sunAzimuth: toMapAzimuth(sun.azimuth),
        earthAzimuth: toMapAzimuth(earth.azimuth),
        source: "date",
        datetime: epochMs,
        datetimeSourceLabel: `${isTimelineHover ? "Timeline hover" : "EVA start"}: ${eva.name || eva.uuid}`,
        statusLabel: "Calculated",
        warning: null,
        available: true,
      };
    } catch {
      return unavailable("Map projection is unavailable.");
    }
  }, [
    manualSun,
    manualEarth,
    fromDate,
    eva,
    selectedEvaUuid,
    timelineTime,
    landerLocation,
    landerElevationMeters,
    planetRadius,
    customProjection,
    toMapCoord,
  ]);
}
