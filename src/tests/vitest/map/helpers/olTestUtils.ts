/**
 * OL Test Utilities — shared helpers for OpenLayers unit tests.
 *
 * These utilities create test fixtures (projections, coord converters, etc.)
 * without needing a real DOM, React, or Redux.
 */

import proj4 from "proj4";
import { register } from "ol/proj/proj4";
import {
  createCoordConverters,
  type CoordConverters,
} from "components/interface/map/hooks/useCoordConverters";

// ---------------------------------------------------------------------------
// Projection constants
// ---------------------------------------------------------------------------

/** Lunar South Pole Stereographic — the primary AEGIS projection */
export const LUNAR_SOUTH_POLE_PROJ4 =
  "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs";

export const LUNAR_PROJ_CODE = "IAU2000:30166";

// ---------------------------------------------------------------------------
// Projection registration
// ---------------------------------------------------------------------------

let registered = false;

/**
 * Register test projections with proj4 + OL. Safe to call multiple times.
 */
export function registerTestProjections(): void {
  if (registered) return;
  proj4.defs(LUNAR_PROJ_CODE, LUNAR_SOUTH_POLE_PROJ4);
  register(proj4);
  registered = true;
}

// ---------------------------------------------------------------------------
// Coordinate converters
// ---------------------------------------------------------------------------

/**
 * Create coord converters for the lunar south pole projection.
 * Registers the projection first if needed.
 */
export function createTestCoordConverters(): CoordConverters {
  registerTestProjections();
  return createCoordConverters(LUNAR_PROJ_CODE);
}

/**
 * Create coord converters for EPSG:3857 (Web Mercator / Earth).
 * No registration needed — EPSG:3857 is built-in to proj4.
 */
export function createEarthCoordConverters(): CoordConverters {
  registerTestProjections(); // ensure proj4 is registered with OL
  return createCoordConverters("EPSG:3857");
}

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

/** A point near the lunar south pole */
export const SOUTH_POLE_POINT: AEGISPoint = { lat: -89.5, lng: 0 };

/** A point near the LCROSS impact site */
export const LCROSS_POINT: AEGISPoint = { lat: -84.68, lng: -48.69 };

/** San Francisco (for Earth/EPSG:3857 tests) */
export const SF_POINT: AEGISPoint = { lat: 37.7749, lng: -122.4194 };

/** Los Angeles (for Earth/EPSG:3857 tests) */
export const LA_POINT: AEGISPoint = { lat: 34.0522, lng: -118.2437 };
