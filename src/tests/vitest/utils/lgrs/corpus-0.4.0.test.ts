import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getLgrsGridBearing } from "utils/lgrs/bearing";
import { classifyLatLon } from "utils/lgrs/crs";
import { formatLgrs, formatLgrsLabel } from "utils/lgrs/format";
import { projectLatLon, unprojectToLatLon } from "utils/lgrs/projection";

// Fixtures come from `npm run lgrs:reference-corpus` (scripts/lgrs-reference).

type StringPair = { lgrs: string; acc: string };

type ExpectedProjection = {
  crsId: LgrsCrsId;
  system: "LPS" | "LTM";
  zone: number | null;
  hemisphere: LgrsHemisphere;
  easting: number;
  northing: number;
  inverseLatitude: number;
  inverseLongitude: number;
  lgrs10: string;
  acc10: string;
  /** Set where pyproj's tmerc northing is coarser than the default tolerance (near the equator). */
  toleranceMeters?: number;
};

type ProjectionCase = {
  category: string;
  latitude: number;
  longitude: number;
  reason?: string;
  expected: ExpectedProjection | null;
};

type LatLonBoundaryCase = ProjectionCase & {
  labels?: Record<string, StringPair | null>;
};

type ExpectedBox = StringPair & {
  prefix: string;
  condensed: string;
  text: string;
  lowerLeft: [number, number];
};

type LabelCase = {
  category: string;
  crsId: LgrsCrsId;
  easting: number;
  northing: number;
  latitude: number;
  precision: LgrsPrecision;
  reason?: string;
  expected:
    (StringPair & { prefix: string; condensed: string; lowerLeft: [number, number] }) | null;
  expectedBox: ExpectedBox | null;
  unvalidated?: StringPair | null;
  unvalidatedBox?: ExpectedBox;
};

type BearingCase = {
  category: string;
  origin: AEGISPoint;
  destination: AEGISPoint;
  originCrsId: LgrsCrsId;
  originEN: [number, number];
  destinationEN: [number, number];
  expectedBearing: number;
  expectedRange: number;
};

const PROJECTION_TOLERANCE_METERS = 1e-6;
const ANGLE_TOLERANCE_DEGREES = 1e-9;
const SHOWN_MISMATCHES = 10;
const PRECISIONS: LgrsPrecision[] = [1, 10, 100, 1000, 25000];
const KINDS: LgrsStringKind[] = ["lgrs", "acc"];
// The oracle's verdict is float noise for these cases; see metadata.semantics.rejected.
const REJECTED = "rejected";

function loadFixture<T>(filename: string): T {
  const path = resolve(process.cwd(), "src/tests/vitest/fixtures/lgrs/0.4.0", filename);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const metadata = loadFixture<{ version: string; tag: string; commit: string }>("metadata.json");
const projectionCases = loadFixture<{ cases: ProjectionCase[] }>("projection.json").cases;
const labelCases = loadFixture<{ cases: LabelCase[] }>("labels.json").cases;
const boundaries = loadFixture<{
  latLonCases: LatLonBoundaryCase[];
  projectedCases: LabelCase[];
}>("boundaries.json");
const bearingCases = loadFixture<{ cases: BearingCase[] }>("bearings.json").cases;

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

function angleDifference(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180);
}

function conform(lon: number): number {
  const wrapped = ((lon % 360) + 360) % 360;
  return wrapped >= 180 ? wrapped - 360 : wrapped;
}

function show(value: unknown): string {
  return JSON.stringify(value);
}

function latLonId(testCase: ProjectionCase): string {
  return `[${testCase.category}] lat=${testCase.latitude} lon=${testCase.longitude}`;
}

function projectedId(testCase: LabelCase, kind?: string): string {
  const { category, crsId, easting, northing, precision } = testCase;
  return `[${category}] crs=${crsId} E=${easting} N=${northing} p=${precision}${kind ? ` ${kind}` : ""}`;
}

function checkClassification(cases: ProjectionCase[], mismatches: Mismatches): void {
  for (const testCase of cases) {
    if (testCase.category === REJECTED && !testCase.expected) continue;
    const actual = classifyLatLon(testCase.latitude, testCase.longitude);
    const expected = testCase.expected?.crsId ?? -1;
    if (actual !== expected)
      mismatches.add(`${latLonId(testCase)}: crs ${actual}, expected ${expected}`);
  }
}

