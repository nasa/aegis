import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { formatEarthAccBoxLabel } from "utils/lgrs/earth/acc";
import { formatMgrsBoxLabel } from "utils/lgrs/earth/mgrs";
import { unprojectEarthToLatLon } from "utils/lgrs/earth/projection";
import { getEarthGridSystem } from "utils/lgrs/earth/system";
import {
  classifyEarthLatLon,
  EARTH_CRS_UPS_NORTH,
  EARTH_CRS_UPS_SOUTH,
  getUtmCrsId,
  isInEarthRegion,
  isUpsCrs,
} from "utils/lgrs/earth/zones";
import { createLgrsRenderPlan, LGRS_RENDER_CAPS } from "utils/lgrs/grid/plan";
import { getLgrsGridBinding } from "utils/lgrs/gridBinding";
import { getLgrsMapProjection } from "utils/lgrs/mapProjection";

// Earth render-plan properties (plan §4.4, §8.4): vertices on their lines, ends on region
// boundaries, node labels equal to the core/oracle labels, the caps, and the agreement of every
// drawn region with `classifyLatLon`.

const SCHEMES: GridLabelScheme[] = ["lunar-acc", "mgrs"];
const PROJECTIONS: Record<string, LgrsMapProjection> = {
  mercator: getLgrsMapProjection({
    id: 1,
    projIsCustom: false,
    projEpsg: "EPSG:3857",
    projProj4String: null,
  }),
  utm15: {
    projCode: "EPSG:32615",
    proj4Def: "+proj=utm +zone=15 +datum=WGS84 +units=m +no_defs",
  },
  upsNorth: {
    projCode: "EPSG:32661",
    proj4Def:
      "+proj=stere +lat_0=90 +lat_ts=90 +lon_0=0 +k=0.994 +x_0=2000000 +y_0=2000000 +datum=WGS84 +units=m +no_defs",
  },
  upsSouth: {
    projCode: "EPSG:32761",
    proj4Def:
      "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=0.994 +x_0=2000000 +y_0=2000000 +datum=WGS84 +units=m +no_defs",
  },
};

const utm = (zone: number, hemisphere: LgrsHemisphere = "N") => getUtmCrsId(zone, hemisphere);

type Viewport = {
  name: string;
  projection: keyof typeof PROJECTIONS;
  lat: number;
  lon: number;
  /** Map units per pixel. */
  resolution: number;
  spacing?: LgrsGridSpacing;
  labels?: LgrsGridSpacing;
  width?: number;
  height?: number;
  tier: LgrsRenderTier;
  /** Regions the plan must draw (both schemes). */
  regions?: LgrsCrsId[];
};

