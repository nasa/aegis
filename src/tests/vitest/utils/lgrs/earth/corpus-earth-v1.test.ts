import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  formatEarthAcc,
  formatEarthAccBoxLabel,
  formatEarthAccFromLatLon,
} from "utils/lgrs/earth/acc";
import { EARTH_ACC_PRECISIONS, EARTH_MGRS_PRECISIONS } from "utils/lgrs/earth/constants";
import { formatCanonicalMgrs, formatMgrs, formatMgrsBoxLabel } from "utils/lgrs/earth/mgrs";
import { projectEarthLatLon, unprojectEarthToLatLon } from "utils/lgrs/earth/projection";
import {
  classifyEarthLatLon,
  conformEarthLongitude,
  getEarthLatitudeBandLetter,
  getUtmZone,
  isSouthEarthCrs,
  isUpsCrs,
} from "utils/lgrs/earth/zones";

// Fixtures come from `npm run lgrs:reference-corpus-earth`; see the fixture README.

type AccPair = { condensed: string; full: string };

type Labels = {
  band: string;
  square: string;
  accPrefix: string;
  acc: Record<string, AccPair>;
  mgrs: Record<string, string>;
};

type ExpectedCrs = {
  crsId: LgrsCrsId;
  system: "UTM" | "UPS";
  zone: number | null;
  hemisphere: LgrsHemisphere;
};

type ClassificationCase = {
  category: string;
  latitude: number;
  longitude: number;
  expected: (ExpectedCrs & { band: string | null; conformedLongitude: number }) | null;
};

type ProjectionCase = {
  category: string;
  latitude: number;
  longitude: number;
  crsId: LgrsCrsId;
  inRegion: boolean;
  expected: {
    easting: number;
    northing: number;
    inverseLatitude: number;
    inverseLongitude: number;
  };
};

type PointFormatCase = {
  category: string;
  linePrecision?: number;
  crsId: LgrsCrsId;
  easting: number;
  northing: number;
  latitude: number;
  inRegion: boolean;
  expected: Labels;
};

type BoxCase = {
  category: string;
  crsId: LgrsCrsId;
  precision: EarthGridPrecision;
  lowerLeft: [number, number];
  centreLatitude: number;
  centreInRegion: boolean;
  expected: { band: string; acc: AccPair | null; mgrs: string | null };
};

type EndToEndCase = {
  category: string;
  linePrecision?: number;
  latitude: number;
  longitude: number;
  expected: ExpectedCrs &
    Labels & {
      easting: number;
      northing: number;
      boundaryDistance: Record<string, number>;
    };
};

const PROJECTION_TOLERANCE_METERS = 1e-6;
/**
 * Inverse tolerance as ground distance: the lat/lon error is scaled to metres on a sphere of
 * radius a (Δlat·a, Δlon·a·cos lat), so 1 µm is about 9e-12° of latitude and the longitude
 * tolerance widens toward the poles, where longitude is undefined at ±90°.
 */
const INVERSE_TOLERANCE_METERS = 1e-6;
const WGS84_A = 6378137;
const DEG_TO_RAD = Math.PI / 180;
/** §8.3: end-to-end strings are exact only this far from every box line at their precision. */
const END_TO_END_EXACT_DISTANCE_METERS = 1e-5;
/** Shift used to build the two labels either side of a near line (≫ projection error). */
const ADJACENT_SHIFT_METERS = 2e-5;
const SHIFTS = [-ADJACENT_SHIFT_METERS, ADJACENT_SHIFT_METERS];
const STYLES: LgrsDisplayStyle[] = ["condensed", "full"];
const SHOWN_MISMATCHES = 10;

function loadFixture<T>(filename: string): T {
  const path = resolve(process.cwd(), "src/tests/vitest/fixtures/lgrs-earth/v1", filename);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const metadata = loadFixture<{ fixtureVersion: string; seed: number }>("metadata.json");
const classificationCases = loadFixture<{ cases: ClassificationCase[] }>(
  "classification.json"
).cases;
const projectionCases = loadFixture<{ cases: ProjectionCase[] }>("projection.json").cases;
const pointCases = loadFixture<{ cases: PointFormatCase[] }>("format-points.json").cases;
const boxCases = loadFixture<{ cases: BoxCase[] }>("format-boxes.json").cases;
const endToEndCases = loadFixture<{ cases: EndToEndCase[] }>("end-to-end.json").cases;

class Mismatches {
  private readonly messages: string[] = [];

  constructor(private readonly name: string) {}

  add(message: string): void {
    this.messages.push(message);
  }

  assertNone(): void {
    const shown = this.messages.slice(0, SHOWN_MISMATCHES).join("\n  ");
    const more =
      this.messages.length > SHOWN_MISMATCHES
        ? `\n  … and ${this.messages.length - SHOWN_MISMATCHES} more`
        : "";
    expect(
      this.messages.length,
      `${this.name}: ${this.messages.length} mismatches\n  ${shown}${more}`
    ).toBe(0);
  }
}

function show(value: unknown): string {
  return JSON.stringify(value);
}

function latLonId(
  index: number,
  testCase: { category: string; latitude: number; longitude: number }
) {
  return `#${index} [${testCase.category}] lat=${testCase.latitude} lon=${testCase.longitude}`;
}

function projectedId(index: number, testCase: PointFormatCase): string {
  const { category, crsId, easting, northing } = testCase;
  return `#${index} [${category}] crs=${crsId} E=${easting} N=${northing}`;
}

function boxId(index: number, testCase: BoxCase): string {
  const { category, crsId, lowerLeft, precision } = testCase;
  return `#${index} [${category}] crs=${crsId} lowerLeft=${show(lowerLeft)} p=${precision}`;
}

function angleDifference(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180);
}

