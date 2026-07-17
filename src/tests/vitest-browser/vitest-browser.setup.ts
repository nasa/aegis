/**
 * Setup for vitest browser mode tests.
 *
 * Runs before each browser test file. Registers custom projections with
 * proj4 + OpenLayers so that coordinate conversion tests work correctly.
 *
 * Does NOT import jsdom-specific mocks (box-node-sdk, automerge, etc.) —
 * browser tests run in real Chromium so those mocks are not needed.
 */

import proj4 from "proj4";
import { register } from "ol/proj/proj4";

const LUNAR_PROJ_CODE = "IAU2000:30166";
const LUNAR_SOUTH_POLE_PROJ4 =
  "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs";

// Register once when the setup file loads
proj4.defs(LUNAR_PROJ_CODE, LUNAR_SOUTH_POLE_PROJ4);
register(proj4);