const VIEWPORTS: Viewport[] = [
  {
    name: "JSC ~5 km",
    projection: "mercator",
    lat: 29.5593,
    lon: -95.09,
    resolution: 3,
    tier: "box",
    regions: [utm(15)],
  },
  {
    name: "JSC ~50 km",
    projection: "mercator",
    lat: 29.5593,
    lon: -95.09,
    resolution: 30,
    tier: "box",
    regions: [utm(15)],
  },
  {
    name: "JSC fixed 1 km",
    projection: "mercator",
    lat: 29.5593,
    lon: -95.09,
    resolution: 20,
    spacing: 1000,
    labels: 1000,
    tier: "box",
  },
  {
    name: "JSC fixed 100 m",
    projection: "mercator",
    lat: 29.5593,
    lon: -95.09,
    resolution: 2,
    spacing: 100,
    labels: 100,
    tier: "box",
  },
  {
    name: "JSC fixed 10 m",
    projection: "mercator",
    lat: 29.5593,
    lon: -95.09,
    resolution: 0.3,
    spacing: 10,
    labels: 10,
    tier: "box",
  },
  {
    name: "JSC UTM map (affine)",
    projection: "utm15",
    lat: 29.5593,
    lon: -95.09,
    resolution: 25,
    tier: "box",
    regions: [utm(15)],
  },
  {
    name: "Texas 14/15 seam",
    projection: "mercator",
    lat: 30,
    lon: -96,
    resolution: 30,
    tier: "box",
    regions: [utm(14), utm(15)],
  },
  {
    name: "Texas 14/15 seam, UTM 15 map",
    projection: "utm15",
    lat: 30,
    lon: -96,
    resolution: 25,
    tier: "box",
    regions: [utm(14), utm(15)],
  },
  {
    name: "equator crossing",
    projection: "mercator",
    lat: 0.05,
    lon: -93.5,
    resolution: 25,
    tier: "box",
    regions: [utm(15), utm(15, "S")],
  },
  {
    name: "Norway 31V/32V at 3° E",
    projection: "mercator",
    lat: 60,
    lon: 3,
    resolution: 60,
    tier: "box",
    regions: [utm(31), utm(32)],
  },
  {
    name: "Norway 56° corner of 32V",
    projection: "mercator",
    lat: 56,
    lon: 4.5,
    resolution: 40,
    tier: "box",
    regions: [utm(31), utm(32)],
  },
  {
    name: "Iceland across the 64° N band boundary",
    projection: "mercator",
    lat: 64,
    lon: -16.5,
    resolution: 50,
    tier: "box",
    regions: [utm(28)],
  },
  {
    name: "Svalbard 31X/33X at 9° E",
    projection: "mercator",
    lat: 78,
    lon: 9,
    resolution: 100,
    tier: "box",
    regions: [utm(31), utm(33)],
  },
  {
    name: "84° N seam, UPS map",
    projection: "upsNorth",
    lat: 84,
    lon: 1,
    resolution: 25,
    tier: "box",
    regions: [EARTH_CRS_UPS_NORTH, utm(30), utm(31)],
  },
  {
    name: "84° N seam, Web Mercator",
    projection: "mercator",
    lat: 84,
    lon: 1,
    resolution: 200,
    tier: "box",
    regions: [EARTH_CRS_UPS_NORTH, utm(30), utm(31)],
  },
  {
    name: "north pole (affine)",
    projection: "upsNorth",
    lat: 89.98,
    lon: 0,
    resolution: 3,
    tier: "box",
    regions: [EARTH_CRS_UPS_NORTH],
  },
  {
    name: "80° S seam, UPS map",
    projection: "upsSouth",
    lat: -80,
    lon: 100,
    resolution: 25,
    tier: "box",
    regions: [EARTH_CRS_UPS_SOUTH, utm(47, "S")],
  },
  {
    name: "antimeridian",
    projection: "mercator",
    lat: 10,
    lon: 180,
    resolution: 30,
    tier: "box",
    regions: [utm(1), utm(60)],
  },
  {
    name: "continental zoom (hidden)",
    projection: "mercator",
    lat: 30,
    lon: -95,
    resolution: 5000,
    tier: "none",
  },
];

const WIDTH = 1920;
const HEIGHT = 1080;
const out = new Float64Array(2);
const other = new Float64Array(2);
const latLon = new Float64Array(2);

function bindingFor(projection: keyof typeof PROJECTIONS, scheme: GridLabelScheme) {
  return getLgrsGridBinding(PROJECTIONS[projection], getEarthGridSystem(scheme));
}

function buildPlan(viewport: Viewport, scheme: GridLabelScheme) {
  const binding = bindingFor(viewport.projection, scheme);
  expect(binding.latLonToMap(viewport.lat, viewport.lon, out)).toBe(true);
  const r = viewport.resolution;
  const width = viewport.width ?? WIDTH;
  const height = viewport.height ?? HEIGHT;
  const extent: LgrsMapExtent = [
    out[0] - (width / 2) * r,
    out[1] - (height / 2) * r,
    out[0] + (width / 2) * r,
    out[1] + (height / 2) * r,
  ];
  const plan = createLgrsRenderPlan({
    binding,
    extent,
    resolution: r,
    gridSpacingMode: viewport.spacing ?? "auto",
    gridLabelInterval: viewport.labels ?? "auto",
    labelsVisible: true,
  });
  return { binding, extent, plan };
}