/** Ground distance (metres) between two lat/lon, small-angle, on a sphere of radius a. */
function groundError(lat: number, lon: number, refLat: number, refLon: number): number {
  const dLat = (lat - refLat) * DEG_TO_RAD * WGS84_A;
  const dLon = angleDifference(lon, refLon) * DEG_TO_RAD * WGS84_A * Math.cos(refLat * DEG_TO_RAD);
  return Math.hypot(dLat, dLon);
}

function checkCrs(
  id: string,
  crs: LgrsCrsId,
  expected: ExpectedCrs,
  mismatches: Mismatches
): boolean {
  const actual: ExpectedCrs = {
    crsId: crs,
    system: isUpsCrs(crs) ? "UPS" : "UTM",
    zone: isUpsCrs(crs) ? null : getUtmZone(crs),
    hemisphere: isSouthEarthCrs(crs) ? "S" : "N",
  };
  const ok =
    actual.crsId === expected.crsId &&
    actual.system === expected.system &&
    actual.zone === expected.zone &&
    actual.hemisphere === expected.hemisphere;
  if (!ok) {
    const { crsId, system, zone, hemisphere } = expected;
    mismatches.add(`${id}: ${show(actual)}, expected ${show({ crsId, system, zone, hemisphere })}`);
  }
  return ok;
}

/** Every ACC and MGRS string of a point, keyed `acc:<p>:<style>` / `mgrs:<p>`. */
function formatPointLabels(
  crs: LgrsCrsId,
  e: number,
  n: number,
  lat: number
): Map<string, string | null> {
  const labels = new Map<string, string | null>();
  for (const precision of EARTH_ACC_PRECISIONS) {
    for (const style of STYLES) {
      labels.set(`acc:${precision}:${style}`, formatEarthAcc(crs, e, n, lat, precision, style));
    }
  }
  for (const precision of EARTH_MGRS_PRECISIONS) {
    labels.set(`mgrs:${precision}`, formatMgrs(crs, e, n, lat, precision));
  }
  return labels;
}

function expectedPointLabels(expected: Labels): Map<string, string> {
  const labels = new Map<string, string>();
  for (const precision of EARTH_ACC_PRECISIONS) {
    for (const style of STYLES) {
      labels.set(`acc:${precision}:${style}`, expected.acc[String(precision)][style]);
    }
  }
  for (const precision of EARTH_MGRS_PRECISIONS) {
    labels.set(`mgrs:${precision}`, expected.mgrs[String(precision)]);
  }
  return labels;
}

function labelPrecision(key: string): number {
  return Number(key.split(":")[1]);
}

