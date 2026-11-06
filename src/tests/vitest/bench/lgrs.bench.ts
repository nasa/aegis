import { bench, describe } from "vitest";

import { formatLatLonAsLgrs } from "utils/lgrs/format";
import { createLgrsRenderPlan } from "utils/lgrs/grid/plan";
import { formatLgrsAtMapCoordinate, getLgrsMapAdapter } from "utils/lgrs/mapAdapter";

import { createSeededRandom } from "../helpers/seededRandom";

// Plan §6.1 budgets: lat/lon → 10 m string ≤ 2 µs median; map coord → string ≤ 5 µs median;
// a 1920×1080 dynamic grid plan ≤ 4 ms p95 and ≤ 2,000 vertices.

const MOON = "+a=1737400 +b=1737400 +units=m +no_defs";
const SAMPLE_COUNT = 1024;

function createMapSamples(
  adapter: LgrsMapAdapter,
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

const mercator = getLgrsMapAdapter({ projCode: "EPSG:3857", proj4Def: null });
const southCap = getLgrsMapAdapter({
  projCode: "BENCH:SOUTH",
  proj4Def: `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`,
});
const moonEqc = getLgrsMapAdapter({
  projCode: "BENCH:EQC",
  proj4Def: `+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 ${MOON}`,
});
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
});

const northCap = getLgrsMapAdapter({
  projCode: "BENCH:NORTH",
  proj4Def: `+proj=stere +lat_0=90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`,
});

/** Options for a 1920×1080 view centred on `[lat, lon]` at `resolution` map units per pixel. */
function screenView(
  adapter: LgrsMapAdapter,
  lat: number,
  lon: number,
  resolution: number,
  spacing: LgrsGridSpacing = "auto"
): LgrsRenderOptions {
  const centre = new Float64Array(2);
  adapter.latLonToMap(lat, lon, centre);
  return {
    adapter,
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

export { sink };