/** Largest grid metres per map pixel of `crs` at map coordinate `[x, y]`. */
function metersPerPixel(binding: LgrsGridBinding, crs: LgrsCrsId, x: number, y: number, r: number) {
  binding.mapToGrid(x, y, crs, out);
  const e = out[0];
  const n = out[1];
  binding.mapToGrid(x + r, y, crs, other);
  const dx = Math.hypot(other[0] - e, other[1] - n);
  binding.mapToGrid(x, y + r, crs, other);
  return Math.max(dx, Math.hypot(other[0] - e, other[1] - n));
}

function onExtentEdge(x: number, y: number, extent: LgrsMapExtent): boolean {
  const eps = 1e-6 * Math.max(extent[2] - extent[0], 1);
  return (
    Math.abs(x - extent[0]) < eps ||
    Math.abs(x - extent[2]) < eps ||
    Math.abs(y - extent[1]) < eps ||
    Math.abs(y - extent[3]) < eps
  );
}

/** Whether grid point `[e, n]` of `crs` is in the region (the classifier's own test). */
function isInside(crs: LgrsCrsId, e: number, n: number): boolean {
  return unprojectEarthToLatLon(e, n, crs, latLon) && isInEarthRegion(latLon[0], latLon[1], crs);
}

/** The constant-E/N line's other coordinate at map point `[x, y]`. */
function lineParameter(binding: LgrsGridBinding, line: LgrsRenderLine, x: number, y: number) {
  binding.mapToGrid(x, y, line.crs, out);
  return line.axis === "easting" ? out[1] : out[0];
}

function linePoint(line: LgrsRenderLine, t: number): [number, number] {
  return line.axis === "easting" ? [line.value, t] : [t, line.value];
}

function coreLabel(scheme: GridLabelScheme, crs: LgrsCrsId, e: number, n: number, p: number) {
  return scheme === "mgrs"
    ? formatMgrsBoxLabel(crs, e, n, p as EarthMgrsPrecision)
    : formatEarthAccBoxLabel(crs, e, n, p as EarthAccPrecision);
}

