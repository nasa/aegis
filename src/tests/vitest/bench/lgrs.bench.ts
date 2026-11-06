import { bench, describe } from "vitest";

import { formatLatLonAsLgrs } from "utils/lgrs/format";
import { formatLgrsAtMapCoordinate, getLgrsMapAdapter } from "utils/lgrs/mapAdapter";

import { createSeededRandom } from "../helpers/seededRandom";

// Plan §6.1 budgets: lat/lon → 10 m string ≤ 2 µs median; map coord → string ≤ 5 µs median.

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

export { sink };
