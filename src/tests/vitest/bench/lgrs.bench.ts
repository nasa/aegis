import { bench, describe } from "vitest";

import { formatLgrsFromLatLon } from "utils/lgrs/display";
import { getEarthGridSystem } from "utils/lgrs/earth/system";
import { createLgrsRenderPlan } from "utils/lgrs/grid/plan";
import { getLgrsGridBinding } from "utils/lgrs/gridBinding";
import { formatLatLonAsLgrs, formatLgrsAtMapCoordinate } from "utils/lgrs/moon/format";
import { moonGridSystem } from "utils/lgrs/moon/system";

import { createSeededRandom } from "../helpers/seededRandom";

// Plan §6.1 budgets: lat/lon → 10 m string ≤ 2 µs median; map coord → string ≤ 5 µs median;
// a 1920×1080 dynamic grid plan ≤ 4 ms p95 and ≤ 2,000 vertices.

const MOON = "+a=1737400 +b=1737400 +units=m +no_defs";
const SAMPLE_COUNT = 1024;

function createMapSamples(
  adapter: LgrsGridBinding,
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number
): Float64Array {
  const random = createSeededRandom(42);
  const samples = new Float64Array(SAMPLE_COUNT * 2);
  const out = new Float64Array(2);
  for (let index = 0; index < SAMPLE_COUNT; index++) {
    adapter.latLonToMap(
      minLat + random() * (maxLat - minLat),
      minLon + random() * (maxLon - minLon),
      out
    );
    samples[index * 2] = out[0];
    samples[index * 2 + 1] = out[1];
  }
  return samples;
}

const random = createSeededRandom(7);
const latLons = new Float64Array(SAMPLE_COUNT * 2);
for (let index = 0; index < SAMPLE_COUNT; index++) {
  latLons[index * 2] = Math.asin(2 * random() - 1) * (180 / Math.PI);
  latLons[index * 2 + 1] = -180 + random() * 360;
}

const mercator = getLgrsGridBinding({ projCode: "EPSG:3857", proj4Def: null }, moonGridSystem);
const southCap = getLgrsGridBinding(
  {
    projCode: "BENCH:SOUTH",
    proj4Def: `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`,
  },
  moonGridSystem
);
const moonEqc = getLgrsGridBinding(
  {
    projCode: "BENCH:EQC",
    proj4Def: `+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 ${MOON}`,
  },
  moonGridSystem
);
const mercatorSamples = createMapSamples(mercator, -10, 10, -25, -10);
const southSamples = createMapSamples(southCap, -90, -84, -180, 180);
const eqcSamples = createMapSamples(moonEqc, -10, 10, -25, -10);

let cursor = 0;
let sink = 0;

function next(): number {
  cursor = (cursor + 1) % SAMPLE_COUNT;
  return cursor;
}

function consume(value: string | null): void {
  sink += value ? value.length : 0;
}

describe("LGRS per-point display", () => {
  bench("lat/lon → 10 m ACC (whole Moon)", () => {
    const index = next() * 2;
    consume(formatLatLonAsLgrs(latLons[index], latLons[index + 1], 10, "acc"));
  });

  bench("map coord → 10 m ACC, Web Mercator (closed form)", () => {
    const index = next() * 2;
    consume(
      formatLgrsAtMapCoordinate(
        mercator,
        mercatorSamples[index],
        mercatorSamples[index + 1],
        10,
        "acc"
      )
    );
  });

  bench("map coord → 10 m ACC, canonical south LPS (closed form)", () => {
    const index = next() * 2;
    consume(
      formatLgrsAtMapCoordinate(southCap, southSamples[index], southSamples[index + 1], 10, "acc")
    );
  });

  bench("map coord → 10 m ACC, equirectangular (cached proj4)", () => {
    const index = next() * 2;
    consume(
      formatLgrsAtMapCoordinate(moonEqc, eqcSamples[index], eqcSamples[index + 1], 10, "acc")
    );
  });

  const displayLatLon = new Float64Array(2);
  bench("map coord → 10 m full display via system, Web Mercator (readout path)", () => {
    const index = next() * 2;
    if (!mercator.mapToLatLon(mercatorSamples[index], mercatorSamples[index + 1], displayLatLon)) {
      return;
    }
    consume(
      formatLgrsFromLatLon(
        mercator.system,
        { lat: displayLatLon[0], lng: displayLatLon[1] },
        10,
        "full"
      )
    );
  });
});

const northCap = getLgrsGridBinding(
  {
    projCode: "BENCH:NORTH",
    proj4Def: `+proj=stere +lat_0=90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`,
  },
  moonGridSystem
);

/** Options for a 1920×1080 view centred on `[lat, lon]` at `resolution` map units per pixel. */
function screenView(
  adapter: LgrsGridBinding,
  lat: number,
  lon: number,
  resolution: number,
  spacing: LgrsGridSpacing = "auto"
): LgrsRenderOptions {
  const centre = new Float64Array(2);
  adapter.latLonToMap(lat, lon, centre);
  return {
    binding: adapter,
    extent: [
      centre[0] - 960 * resolution,
      centre[1] - 540 * resolution,
      centre[0] + 960 * resolution,
      centre[1] + 540 * resolution,
    ],
    resolution,
    gridSpacingMode: spacing,
    gridLabelInterval: spacing,
    labelsVisible: true,
  };
}

