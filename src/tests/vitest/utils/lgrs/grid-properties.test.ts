import { coarsenForMinimap, createLgrsRenderPlan, LGRS_RENDER_CAPS } from "utils/lgrs/grid/plan";
import { getLgrsGridBinding } from "utils/lgrs/gridBinding";
import { getLtmFalseNorthing } from "utils/lgrs/moon/clip";
import {
  LPS_DOMAIN_RADIUS,
  LPS_FALSE_EASTING,
  LPS_FALSE_NORTHING,
} from "utils/lgrs/moon/constants";
import {
  classifyLatLon,
  getLtmCentralMeridian,
  getLtmCrsId,
  getLtmZone,
  isLpsCrs,
  isSouthCrs,
  LGRS_CRS_LPS_NORTH,
  LGRS_CRS_LPS_SOUTH,
} from "utils/lgrs/moon/crs";
import { formatLgrsLabel } from "utils/lgrs/moon/format";
import { unprojectToLatLon } from "utils/lgrs/moon/projection";
import { moonGridSystem } from "utils/lgrs/moon/system";

const MOON = "+a=1737400 +b=1737400 +units=m +no_defs";
const PROJECTIONS: Record<string, string | null> = {
  south: `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`,
  north: `+proj=stere +lat_0=90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`,
  mercator: null,
  eqc: `+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 ${MOON}`,
  eqc180: `+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=180 +x_0=0 +y_0=0 ${MOON}`,
  tm23: `+proj=tmerc +approx +lat_0=0 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`,
};

function adapterFor(projection: string): LgrsGridBinding {
  return projection === "mercator"
    ? getLgrsGridBinding({ projCode: "EPSG:3857", proj4Def: null }, moonGridSystem)
    : getLgrsGridBinding(
        { projCode: `TEST:${projection}`, proj4Def: PROJECTIONS[projection] },
        moonGridSystem
      );
}

type Viewport = {
  name: string;
  projection: string;
  lat: number;
  lon: number;
  /** Map units per pixel. */
  resolution: number;
  spacing?: LgrsGridSpacing;
  labels?: LgrsGridSpacing;
  tier: LgrsRenderTier;
  /** Regions the plan must draw. */
  regions?: LgrsCrsId[];
};