describe.each(SCHEMES)("Earth render plans (%s)", (scheme) => {
  describe.each(VIEWPORTS)("$name", (viewport) => {
    const { binding, extent, plan } = buildPlan(viewport, scheme);
    const gridLines = plan.lines.filter((line) => line.kind === "grid" && line.crs >= 0);

    test("uses the expected tier and regions", () => {
      expect(plan.tier).toBe(viewport.tier);
      if (viewport.regions) expect([...plan.regions].sort()).toEqual([...viewport.regions].sort());
      if (viewport.tier === "box") expect(gridLines.length).toBeGreaterThan(0);
      if (viewport.tier === "none") expect(plan.lines.length + plan.labels.length).toBe(0);
    });

    test("respects the caps", () => {
      expect(plan.lines.length).toBeLessThanOrEqual(LGRS_RENDER_CAPS.maxLines);
      expect(plan.labels.length).toBeLessThanOrEqual(LGRS_RENDER_CAPS.maxLabels);
      expect(plan.vertexCount).toBeLessThanOrEqual(LGRS_RENDER_CAPS.maxVertices);
      const vertices = plan.lines.reduce((sum, line) => sum + line.coordinates.length / 2, 0);
      expect(plan.vertexCount).toBe(vertices);
      expect(plan.lines.every((line) => line.coordinates.length >= 4)).toBe(true);
    });

    test("draws grid lines at multiples of the plan spacing", () => {
      if (plan.tier !== "box") return;
      if (typeof viewport.spacing === "number") expect(plan.lineSpacing).toBe(viewport.spacing);
      for (const line of gridLines) {
        expect(line.value % plan.lineSpacing).toBe(0);
      }
    });

    test("puts every vertex on its constant-E/N line", () => {
      for (const line of gridLines) {
        const index = line.axis === "easting" ? 0 : 1;
        for (let i = 0; i < line.coordinates.length; i += 2) {
          const x = line.coordinates[i];
          const y = line.coordinates[i + 1];
          const tolerance =
            0.5 * metersPerPixel(binding, line.crs, x, y, viewport.resolution) + 1e-6;
          expect(binding.mapToGrid(x, y, line.crs, out)).toBe(true);
          expect(Math.abs(out[index] - line.value), `${line.crs} ${line.value}`).toBeLessThan(
            tolerance
          );
        }
      }
    });

    test("ends every line on the view edge or on its region boundary, to a few cm", () => {
      let boundaryEnds = 0;
      for (const line of gridLines) {
        const last = line.coordinates.length - 2;
        const start = lineParameter(binding, line, line.coordinates[0], line.coordinates[1]);
        const end = lineParameter(
          binding,
          line,
          line.coordinates[last],
          line.coordinates[last + 1]
        );
        const direction = Math.sign(end - start);
        for (const [i, t, outward] of [
          [0, start, -direction],
          [last, end, direction],
        ]) {
          if (onExtentEdge(line.coordinates[i], line.coordinates[i + 1], extent)) continue;
          boundaryEnds++;
          const name = `${line.crs} ${line.axis} ${line.value} at ${t}`;
          if (isUpsCrs(line.crs)) {
            const cap = binding.system.getCap(line.crs)!;
            const [e, n] = linePoint(line, t);
            expect(
              Math.abs(Math.hypot(e - cap.centreE, n - cap.centreN) - cap.radius)
            ).toBeLessThan(1e-3);
            continue;
          }
          expect(isInside(line.crs, ...linePoint(line, t - outward * 0.03)), name).toBe(true);
          expect(isInside(line.crs, ...linePoint(line, t + outward * 0.05)), name).toBe(false);
        }
      }
      // Views across a seam must clip lines there.
      if ((viewport.regions?.length ?? 0) > 1) expect(boundaryEnds).toBeGreaterThan(0);
    });

    test("agrees with classifyLatLon at points sampled inside every drawn region", () => {
      for (const line of gridLines) {
        const last = line.coordinates.length - 2;
        const start = lineParameter(binding, line, line.coordinates[0], line.coordinates[1]);
        const end = lineParameter(
          binding,
          line,
          line.coordinates[last],
          line.coordinates[last + 1]
        );
        const margin = Math.min(0.05, Math.abs(end - start) / 4);
        const from = Math.min(start, end) + margin;
        const to = Math.max(start, end) - margin;
        for (let k = 0; k <= 16; k++) {
          const [e, n] = linePoint(line, from + ((to - from) * k) / 16);
          expect(unprojectEarthToLatLon(e, n, line.crs, latLon)).toBe(true);
          expect(binding.system.classifyLatLon(latLon[0], latLon[1]), `${line.crs} ${e} ${n}`).toBe(
            line.crs
          );
        }
      }
      for (const label of plan.labels) {
        const [e, n] = label.node!;
        expect(unprojectEarthToLatLon(e, n, label.crs, latLon)).toBe(true);
        expect(binding.system.classifyLatLon(latLon[0], latLon[1])).toBe(label.crs);
      }
    });

    test("labels each node with the core label of its box, inside the view", () => {
      for (const label of plan.labels) {
        expect(label.coordinate[0]).toBeGreaterThanOrEqual(extent[0] - 1e-6);
        expect(label.coordinate[0]).toBeLessThanOrEqual(extent[2] + 1e-6);
        expect(label.coordinate[1]).toBeGreaterThanOrEqual(extent[1] - 1e-6);
        expect(label.coordinate[1]).toBeLessThanOrEqual(extent[3] + 1e-6);
        const [e, n] = label.node!;
        const expected = coreLabel(scheme, label.crs, e, n, label.label!.precision);
        expect(label.label).toEqual(expected);
        expect(label.text).toBe(expected!.text);
        expect(e % plan.labelSpacing).toBe(0);
        expect(n % plan.labelSpacing).toBe(0);
        binding.mapToGrid(label.coordinate[0], label.coordinate[1], label.crs, out);
        expect(Math.abs(out[0] - e) + Math.abs(out[1] - n)).toBeLessThan(1e-3);
      }
    });
  });
});