describe("Earth grid reference corpus v1", () => {
  it("pins fixture v1", () => {
    expect(metadata).toMatchObject({ fixtureVersion: "v1", seed: 5002026 });
  });

  it("(a) classifies every lat/lon exactly", () => {
    const mismatches = new Mismatches("classification");
    classificationCases.forEach((testCase, index) => {
      const { latitude, longitude, expected } = testCase;
      const id = latLonId(index, testCase);
      const crs = classifyEarthLatLon(latitude, longitude);
      if (!expected) {
        if (crs !== -1) mismatches.add(`${id}: crs ${crs}, expected invalid`);
        return;
      }
      if (!checkCrs(id, crs, expected, mismatches)) return;
      const band = isUpsCrs(crs) ? null : getEarthLatitudeBandLetter(latitude);
      if (band !== expected.band) {
        mismatches.add(`${id}: band ${show(band)}, expected ${show(expected.band)}`);
      }
      const conformed = conformEarthLongitude(longitude);
      if (!Object.is(conformed, expected.conformedLongitude)) {
        mismatches.add(`${id}: lon ${conformed}, expected ${expected.conformedLongitude}`);
      }
    });
    expect(classificationCases.length).toBeGreaterThan(2000);
    mismatches.assertNone();
  });

  describe("(b) projection", () => {
    it("projects lat/lon to within 1 µm of pyproj", () => {
      const mismatches = new Mismatches("projection forward");
      const out = new Float64Array(2);
      projectionCases.forEach((testCase, index) => {
        const { latitude, longitude, crsId, expected } = testCase;
        const id = `${latLonId(index, testCase)} crs=${crsId}`;
        if (!projectEarthLatLon(latitude, longitude, crsId, out)) {
          mismatches.add(`${id}: projectEarthLatLon returned false`);
          return;
        }
        const dE = Math.abs(out[0] - expected.easting);
        const dN = Math.abs(out[1] - expected.northing);
        if (!(dE <= PROJECTION_TOLERANCE_METERS && dN <= PROJECTION_TOLERANCE_METERS)) {
          mismatches.add(`${id}: |dE|=${dE} |dN|=${dN}`);
        }
      });
      mismatches.assertNone();
    });

    it("inverts pyproj E/N to within 1 µm of pyproj's lat/lon", () => {
      const mismatches = new Mismatches("projection inverse");
      const out = new Float64Array(2);
      projectionCases.forEach((testCase, index) => {
        const { crsId, expected } = testCase;
        const id = `${latLonId(index, testCase)} crs=${crsId}`;
        if (!unprojectEarthToLatLon(expected.easting, expected.northing, crsId, out)) {
          mismatches.add(`${id}: unprojectEarthToLatLon returned false`);
          return;
        }
        const error = groundError(
          out[0],
          out[1],
          expected.inverseLatitude,
          expected.inverseLongitude
        );
        if (!(error <= INVERSE_TOLERANCE_METERS)) {
          mismatches.add(
            `${id}: inverse ${out[0]}, ${out[1]}, expected ${expected.inverseLatitude}, ` +
              `${expected.inverseLongitude} (${error} m)`
          );
        }
      });
      mismatches.assertNone();
    });

    it("round-trips pyproj E/N through lat/lon to within 1 µm", () => {
      const mismatches = new Mismatches("projection round trip");
      const latLon = new Float64Array(2);
      const back = new Float64Array(2);
      projectionCases.forEach((testCase, index) => {
        const { crsId, expected } = testCase;
        const id = `${latLonId(index, testCase)} crs=${crsId}`;
        if (
          !unprojectEarthToLatLon(expected.easting, expected.northing, crsId, latLon) ||
          !projectEarthLatLon(latLon[0], latLon[1], crsId, back)
        ) {
          mismatches.add(`${id}: round trip returned false`);
          return;
        }
        const dE = Math.abs(back[0] - expected.easting);
        const dN = Math.abs(back[1] - expected.northing);
        if (!(dE <= PROJECTION_TOLERANCE_METERS && dN <= PROJECTION_TOLERANCE_METERS)) {
          mismatches.add(`${id}: round trip |dE|=${dE} |dN|=${dN}`);
        }
      });
      mismatches.assertNone();
    });
  });

  describe("(c) formatting from E/N", () => {
    it("formats every point label exactly", () => {
      const mismatches = new Mismatches("format-points");
      pointCases.forEach((testCase, index) => {
        const { crsId, easting, northing, latitude, expected } = testCase;
        const actual = formatPointLabels(crsId, easting, northing, latitude);
        for (const [key, value] of expectedPointLabels(expected)) {
          if (actual.get(key) !== value) {
            mismatches.add(
              `${projectedId(index, testCase)} ${key}: ${show(actual.get(key))}, expected ${value}`
            );
          }
        }
      });
      expect(pointCases.length).toBeGreaterThan(2000);
      mismatches.assertNone();
    });

    it("formats every box label exactly from the crs and lower-left", () => {
      const mismatches = new Mismatches("format-boxes");
      boxCases.forEach((testCase, index) => {
        const { crsId, lowerLeft, precision, expected } = testCase;
        const id = boxId(index, testCase);
        const acc = EARTH_ACC_PRECISIONS.includes(precision as EarthAccPrecision)
          ? formatEarthAccBoxLabel(
              crsId,
              lowerLeft[0],
              lowerLeft[1],
              precision as EarthAccPrecision
            )
          : null;
        const actualAcc = acc && {
          condensed: acc.text,
          full: precision === 25000 ? acc.prefix : `${acc.prefix} ${acc.text}`,
        };
        if (show(actualAcc) !== show(expected.acc)) {
          mismatches.add(`${id} acc: ${show(actualAcc)}, expected ${show(expected.acc)}`);
        }
        if (acc && acc.acc !== expected.acc?.full.replace(/ /g, "")) {
          mismatches.add(`${id} compact acc: ${acc.acc}, expected ${expected.acc?.full}`);
        }
        const mgrs = EARTH_MGRS_PRECISIONS.includes(precision as EarthMgrsPrecision)
          ? formatMgrsBoxLabel(crsId, lowerLeft[0], lowerLeft[1], precision as EarthMgrsPrecision)
          : null;
        // `prefix` is `<zone><band><square>`; the spaced MGRS form splits off the square.
        const actualMgrs =
          mgrs &&
          [
            mgrs.prefix.slice(0, -2),
            mgrs.prefix.slice(-2),
            ...(mgrs.condensed ? [mgrs.text] : []),
          ].join(" ");
        if (actualMgrs !== expected.mgrs) {
          mismatches.add(`${id} mgrs: ${show(actualMgrs)}, expected ${show(expected.mgrs)}`);
        }
        if (mgrs && mgrs.lgrs !== expected.mgrs?.replace(/ /g, "")) {
          mismatches.add(`${id} compact mgrs: ${mgrs.lgrs}, expected ${expected.mgrs}`);
        }
        // The band precedes the square (MGRS) or the square and sub-area (ACC) in UTM prefixes.
        const bands = [
          acc && (isUpsCrs(crsId) ? acc.prefix[0] : acc.prefix.slice(-5, -4)),
          mgrs && (isUpsCrs(crsId) ? mgrs.prefix[0] : mgrs.prefix.slice(-3, -2)),
        ].filter((band) => band !== null);
        if (bands.some((band) => band !== expected.band)) {
          mismatches.add(`${id} band: ${show(bands)}, expected ${expected.band}`);
        }
      });
      expect(boxCases.length).toBeGreaterThan(1000);
      mismatches.assertNone();
    });
  });

  it("(d) formats lat/lon end to end, exact away from box lines", () => {
    const mismatches = new Mismatches("end-to-end");
    const out = new Float64Array(2);
    let checkedStrings = 0;
    let nearBoundaryStrings = 0;
    const nearBoundaryCases = new Set<number>();
    endToEndCases.forEach((testCase, index) => {
      const { latitude, longitude, expected } = testCase;
      const id = latLonId(index, testCase);
      const crs = classifyEarthLatLon(latitude, longitude);
      if (!checkCrs(id, crs, expected, mismatches)) return;
      if (!projectEarthLatLon(latitude, longitude, crs, out)) {
        mismatches.add(`${id}: projectEarthLatLon returned false`);
        return;
      }
      const dE = Math.abs(out[0] - expected.easting);
      const dN = Math.abs(out[1] - expected.northing);
      if (!(dE <= PROJECTION_TOLERANCE_METERS && dN <= PROJECTION_TOLERANCE_METERS)) {
        mismatches.add(`${id}: |dE|=${dE} |dN|=${dN}`);
      }

      const actual = new Map<string, string | null>();
      for (const precision of EARTH_ACC_PRECISIONS) {
        for (const style of STYLES) {
          actual.set(
            `acc:${precision}:${style}`,
            formatEarthAccFromLatLon(latitude, longitude, precision, style)
          );
        }
      }
      for (const precision of EARTH_MGRS_PRECISIONS) {
        actual.set(`mgrs:${precision}`, formatCanonicalMgrs(latitude, longitude, precision));
      }

      // The labels either side of a near line, from the oracle E/N through the E/N path.
      let adjacent: Map<string, string | null>[] | null = null;
      for (const [key, value] of expectedPointLabels(expected)) {
        checkedStrings++;
        const actualValue = actual.get(key);
        const distance = expected.boundaryDistance[String(labelPrecision(key))];
        if (distance >= END_TO_END_EXACT_DISTANCE_METERS) {
          if (actualValue !== value) {
            mismatches.add(`${id} ${key}: ${show(actualValue)}, expected ${value}`);
          }
          continue;
        }
        nearBoundaryStrings++;
        nearBoundaryCases.add(index);
        adjacent ??= SHIFTS.flatMap((shiftE) =>
          SHIFTS.map((shiftN) =>
            formatPointLabels(crs, expected.easting + shiftE, expected.northing + shiftN, latitude)
          )
        );
        const candidates = new Set(adjacent.map((labels) => labels.get(key)));
        if (!candidates.has(value)) {
          mismatches.add(
            `${id} ${key}: oracle ${value} is not among the adjacent labels ${show([...candidates])}`
          );
        } else if (
          actualValue === null ||
          actualValue === undefined ||
          !candidates.has(actualValue)
        ) {
          mismatches.add(
            `${id} ${key}: ${show(actualValue)}, expected one of ${show([...candidates])} ` +
              `(boundary distance ${distance} m)`
          );
        }
      }
    });
    console.info(
      `end-to-end: ${endToEndCases.length} cases, ${checkedStrings} strings; ` +
        `${nearBoundaryCases.size} cases (${nearBoundaryStrings} strings) under the ` +
        `near-boundary rule`
    );
    expect(endToEndCases.length).toBeGreaterThan(4000);
    mismatches.assertNone();
  });
});