const planViews: [string, LgrsRenderOptions][] = [
  ["canonical south LPS, auto (affine)", screenView(southCap, -89.5, 30, 5)],
  ["south cap edge with LTM zones", screenView(southCap, -80.3, 30, 60)],
  ["north cap edge, ±80° seam", screenView(northCap, 80.2, -100, 60)],
  ["Apollo 14 Web Mercator, auto", screenView(mercator, -3.6, -17.5, 40)],
  ["zone seam + equator, equirectangular (proj4)", screenView(moonEqc, 0, -4, 80)],
  ["fixed 100 m, equirectangular (proj4)", screenView(moonEqc, 40, 4, 10, 100)],
  ["whole hemisphere zone tier (proj4)", screenView(moonEqc, 0, 0, 2500)],
];

function consumePlan(plan: LgrsRenderPlan): void {
  sink += plan.vertexCount;
}

describe("LGRS dynamic grid plan (1920×1080)", () => {
  for (const [name, options] of planViews) {
    bench(name, () => {
      consumePlan(createLgrsRenderPlan(options));
    });
  }
});

// Earth (plan §6): the same budgets, in both label schemes.

const earthAcc = getEarthGridSystem("lunar-acc");
const earthMgrs = getEarthGridSystem("mgrs");
const earthMercatorAcc = getLgrsGridBinding({ projCode: "EPSG:3857", proj4Def: null }, earthAcc);
const earthMercatorMgrs = getLgrsGridBinding({ projCode: "EPSG:3857", proj4Def: null }, earthMgrs);
const earthUtm15 = getLgrsGridBinding(
  { projCode: "EPSG:32615", proj4Def: "+proj=utm +zone=15 +datum=WGS84 +units=m +no_defs" },
  earthAcc
);
const earthUpsNorth = getLgrsGridBinding(
  {
    projCode: "EPSG:32661",
    proj4Def:
      "+proj=stere +lat_0=90 +lat_ts=90 +lon_0=0 +k=0.994 +x_0=2000000 +y_0=2000000 +datum=WGS84 +units=m +no_defs",
  },
  earthAcc
);
const jscSamples = createMapSamples(earthMercatorAcc, 29.3, 29.8, -95.4, -94.8);
const earthLatLon = new Float64Array(2);

describe("Earth per-point display", () => {
  bench("lat/lon → 10 m ACC full (whole Earth)", () => {
    const index = next() * 2;
    consume(earthAcc.formatPoint(latLons[index], latLons[index + 1], 10, "full"));
  });

  bench("lat/lon → 10 m MGRS full (whole Earth)", () => {
    const index = next() * 2;
    consume(earthMgrs.formatPoint(latLons[index], latLons[index + 1], 10, "full"));
  });

  bench("map coord → 10 m ACC full, EPSG:3857 (readout path)", () => {
    const index = next() * 2;
    if (!earthMercatorAcc.mapToLatLon(jscSamples[index], jscSamples[index + 1], earthLatLon)) {
      return;
    }
    consume(earthAcc.formatPoint(earthLatLon[0], earthLatLon[1], 10, "full"));
  });

  bench("map coord → 10 m MGRS full, EPSG:3857 (readout path)", () => {
    const index = next() * 2;
    if (!earthMercatorMgrs.mapToLatLon(jscSamples[index], jscSamples[index + 1], earthLatLon)) {
      return;
    }
    consume(earthMgrs.formatPoint(earthLatLon[0], earthLatLon[1], 10, "full"));
  });
});

const earthPlanViews: [string, LgrsRenderOptions][] = [
  ...(
    [
      ["ACC", earthMercatorAcc],
      ["MGRS", earthMercatorMgrs],
    ] as const
  ).flatMap(([scheme, binding]): [string, LgrsRenderOptions][] => [
    [`JSC ~5 km, ${scheme}, EPSG:3857`, screenView(binding, 29.5593, -95.09, 3)],
    [`JSC ~50 km, ${scheme}, EPSG:3857`, screenView(binding, 29.5593, -95.09, 30)],
    [`JSC ~200 km, ${scheme}, EPSG:3857`, screenView(binding, 29.5593, -95.09, 120)],
    [`JSC fixed 100 m, ${scheme}, EPSG:3857`, screenView(binding, 29.5593, -95.09, 2, 100)],
    [`Texas 14/15 seam, ${scheme}, EPSG:3857`, screenView(binding, 30, -96, 30)],
  ]),
  ["Norway 31V/32V, ACC, EPSG:3857", screenView(earthMercatorAcc, 60, 3, 60)],
  ["JSC ~50 km, ACC, UTM 15N map (affine)", screenView(earthUtm15, 29.5593, -95.09, 25)],
  ["84° N seam, ACC, UPS North map", screenView(earthUpsNorth, 84, 1, 25)],
];

describe("Earth dynamic grid plan (1920×1080)", () => {
  for (const [name, options] of earthPlanViews) {
    bench(name, () => {
      consumePlan(createLgrsRenderPlan(options));
    });
  }
});

export { sink };
