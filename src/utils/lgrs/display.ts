/** Precision of grid coordinates shown in panes, the mouse readout and exports. */
export const LGRS_DISPLAY_PRECISION_METERS: LgrsPrecision = 10;

/** Short label scheme names for the scheme indicator and toggle. */
export const GRID_LABEL_SCHEME_NAMES: Readonly<Record<GridLabelScheme, string>> = {
  "lunar-acc": "ACC",
  mgrs: "MGRS",
};

/** Explanations shared by coordinate indicators and the grid scheme menu. */
export const GRID_COORDINATE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  ACC: "ACC (Artemis Condensed Coordinates): this Earth grid uses MGRS with LGRS-like labels.",
  MGRS: "MGRS (Military Grid Reference System): standard Earth grid coordinates based on WGS84 UTM/UPS.",
  LGRS: "LGRS (Lunar Grid Reference System): Moon grid coordinates shown with Artemis Condensed Coordinate (ACC) labels.",
};

/**
 * Display string for a point in its own CRS of `system`, using point semantics (see
 * `LgrsGridSystem.formatPoint`). Returns null for a missing or invalid point.
 */
export function formatLgrsFromLatLon(
  system: LgrsGridSystem,
  point: AEGISPoint | null | undefined,
  precision: LgrsPrecision,
  style: LgrsDisplayStyle
): string | null {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  return system.formatPoint(point.lat, point.lng, precision, style);
}