describe("Earth schemes share the grid", () => {
  const fixed = VIEWPORTS.filter((viewport) => typeof viewport.spacing === "number");

  test.each(fixed)("$name: same lines, labels differ only in text", (viewport) => {
    const accPlan = buildPlan(viewport, "lunar-acc").plan;
    const mgrsPlan = buildPlan(viewport, "mgrs").plan;
    expect(mgrsPlan.lineSpacing).toBe(accPlan.lineSpacing);
    expect(mgrsPlan.lines).toEqual(accPlan.lines);
    expect(mgrsPlan.labels.map((label) => label.node)).toEqual(
      accPlan.labels.map((label) => label.node)
    );
    expect(mgrsPlan.labels.map((label) => label.coordinate)).toEqual(
      accPlan.labels.map((label) => label.coordinate)
    );
    expect(accPlan.labels.length).toBeGreaterThan(0);
    expect(mgrsPlan.labels[0].text).not.toBe(accPlan.labels[0].text);
  });

  test("ACC hides the grid past 25 km lines; MGRS keeps 100 km lines", () => {
    const view: Viewport = {
      name: "wide",
      projection: "mercator",
      lat: 29.5593,
      lon: -95.09,
      resolution: 400,
      tier: "box",
    };
    const accPlan = buildPlan(view, "lunar-acc").plan;
    const mgrsPlan = buildPlan(view, "mgrs").plan;
    expect(accPlan.tier).toBe("none");
    expect(mgrsPlan.tier).toBe("box");
    expect(mgrsPlan.lineSpacing).toBeGreaterThan(25000);
  });
});

describe("Earth band boundary (Iceland, 64° N)", () => {
  const view = VIEWPORTS.find((viewport) => viewport.name.startsWith("Iceland"))!;

  test.each(SCHEMES)("lines and condensed labels run continuously across 64° N (%s)", (scheme) => {
    const { plan } = buildPlan(view, scheme);
    expect(plan.regions).toEqual([utm(28)]);
    const band = plan.lines.filter((line) => line.axis === "parallel" && line.value === 64);
    expect(band.length).toBeGreaterThan(0);
    expect(band.every((line) => line.kind === "seam")).toBe(true);

    // Easting lines are not split at the band parallel.
    const binding = bindingFor(view.projection, scheme);
    const crossing = plan.lines.filter((line) => {
      if (line.axis !== "easting") return false;
      const lats = [];
      for (let i = 0; i < line.coordinates.length; i += 2) {
        binding.mapToLatLon(line.coordinates[i], line.coordinates[i + 1], latLon);
        lats.push(latLon[0]);
      }
      return Math.min(...lats) < 64 && Math.max(...lats) > 64;
    });
    expect(crossing.length).toBeGreaterThan(0);

    // One lattice of boxes either side, labelled with band V or W.
    const bands = new Set<string>();
    for (const label of plan.labels) {
      const { prefix, acc, condensed } = label.label!;
      expect(label.crs).toBe(utm(28));
      expect(prefix).toMatch(/^28[VW]/);
      bands.add(prefix[2]);
      expect(acc).toBe(prefix + condensed);
    }
    expect([...bands].sort()).toEqual(["V", "W"]);
  });

  test.each(SCHEMES)("readouts change only the band letter across 64° N (%s)", (scheme) => {
    const system = getEarthGridSystem(scheme);
    // Two points 0.6 m apart either side of 64° N, inside one 10 m box.
    let below = "";
    let above = "";
    for (let lon = -16.5; lon < -16; lon += 0.01) {
      system.projectLatLon(64, lon, utm(28), out);
      const [e, n] = [out[0], out[1]];
      if (Math.floor((n - 0.3) / 10) !== Math.floor((n + 0.3) / 10)) continue;
      system.unprojectToLatLon(e, n - 0.3, utm(28), latLon);
      expect(latLon[0]).toBeLessThan(64);
      below = system.formatPoint(latLon[0], latLon[1], 10, "full")!;
      const belowCondensed = system.formatPoint(latLon[0], latLon[1], 10, "condensed");
      system.unprojectToLatLon(e, n + 0.3, utm(28), latLon);
      expect(latLon[0]).toBeGreaterThanOrEqual(64);
      above = system.formatPoint(latLon[0], latLon[1], 10, "full")!;
      expect(system.formatPoint(latLon[0], latLon[1], 10, "condensed")).toBe(belowCondensed);
      break;
    }
    expect(below).toMatch(/^28V/);
    expect(above).toMatch(/^28W/);
    expect(below.slice(3)).toBe(above.slice(3));
  });
});