function checkForward(cases: ProjectionCase[], mismatches: Mismatches): void {
  const out = new Float64Array(2);
  for (const testCase of cases) {
    const expected = testCase.expected;
    if (!expected) continue;
    if (!projectLatLon(testCase.latitude, testCase.longitude, expected.crsId, out)) {
      mismatches.add(`${latLonId(testCase)}: projectLatLon returned false`);
      continue;
    }
    const tolerance = Math.max(PROJECTION_TOLERANCE_METERS, expected.toleranceMeters ?? 0);
    const dE = Math.abs(out[0] - expected.easting);
    const dN = Math.abs(out[1] - expected.northing);
    if (!(dE <= tolerance && dN <= tolerance)) {
      mismatches.add(`${latLonId(testCase)}: |dE|=${dE} |dN|=${dN} (tolerance ${tolerance})`);
    }
  }
}

function isPole(latitude: number): boolean {
  return Math.abs(latitude) === 90;
}

/**
 * Each component must match the oracle inverse or the input lat/lon. pyproj's inverse latitude is
 * coarse near the equator (tmerc) and the poles (stere), where the input is the better reference.
 */
function inverseMatches(
  lat: number,
  lon: number,
  testCase: ProjectionCase,
  expected: ExpectedProjection
): boolean {
  const latOk = [expected.inverseLatitude, testCase.latitude].some(
    (reference) => Math.abs(lat - reference) <= ANGLE_TOLERANCE_DEGREES
  );
  const lonOk =
    isPole(expected.inverseLatitude) ||
    [expected.inverseLongitude, conform(testCase.longitude)].some(
      (reference) => angleDifference(lon, reference) <= ANGLE_TOLERANCE_DEGREES
    );
  return latOk && lonOk;
}

function checkInverse(cases: ProjectionCase[], mismatches: Mismatches): void {
  const out = new Float64Array(2);
  for (const testCase of cases) {
    const expected = testCase.expected;
    if (!expected || testCase.category === REJECTED) continue;
    if (!unprojectToLatLon(expected.easting, expected.northing, expected.crsId, out)) {
      mismatches.add(`${latLonId(testCase)}: unprojectToLatLon returned false`);
      continue;
    }
    if (!inverseMatches(out[0], out[1], testCase, expected)) {
      mismatches.add(
        `${latLonId(testCase)}: inverse ${out[0]}, ${out[1]}, expected ` +
          `${expected.inverseLatitude}, ${expected.inverseLongitude}`
      );
    }
  }
}

/** lat/lon → TS projection → TS point label, compared with the oracle point label. */
function checkLatLonLabels(
  testCase: ProjectionCase,
  crs: LgrsCrsId,
  expectedByPrecision: [LgrsPrecision, StringPair | null][],
  mismatches: Mismatches
): void {
  if (testCase.category === REJECTED) return;
  const out = new Float64Array(2);
  if (!projectLatLon(testCase.latitude, testCase.longitude, crs, out)) {
    mismatches.add(`${latLonId(testCase)}: projectLatLon returned false`);
    return;
  }
  for (const [precision, expected] of expectedByPrecision) {
    if (!expected) continue;
    for (const kind of KINDS) {
      const actual = formatLgrs(out[0], out[1], crs, precision, kind, testCase.latitude);
      if (actual !== expected[kind]) {
        mismatches.add(
          `${latLonId(testCase)} p=${precision} ${kind}: ${show(actual)}, expected ${expected[kind]}`
        );
      }
    }
  }
}

