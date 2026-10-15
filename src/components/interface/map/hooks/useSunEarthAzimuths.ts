/**
 * useSunEarthAzimuths — sun/earth compass azimuths for the selected preset.
 *
 * With `preset.sunEarthFromDate` on and an active map datetime, azimuths are computed from
 * the lander location and rotated into map-up degrees. Otherwise the preset's manual
 * azimuths are returned unchanged.
 */

import { useMemo } from "react";
import proj4 from "proj4";

import { refEqual, deepEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getLunarSunEarthPositions, getMapAzimuthFromTrueAzimuth } from "utils/mapping/lunarSky";
import { useMapDateTimeWithSource } from "./useMapDateTime";
import { useCoordConverters } from "./useCoordConverters";

const DEFAULT_LUNAR_RADIUS_METERS = 1737400;

export function useSunEarthAzimuths(preset: Preset | null | undefined): SunEarthAzimuths {
  const mapDateTime = useMapDateTimeWithSource();
  const { toMapCoord } = useCoordConverters();
  const landerLocation = useMissionDocSelector((m) => m.landerLocation, deepEqual);
  const landerElevationMeters = useMissionDocSelector((m) => m.landerElevationMeters, refEqual);
  const planetRadius = useMissionDocSelector((m) => m.planetRadius, refEqual);
  const customProjection = useMissionDocSelector(
    (m) => (m.projIsCustom ? m.projProj4String : null),
    refEqual
  );

  const manualSun = preset?.sunAzimuth ?? 0;
  const manualEarth = preset?.earthAzimuth ?? 0;
  const fromDate = preset?.sunEarthFromDate ?? false;

  return useMemo<SunEarthAzimuths>(() => {
    const manual: SunEarthAzimuths = {
      sunAzimuth: manualSun,
      earthAzimuth: manualEarth,
      source: "manual",
      datetime: null,
      datetimeSourceLabel: null,
      statusLabel: "Manual",
      warning: [
        "Manual preset values; not calculated from a date.",
        mapDateTime.datetime ? mapDateTime.evaWarning : mapDateTime.warning,
      ]
        .filter(Boolean)
        .join(" "),
    };
    if (!fromDate || !mapDateTime.datetime) return manual;
    if (!Number.isFinite(landerLocation?.lat) || !Number.isFinite(landerLocation?.lng)) {
      return {
        ...manual,
        warning: `Lander location is unavailable; using manual azimuths. ${manual.warning}`,
      };
    }
    const epochMs = new Date(mapDateTime.datetime).getTime();
    if (!Number.isFinite(epochMs))
      return {
        ...manual,
        warning: `The map date is invalid; using manual azimuths. ${manual.warning}`,
      };

    const { sun, earth } = getLunarSunEarthPositions(
      landerLocation,
      landerElevationMeters ?? 0,
      planetRadius ?? DEFAULT_LUNAR_RADIUS_METERS,
      epochMs
    );
    const toMapAzimuth = (trueAzimuth: number) => {
      // The preset panel can render before MapProvider registers the mission projection.
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
        datetimeSourceLabel: mapDateTime.sourceLabel,
        statusLabel:
          mapDateTime.source === "preset-preview"
            ? "Preview"
            : mapDateTime.source === "layer"
              ? "Fallback"
              : "Calculated",
        warning: mapDateTime.warning,
      };
    } catch {
      return {
        ...manual,
        warning: `Map projection is unavailable; using manual azimuths. ${manual.warning}`,
      };
    }
  }, [
    manualSun,
    manualEarth,
    fromDate,
    mapDateTime,
    landerLocation,
    landerElevationMeters,
    planetRadius,
    customProjection,
    toMapCoord,
  ]);
}
