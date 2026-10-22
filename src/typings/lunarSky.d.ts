type Vec3 = [number, number, number];

/**
 * Direction of a celestial body seen from a surface point.
 * Azimuth is degrees clockwise from true north; elevation is degrees above the smooth
 * local horizon (terrain ignored).
 */
type LunarSkyPosition = {
  azimuth: number;
  elevation: number;
};

type LunarSunEarthPositions = {
  sun: LunarSkyPosition;
  earth: LunarSkyPosition;
};

/**
 * Sun/Earth azimuths to show on the map compass, in map-up degrees.
 * `source` is "date" when computed from the EVA start date, otherwise "manual".
 */
type SunEarthAzimuths = {
  available: boolean;
  sunAzimuth: number;
  earthAzimuth: number;
  source: "date" | "manual";
  /** Epoch ms used for the calculation; null for manual azimuths. */
  datetime: number | null;
  datetimeSourceLabel: string | null;
  statusLabel: "Manual" | "Calculated" | "Preview" | "Fallback";
  warning: string | null;
};