function checkPointLabels(cases: LabelCase[], withLatitude: boolean, mismatches: Mismatches): void {
  for (const testCase of cases) {
    const { crsId, easting, northing, precision, latitude } = testCase;
    for (const kind of KINDS) {
      const actual = withLatitude
        ? formatLgrs(easting, northing, crsId, precision, kind, latitude)
        : formatLgrs(easting, northing, crsId, precision, kind);
      if (testCase.category === REJECTED) {
        const allowed = testCase.unvalidated;
        if (allowed && actual !== null && actual !== allowed[kind]) {
          mismatches.add(
            `${projectedId(testCase, kind)}: ${show(actual)}, expected null or ${allowed[kind]}`
          );
        }
        continue;
      }
      // Only the inverse can reject a point, so null cases are checked without a latitude.
      if (withLatitude && testCase.expected === null) continue;
      const expected = testCase.expected?.[kind] ?? null;
      if (actual !== expected) {
        mismatches.add(
          `${projectedId(testCase, kind)}: ${show(actual)}, expected ${show(expected)}`
        );
      }
    }
  }
}

function boxMatches(actual: LgrsLabel, expected: ExpectedBox, precision: LgrsPrecision): boolean {
  return (
    actual.lgrs === expected.lgrs &&
    actual.acc === expected.acc &&
    actual.prefix === expected.prefix &&
    actual.condensed === expected.condensed &&
    actual.text === expected.text &&
    actual.precision === precision &&
    Math.abs(actual.lowerLeft[0] - expected.lowerLeft[0]) <= PROJECTION_TOLERANCE_METERS &&
    Math.abs(actual.lowerLeft[1] - expected.lowerLeft[1]) <= PROJECTION_TOLERANCE_METERS
  );
}

function checkBoxLabels(cases: LabelCase[], mismatches: Mismatches): void {
  for (const testCase of cases) {
    const { crsId, easting, northing, precision } = testCase;
    const actual = formatLgrsLabel(easting, northing, crsId, precision);
    const expected = testCase.expectedBox;
    if (expected) {
      if (!actual || !boxMatches(actual, expected, precision)) {
        mismatches.add(`${projectedId(testCase)}: ${show(actual)}, expected ${show(expected)}`);
      }
      continue;
    }
    if (actual === null) continue;
    const rejected = testCase.category === REJECTED;
    const allowed = rejected ? testCase.unvalidatedBox : undefined;
    if (rejected && !allowed) continue;
    if (!allowed || !boxMatches(actual, allowed, precision)) {
      mismatches.add(
        `${projectedId(testCase)}: ${show(actual)}, expected ${allowed ? `null or ${show(allowed)}` : "null"}`
      );
    }
  }
}

