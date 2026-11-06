import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createLgrsRenderPlan } from "utils/lgrs/grid/plan";
import { getLgrsGridBinding } from "utils/lgrs/gridBinding";
import {
  getLtmCentralMeridian,
  getLtmZone,
  isLtmCrs,
  LGRS_CRS_LPS_NORTH,
} from "utils/lgrs/moon/crs";
import { moonGridSystem } from "utils/lgrs/moon/system";

const moonBinding = (projection: LgrsMapProjection) =>
  getLgrsGridBinding(projection, moonGridSystem);

// Every grid-node case of the lgrs 0.4.0 corpus is rendered as a plan whose spacing equals the
// case precision; the plan's label at that node must equal the oracle's box label.

type OracleLabel = {
  lgrs: string;
  acc: string;
  prefix: string;
  condensed: string;
  text: string;
  lowerLeft: [number, number];
};

type GridNodeCase = {
  category: string;
  crsId: LgrsCrsId;
  easting: number;
  northing: number;
  precision: LgrsPrecision;
  expectedBox: OracleLabel | null;
};

const MOON = "+a=1737400 +b=1737400 +units=m +no_defs";
const southCap = moonBinding({
  projCode: "ORACLE:S",
  proj4Def: `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`,
});
const northCap = moonBinding({
  projCode: "ORACLE:N",
  proj4Def: `+proj=stere +lat_0=90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`,
});
const mercator = moonBinding({ projCode: "EPSG:3857", proj4Def: null });
const equirectangular = moonBinding({
  projCode: "ORACLE:EQC",
  proj4Def: `+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 ${MOON}`,
});

/** A spherical TM map on the zone's central meridian (affine to LTM). */
function zoneTm(crs: LgrsCrsId): LgrsGridBinding {
  const lon = getLtmCentralMeridian(getLtmZone(crs));
  return moonBinding({
    projCode: `ORACLE:TM${lon}`,
    proj4Def: `+proj=tmerc +approx +lat_0=0 +lon_0=${lon} +k=1 +x_0=0 +y_0=0 ${MOON}`,
  });
}

const cases = (
  JSON.parse(
    readFileSync(resolve(process.cwd(), "src/tests/vitest/fixtures/lgrs/0.4.0/labels.json"), "utf8")
  ) as { cases: GridNodeCase[] }
).cases.filter((c) => c.category === "grid-node" && c.expectedBox);

const out = new Float64Array(2);
const neighbour = new Float64Array(2);
const PIXELS_PER_SPACING = 100;
const HALF_WIDTH_PX = 300;
const HALF_HEIGHT_PX = 200;

function adapterFor(c: GridNodeCase, index: number): LgrsGridBinding {
  if (!isLtmCrs(c.crsId)) return c.crsId === LGRS_CRS_LPS_NORTH ? northCap : southCap;
  return [mercator, equirectangular, zoneTm(c.crsId)][index % 3];
}

describe("createLgrsRenderPlan labels against the lgrs 0.4.0 oracle", () => {
  test("covers every grid-node case", () => {
    expect(cases.length).toBeGreaterThan(900);
  });

  test.each(cases.map((c, index) => [index, c] as const))(
    "case %i labels its node like the oracle",
    (index, c) => {
      const adapter = adapterFor(c, index);
      expect(adapter.gridToMap(c.easting, c.northing, c.crsId, out)).toBe(true);
      expect(adapter.gridToMap(c.easting, c.northing + c.precision, c.crsId, neighbour)).toBe(true);
      const resolution =
        Math.hypot(neighbour[0] - out[0], neighbour[1] - out[1]) / PIXELS_PER_SPACING;
      const plan = createLgrsRenderPlan({
        binding: adapter,
        extent: [
          out[0] - HALF_WIDTH_PX * resolution,
          out[1] - HALF_HEIGHT_PX * resolution,
          out[0] + HALF_WIDTH_PX * resolution,
          out[1] + HALF_HEIGHT_PX * resolution,
        ],
        resolution,
        gridSpacingMode: c.precision,
        gridLabelInterval: c.precision,
        labelsVisible: true,
      });

      expect(plan.tier).toBe("box");
      expect(plan.capped).toBe(false);
      const label = plan.labels.find(
        (candidate) =>
          candidate.crs === c.crsId &&
          candidate.node[0] === c.easting &&
          candidate.node[1] === c.northing
      );
      expect(label, `${c.crsId} ${c.easting} ${c.northing} @${c.precision}`).toBeDefined();
      const { lgrs, acc, prefix, condensed, text, lowerLeft } = label.label;
      expect({ lgrs, acc, prefix, condensed, text, lowerLeft }).toEqual(c.expectedBox);
      expect(label.text).toBe(c.expectedBox.text);
    }
  );
});