const VIEWPORTS: Viewport[] = [
  { name: "south pole", projection: "south", lat: -89.9, lon: 0, resolution: 5, tier: "box" },
  { name: "south cap edge", projection: "south", lat: -80.3, lon: 30, resolution: 60, tier: "box" },
  { name: "north pole", projection: "north", lat: 89.95, lon: 0, resolution: 2, tier: "box" },
  {
    name: "north cap edge (±80° seam)",
    projection: "north",
    lat: 80.2,
    lon: -100,
    resolution: 60,
    tier: "box",
    regions: [LGRS_CRS_LPS_NORTH, getLtmCrsId(10, "N"), getLtmCrsId(11, "N")],
  },
  {
    name: "Apollo 14 Web Mercator",
    projection: "mercator",
    lat: -3.6,
    lon: -17.5,
    resolution: 40,
    tier: "box",
    regions: [getLtmCrsId(21, "S")],
  },
  {
    name: "Apollo 14 equirectangular",
    projection: "eqc",
    lat: -3.6,
    lon: -17.5,
    resolution: 5,
    tier: "box",
    regions: [getLtmCrsId(21, "S")],
  },
  {
    name: "TM on an LTM central meridian (affine)",
    projection: "tm23",
    lat: 20,
    lon: 3,
    resolution: 60,
    tier: "box",
    regions: [getLtmCrsId(23, "N"), getLtmCrsId(24, "N")],
  },
  {
    name: "zone seam",
    projection: "mercator",
    lat: -3.6,
    lon: -20,
    resolution: 300,
    tier: "box",
    regions: [getLtmCrsId(20, "S"), getLtmCrsId(21, "S")],
  },
  {
    name: "equator crossing",
    projection: "mercator",
    lat: 0.05,
    lon: -17.5,
    resolution: 300,
    tier: "box",
    regions: [20, 21].flatMap((zone) => [getLtmCrsId(zone, "N"), getLtmCrsId(zone, "S")]),
  },
  {
    name: "equator and zone seam",
    projection: "eqc",
    lat: 0,
    lon: -4,
    resolution: 80,
    tier: "box",
    regions: [22, 23].flatMap((zone) => [getLtmCrsId(zone, "N"), getLtmCrsId(zone, "S")]),
  },
  {
    name: "±80° seam, equirectangular",
    projection: "eqc",
    lat: 79.8,
    lon: 30,
    resolution: 80,
    tier: "box",
    regions: [LGRS_CRS_LPS_NORTH, getLtmCrsId(26, "N"), getLtmCrsId(27, "N")],
  },
  {
    name: "antimeridian",
    projection: "eqc180",
    lat: 10,
    lon: 180,
    resolution: 60,
    tier: "box",
    regions: [getLtmCrsId(45, "N"), getLtmCrsId(1, "N")],
  },
  ...["mercator", "eqc"].flatMap((projection) =>
    [179.9, -179.9].map((lon) => ({
      name: `antimeridian ${projection} at ${lon}`,
      projection,
      lat: 10,
      lon,
      resolution: projection === "mercator" ? 100 : 30,
      tier: "box" as const,
      regions: [getLtmCrsId(45, "N"), getLtmCrsId(1, "N")],
    }))
  ),
  {
    name: "fixed 10 m on a 10 m/px view (falls back)",
    projection: "eqc",
    lat: 40,
    lon: 4,
    resolution: 10,
    spacing: 10,
    labels: 10,
    tier: "box",
  },
  {
    name: "fixed 1 km at 30 m/px",
    projection: "eqc",
    lat: 40,
    lon: 4,
    resolution: 30,
    spacing: 1000,
    labels: 1000,
    tier: "box",
  },
  {
    name: "fixed 100 m, south pole",
    projection: "south",
    lat: -89.5,
    lon: 45,
    resolution: 2,
    spacing: 100,
    labels: "auto",
    tier: "box",
  },
  { name: "whole hemisphere", projection: "eqc", lat: 0, lon: 0, resolution: 2500, tier: "zone" },
  { name: "whole north cap", projection: "north", lat: 90, lon: 0, resolution: 400, tier: "zone" },
];

const WIDTH = 1920;
const HEIGHT = 1080;
const out = new Float64Array(2);
const other = new Float64Array(2);
const latLon = new Float64Array(2);

function buildPlan(viewport: Viewport) {
  const adapter = adapterFor(viewport.projection);
  expect(adapter.latLonToMap(viewport.lat, viewport.lon, out)).toBe(true);
  const r = viewport.resolution;
  const extent: LgrsMapExtent = [
    out[0] - (WIDTH / 2) * r,
    out[1] - (HEIGHT / 2) * r,
    out[0] + (WIDTH / 2) * r,
    out[1] + (HEIGHT / 2) * r,
  ];
  const plan = createLgrsRenderPlan({
    binding: adapter,
    extent,
    resolution: r,
    gridSpacingMode: viewport.spacing ?? "auto",
    gridLabelInterval: viewport.labels ?? "auto",
    labelsVisible: true,
  });
  return { adapter, extent, plan };
}