describe("Earth box labels against the oracle corpus", () => {
  type BoxCase = {
    category: string;
    crsId: LgrsCrsId;
    precision: number;
    lowerLeft: [number, number];
    centreInRegion: boolean;
    expected: { acc: { full: string } | null; mgrs: string | null };
  };
  const cases = (
    JSON.parse(
      readFileSync(
        resolve(process.cwd(), "src/tests/vitest/fixtures/lgrs-earth/v1/format-boxes.json"),
        "utf8"
      )
    ) as { cases: BoxCase[] }
  ).cases.filter((c) => {
    const [e, n] = c.lowerLeft;
    return unprojectEarthToLatLon(e, n, c.crsId, latLon) &&
      classifyEarthLatLon(latLon[0], latLon[1]) === c.crsId
      ? latLon[0] < 85 || isUpsCrs(c.crsId)
      : false;
  });

  test("covers UTM and UPS cases", () => {
    expect(cases.filter((c) => isUpsCrs(c.crsId)).length).toBeGreaterThan(20);
    expect(cases.filter((c) => !isUpsCrs(c.crsId)).length).toBeGreaterThan(100);
  });

  test.each(SCHEMES)("every plan label at an oracle node equals the oracle (%s)", (scheme) => {
    let checked = 0;
    for (const c of cases) {
      const expected = scheme === "mgrs" ? c.expected.mgrs : c.expected.acc?.full;
      if (!expected) continue;
      const [e, n] = c.lowerLeft;
      const projection = isUpsCrs(c.crsId)
        ? c.crsId === EARTH_CRS_UPS_NORTH
          ? "upsNorth"
          : "upsSouth"
        : "mercator";
      const binding = bindingFor(projection, scheme);
      // A 400 × 400 px view centred on the box at ~100 px per box.
      binding.gridToMap(e + c.precision / 2, n + c.precision / 2, c.crsId, out);
      const [x, y] = out;
      const resolution = c.precision / 100 / metersPerPixel(binding, c.crsId, x, y, 1);
      const half = 200 * resolution;
      const plan = createLgrsRenderPlan({
        binding,
        extent: [x - half, y - half, x + half, y + half],
        resolution,
        gridSpacingMode: c.precision,
        gridLabelInterval: c.precision,
        labelsVisible: true,
      });
      const label = plan.labels.find(
        (l) => l.crs === c.crsId && l.node![0] === e && l.node![1] === n
      );
      expect(label, `${c.category} ${c.crsId} ${c.precision} ${e} ${n}`).toBeDefined();
      expect(label!.label!.acc, c.category).toBe(expected.replace(/ /g, ""));
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });
});