describe("lgrs 0.4.0 reference corpus", () => {
  it("pins lgrs v0.4.0", () => {
    expect(metadata).toMatchObject({
      version: "0.4.0",
      tag: "v0.4.0",
      commit: "1f11a12ac20e4f4aab89805535319252a2abd2eb",
    });
  });

  describe("projection.json", () => {
    it("classifies every lat/lon into the oracle CRS", () => {
      const mismatches = new Mismatches("projection classification");
      checkClassification(projectionCases, mismatches);
      mismatches.assertNone();
    });

    it("projects lat/lon to the oracle E/N", () => {
      const mismatches = new Mismatches("projection forward");
      checkForward(projectionCases, mismatches);
      mismatches.assertNone();
    });

    it("inverts the oracle E/N to the oracle lat/lon", () => {
      const mismatches = new Mismatches("projection inverse");
      checkInverse(projectionCases, mismatches);
      mismatches.assertNone();
    });

    it("formats the 10 m point label of every lat/lon", () => {
      const mismatches = new Mismatches("projection 10 m labels");
      for (const testCase of projectionCases) {
        const expected = testCase.expected;
        if (!expected) continue;
        checkLatLonLabels(
          testCase,
          expected.crsId,
          [[10, { lgrs: expected.lgrs10, acc: expected.acc10 }]],
          mismatches
        );
      }
      mismatches.assertNone();
    });
  });

  describe("labels.json", () => {
    it("formats point labels with the supplied latitude", () => {
      const mismatches = new Mismatches("labels point (with latitude)");
      checkPointLabels(labelCases, true, mismatches);
      mismatches.assertNone();
    });

    it("formats point labels with the latitude from the inverse", () => {
      const mismatches = new Mismatches("labels point (inverse latitude)");
      checkPointLabels(labelCases, false, mismatches);
      mismatches.assertNone();
    });

    it("formats box labels at the box centre", () => {
      const mismatches = new Mismatches("labels box");
      checkBoxLabels(labelCases, mismatches);
      mismatches.assertNone();
    });
  });

  describe("boundaries.json", () => {
    const { latLonCases, projectedCases } = boundaries;

    it("classifies boundary lat/lon into the oracle CRS", () => {
      const mismatches = new Mismatches("boundary classification");
      checkClassification(latLonCases, mismatches);
      mismatches.assertNone();
    });

    it("projects and inverts boundary lat/lon", () => {
      const mismatches = new Mismatches("boundary projection");
      checkForward(latLonCases, mismatches);
      checkInverse(latLonCases, mismatches);
      mismatches.assertNone();
    });

    it("formats boundary lat/lon point labels at every precision", () => {
      const mismatches = new Mismatches("boundary lat/lon labels");
      for (const testCase of latLonCases) {
        if (!testCase.expected || !testCase.labels) continue;
        const labels = testCase.labels;
        checkLatLonLabels(
          testCase,
          testCase.expected.crsId,
          PRECISIONS.map((precision) => [precision, labels[String(precision)] ?? null]),
          mismatches
        );
      }
      mismatches.assertNone();
    });

    it("reproduces the plan example table", () => {
      const examples = latLonCases.filter((testCase) => testCase.category === "plan-example");
      expect(examples).toHaveLength(10);
      const mismatches = new Mismatches("plan examples");
      checkClassification(examples, mismatches);
      for (const testCase of examples) {
        const expected = testCase.expected!;
        checkLatLonLabels(
          testCase,
          expected.crsId,
          [[10, { lgrs: expected.lgrs10, acc: expected.acc10 }]],
          mismatches
        );
      }
      mismatches.assertNone();
    });

    it("formats boundary projected point labels", () => {
      const mismatches = new Mismatches("boundary point labels");
      checkPointLabels(projectedCases, true, mismatches);
      checkPointLabels(projectedCases, false, mismatches);
      mismatches.assertNone();
    });

    it("formats boundary projected box labels", () => {
      const mismatches = new Mismatches("boundary box labels");
      checkBoxLabels(projectedCases, mismatches);
      mismatches.assertNone();
    });
  });

  describe("bearings.json", () => {
    it("projects the destination into the origin CRS", () => {
      const mismatches = new Mismatches("bearing projection");
      const out = new Float64Array(2);
      for (const testCase of bearingCases) {
        const id = `[${testCase.category}] ${show(testCase.origin)} -> ${show(testCase.destination)}`;
        const crs = classifyLatLon(testCase.origin.lat, testCase.origin.lng);
        if (crs !== testCase.originCrsId) {
          mismatches.add(`${id}: origin crs ${crs}, expected ${testCase.originCrsId}`);
          continue;
        }
        for (const [point, expected] of [
          [testCase.origin, testCase.originEN],
          [testCase.destination, testCase.destinationEN],
        ] as const) {
          const ok = projectLatLon(point.lat, point.lng, crs, out);
          const dE = Math.abs(out[0] - expected[0]);
          const dN = Math.abs(out[1] - expected[1]);
          if (!ok || !(dE <= PROJECTION_TOLERANCE_METERS && dN <= PROJECTION_TOLERANCE_METERS)) {
            mismatches.add(`${id}: ${show(point)} |dE|=${dE} |dN|=${dN} ok=${ok}`);
          }
        }
      }
      mismatches.assertNone();
    });

    it("matches the oracle grid bearing in the origin CRS", () => {
      expect(bearingCases.length).toBeGreaterThan(0);
      const mismatches = new Mismatches("bearings");
      for (const testCase of bearingCases) {
        const actual = getLgrsGridBearing(testCase.origin, testCase.destination);
        const difference = angleDifference(actual, testCase.expectedBearing);
        if (!(actual >= 0 && actual < 360 && difference <= ANGLE_TOLERANCE_DEGREES)) {
          mismatches.add(
            `[${testCase.category}] ${show(testCase.origin)} -> ${show(testCase.destination)}: ` +
              `${actual}, expected ${testCase.expectedBearing} (range ${testCase.expectedRange} m)`
          );
        }
      }
      mismatches.assertNone();
    });
  });
});