/** Largest LGRS metres per map pixel of `crs` at map coordinate `[x, y]` (x or y direction). */
function metersPerPixel(adapter: LgrsGridBinding, crs: LgrsCrsId, x: number, y: number, r: number) {
  adapter.mapToGrid(x, y, crs, out);
  const e = out[0];
  const n = out[1];
  adapter.mapToGrid(x + r, y, crs, other);
  const dx = Math.hypot(other[0] - e, other[1] - n);
  adapter.mapToGrid(x, y + r, crs, other);
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

/** Signed offsets of `[lat, lon]` from the region boundaries; ≥ −tolerance means inside. */
function regionOffsets(crs: LgrsCrsId, lat: number, lon: number): number[] {
  if (crs === LGRS_CRS_LPS_SOUTH) return [-80 - lat];
  if (crs === LGRS_CRS_LPS_NORTH) return [lat - 80];
  let delta = lon - getLtmCentralMeridian(getLtmZone(crs));
  if (delta < -180) delta += 360;
  if (delta >= 180) delta -= 360;
  const hemisphere = isSouthCrs(crs) ? -lat : lat;
  return [4 - Math.abs(delta), 80 - Math.abs(lat), hemisphere];
}

function isOnRegionBoundary(crs: LgrsCrsId, e: number, n: number): boolean {
  if (isLpsCrs(crs)) {
    return (
      Math.abs(Math.hypot(e - LPS_FALSE_EASTING, n - LPS_FALSE_NORTHING) - LPS_DOMAIN_RADIUS) < 1e-3
    );
  }
  if (Math.abs(n - getLtmFalseNorthing(crs)) < 1e-6) return true;
  unprojectToLatLon(e, n, crs, latLon);
  return regionOffsets(crs, latLon[0], latLon[1]).some((offset) => Math.abs(offset) < 1e-7);
}

describe.each(VIEWPORTS)("createLgrsRenderPlan: $name", (viewport) => {
  const { adapter, extent, plan } = buildPlan(viewport);
  const gridLines = plan.lines.filter((line) => line.kind === "grid" && line.crs >= 0);

  test("uses the expected tier and regions", () => {
    expect(plan.tier).toBe(viewport.tier);
    if (viewport.regions) expect([...plan.regions].sort()).toEqual([...viewport.regions].sort());
    if (viewport.tier === "box") expect(gridLines.length).toBeGreaterThan(0);
  });

  test("respects the caps", () => {
    expect(plan.lines.length).toBeLessThanOrEqual(LGRS_RENDER_CAPS.maxLines);
    expect(plan.labels.length).toBeLessThanOrEqual(LGRS_RENDER_CAPS.maxLabels);
    expect(plan.vertexCount).toBeLessThanOrEqual(LGRS_RENDER_CAPS.maxVertices);
    const vertices = plan.lines.reduce((sum, line) => sum + line.coordinates.length / 2, 0);
    expect(plan.vertexCount).toBe(vertices);
    expect(plan.lines.every((line) => line.coordinates.length >= 4)).toBe(true);
  });

  test("draws every region at the view-centre spacing", () => {
    if (plan.tier !== "box") return;
    for (const line of gridLines) {
      expect(
        Math.abs(line.value / plan.lineSpacing - Math.round(line.value / plan.lineSpacing))
      ).toBeLessThan(1e-9);
    }
  });

  test("puts every densified vertex on its constant-E/N line, inside its region", () => {
    for (const line of gridLines) {
      const index = line.axis === "easting" ? 0 : 1;
      for (let i = 0; i < line.coordinates.length; i += 2) {
        const x = line.coordinates[i];
        const y = line.coordinates[i + 1];
        const tolerance = 0.5 * metersPerPixel(adapter, line.crs, x, y, viewport.resolution) + 1e-6;
        expect(adapter.mapToGrid(x, y, line.crs, out)).toBe(true);
        expect(
          Math.abs(out[index] - line.value),
          `${line.crs} ${line.axis} ${line.value}`
        ).toBeLessThanOrEqual(tolerance);

        expect(adapter.mapToLatLon(x, y, latLon)).toBe(true);
        const slackDegrees = (tolerance / 1737400) * (180 / Math.PI) * 4 + 1e-7;
        for (const offset of regionOffsets(line.crs, latLon[0], latLon[1])) {
          expect(offset, `${line.crs} ${line.axis} ${line.value}`).toBeGreaterThanOrEqual(
            -slackDegrees
          );
        }
      }
    }
  });

  test("ends every line on the view edge or its region boundary", () => {
    for (const line of gridLines) {
      const last = line.coordinates.length - 2;
      for (const i of [0, last]) {
        const x = line.coordinates[i];
        const y = line.coordinates[i + 1];
        if (onExtentEdge(x, y, extent)) continue;
        adapter.mapToGrid(x, y, line.crs, out);
        const e = line.axis === "easting" ? line.value : out[0];
        const n = line.axis === "northing" ? line.value : out[1];
        expect(isOnRegionBoundary(line.crs, e, n), `${line.crs} ${line.axis} ${line.value}`).toBe(
          true
        );
      }
    }
  });

  test("labels each node with the library label of the box at that node, inside the view", () => {
    for (const label of plan.labels) {
      expect(label.coordinate[0]).toBeGreaterThanOrEqual(extent[0] - 1e-6);
      expect(label.coordinate[0]).toBeLessThanOrEqual(extent[2] + 1e-6);
      expect(label.coordinate[1]).toBeGreaterThanOrEqual(extent[1] - 1e-6);
      expect(label.coordinate[1]).toBeLessThanOrEqual(extent[3] + 1e-6);
      if (plan.tier === "zone") {
        expect(label.text).toMatch(/^(\d{1,2}[C-HJ-NP-X]|[ABYZ])$/);
        continue;
      }
      const [e, n] = label.node!;
      const expected = formatLgrsLabel(e, n, label.crs, label.label!.precision);
      expect(label.label).toEqual(expected);
      expect(label.text).toBe(expected.text);
      expect(label.label!.lowerLeft).toEqual([e, n]);
      expect(e % plan.labelSpacing).toBe(0);
      expect(n % plan.labelSpacing).toBe(0);
      adapter.mapToGrid(label.coordinate[0], label.coordinate[1], label.crs, out);
      expect(Math.abs(out[0] - e) + Math.abs(out[1] - n)).toBeLessThan(1e-3);
      unprojectToLatLon(e, n, label.crs, latLon);
      expect(classifyLatLon(latLon[0], latLon[1])).toBe(label.crs);
    }
  });
});

describe("createLgrsRenderPlan caps and tiers", () => {
  test.each([179.9, -179.9])("wraps zone-tier seams and labels at longitude %s", (lon) => {
    const { plan } = buildPlan({
      name: "wrapped zone framework",
      projection: "mercator",
      lat: 10,
      lon,
      resolution: 10000,
      tier: "zone",
    });
    expect(plan.tier).toBe("zone");
    expect(plan.labels.map((label) => label.text)).toEqual(expect.arrayContaining(["1P", "45P"]));
    const seam = plan.lines.filter((line) => line.axis === "meridian" && line.value === -180);
    expect(seam.length).toBeGreaterThan(0);
    const expectedX = Math.sign(lon) * Math.PI * 6378137;
    for (const line of seam) {
      for (let i = 0; i < line.coordinates.length; i += 2) {
        expect(line.coordinates[i]).toBeCloseTo(expectedX, 6);
      }
    }
  });

  test("a fixed 10 m grid that would exceed the caps falls back to a coarser spacing", () => {
    const { plan } = buildPlan(VIEWPORTS.find((v) => v.spacing === 10));
    expect(plan.capped).toBe(true);
    expect(plan.lineSpacing).toBe(100);
    expect(plan.vertexCount).toBeLessThanOrEqual(LGRS_RENDER_CAPS.maxVertices);
  });

  test("explicit caps coarsen lines and labels instead of truncating them", () => {
    const viewport = { ...VIEWPORTS.find((v) => v.name === "Apollo 14 Web Mercator") };
    viewport.resolution = 10;
    const { adapter, extent } = buildPlan(viewport);
    const options: LgrsRenderOptions = {
      binding: adapter,
      extent,
      resolution: viewport.resolution,
      gridSpacingMode: 100,
      gridLabelInterval: 100,
      labelsVisible: true,
    };
    const full = createLgrsRenderPlan({ ...options, caps: { maxLabels: 10_000 } });
    expect(full.capped).toBe(false);
    expect(full.lineSpacing).toBe(100);

    const fewerLabels = createLgrsRenderPlan({ ...options, caps: { maxLabels: 50 } });
    expect(fewerLabels.capped).toBe(true);
    expect(fewerLabels.lineSpacing).toBe(100);
    expect(fewerLabels.labelSpacing).toBeGreaterThan(100);
    expect(fewerLabels.labels.length).toBeLessThanOrEqual(50);

    const fewerLines = createLgrsRenderPlan({ ...options, caps: { maxLines: 20 } });
    expect(fewerLines.capped).toBe(true);
    expect(fewerLines.lineSpacing).toBe(1000);
    expect(fewerLines.lines.length).toBeLessThanOrEqual(20);

    // A ~200 km view where even 25 km lines exceed the line cap.
    const wide = buildPlan({ ...viewport, resolution: 400 });
    const zone = createLgrsRenderPlan({
      ...options,
      extent: wide.extent,
      resolution: 400,
      caps: { maxLines: 8 },
    });
    expect(zone.tier).toBe("zone");
    expect(zone.capped).toBe(true);
    expect(zone.lines.length).toBeLessThanOrEqual(8);
  });

  test("labels stay hidden with a fixed spacing and auto labels once they would overlap", () => {
    const { plan } = buildPlan({ ...VIEWPORTS[0], resolution: 5, spacing: 100, labels: "auto" });
    expect(plan.lineSpacing).toBe(100);
    expect(plan.labels).toEqual([]);
  });

  test("an off-screen or degenerate view yields an empty plan", () => {
    const adapter = adapterFor("eqc");
    const empty = createLgrsRenderPlan({
      binding: adapter,
      extent: [1e9, 1e9, 1e9 + 1000, 1e9 + 1000],
      resolution: 1,
      gridSpacingMode: "auto",
      gridLabelInterval: "auto",
      labelsVisible: true,
    });
    expect(empty.tier).toBe("none");
    const degenerate = createLgrsRenderPlan({
      binding: adapter,
      extent: [0, 0, 0, 0],
      resolution: 1,
      gridSpacingMode: "auto",
      gridLabelInterval: "auto",
      labelsVisible: true,
    });
    expect(degenerate.tier).toBe("none");
  });

  test("a minimap coarsens the inherited spacing per region to ≥ 3 px", () => {
    // A 300 × 300 px minimap over the Apollo 14 site.
    const adapter = adapterFor("mercator");
    adapter.latLonToMap(-3.6, -17.5, out);
    const resolution = 40;
    const half = 150 * resolution;
    const extent: LgrsMapExtent = [out[0] - half, out[1] - half, out[0] + half, out[1] + half];
    const plan = createLgrsRenderPlan({
      binding: adapter,
      extent,
      resolution,
      gridSpacingMode: "auto",
      gridLabelInterval: "auto",
      labelsVisible: false,
      inheritedSpacing: { line: 10, label: 20 },
    });
    expect(plan.capped).toBe(false);
    expect(plan.lineSpacing).toBe(40);
    const mpp = metersPerPixel(adapter, getLtmCrsId(21, "S"), out[0], out[1], resolution);
    expect(plan.lineSpacing / mpp).toBeGreaterThanOrEqual(3);
    expect(plan.lineSpacing / 2 / mpp).toBeLessThan(3);
    expect(plan.labels).toEqual([]);
  });
});

describe("coarsenForMinimap", () => {
  test("doubles until lines are at least 3 px apart", () => {
    expect(coarsenForMinimap(10, 1)).toBe(10);
    expect(coarsenForMinimap(10, 4)).toBe(20);
    expect(coarsenForMinimap(10, 40)).toBe(160);
    expect(coarsenForMinimap(10, NaN)).toBe(10);
  });
});
