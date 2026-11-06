import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  classifyLatLon,
  projectLatLon,
  moonGridSystem,
} from "@bfeist/planetary-grid-reference/moon";
import { getLgrsGridBearing } from "utils/lgrs/bearing";

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
const bearingCases = JSON.parse(
  readFileSync(resolve(process.cwd(), "src/tests/vitest/fixtures/lgrs/0.4.0/bearings.json"), "utf8")
).cases as BearingCase[];

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

function show(value: unknown): string {
  return JSON.stringify(value);
}

describe("LGRS reference bearing corpus (0.4.0)", () => {
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
        const actual = getLgrsGridBearing(moonGridSystem, testCase.origin, testCase.destination);
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
