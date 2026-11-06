import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { LPS_DOMAIN_RADIUS } from "utils/lgrs/constants";
import { LGRS_CRS_LPS_SOUTH } from "utils/lgrs/crs";
import { SOUTH_LPS_DOMAIN_RADIUS_METERS } from "utils/lgrs/dynamicGrid";
import { formatLatLonAsLgrs, formatLgrs, formatLgrsLabel } from "utils/lgrs/format";
import { projectLatLon } from "utils/lgrs/projection";
import { latLonToSouthLps } from "utils/lgrs/southLps";

import { createSeededRandom } from "../../helpers/seededRandom";

type ExpectedLabel = {
  lgrs: string;
  acc: string;
  condensed: string;
  text: string;
  lowerLeft: [number, number];
};

type ReferencePointCase = {
  category: string;
  easting: number;
  northing: number;
  precision: LgrsPrecision;
  supported: boolean;
  expected: ExpectedLabel | null;
};

type ReferenceProjectionCase = {
  category: string;
  latitude: number;
  longitude: number;
  expected: { easting: number; northing: number; lgrs: string; acc: string; text: string };
};

const fixturePath = (filename: string) =>
  resolve(process.cwd(), "src/tests/vitest/fixtures/lgrs/0.3.0", filename);
const pointFixture = JSON.parse(readFileSync(fixturePath("south-lps-cases.json"), "utf8")) as {
  readableCases: ReferencePointCase[];
  seededCases: ReferencePointCase[];
};
const projectionFixture = JSON.parse(
  readFileSync(fixturePath("south-lps-projection-cases.json"), "utf8")
) as { readableCases: ReferenceProjectionCase[]; seededCases: ReferenceProjectionCase[] };

const out = new Float64Array(2);

describe("new LGRS library against the lgrs 0.3.0 south fixtures (gate 1)", () => {
  test("keeps the south-LPS domain radius", () => {
    expect(LPS_DOMAIN_RADIUS).toBe(SOUTH_LPS_DOMAIN_RADIUS_METERS);
  });

  test("projects every reference case bit-identically to latLonToSouthLps", () => {
    const cases = [...projectionFixture.readableCases, ...projectionFixture.seededCases];
    expect(cases.length).toBeGreaterThan(3000);
    const mismatches: string[] = [];
    for (const referenceCase of cases) {
      const legacy = latLonToSouthLps({
        lat: referenceCase.latitude,
        lng: referenceCase.longitude,
      });
      const ok = projectLatLon(referenceCase.latitude, referenceCase.longitude, 0, out);
      if (!ok || !legacy || !Object.is(out[0], legacy[0]) || !Object.is(out[1], legacy[1])) {
        mismatches.push(
          `${referenceCase.category} ${referenceCase.latitude},${referenceCase.longitude}`
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  test("labels every projection case like the reference (point and box semantics)", () => {
    const cases = [...projectionFixture.readableCases, ...projectionFixture.seededCases];
    const mismatches: string[] = [];
    for (const referenceCase of cases) {
      const { latitude, longitude, expected } = referenceCase;
      projectLatLon(latitude, longitude, LGRS_CRS_LPS_SOUTH, out);
      const label = formatLgrsLabel(out[0], out[1], LGRS_CRS_LPS_SOUTH, 10);
      const actual = {
        lgrs: label?.lgrs,
        acc: label?.acc,
        text: label?.text,
        pointLgrs: formatLgrs(out[0], out[1], LGRS_CRS_LPS_SOUTH, 10, "lgrs", latitude),
        pointAcc: formatLatLonAsLgrs(latitude, longitude, 10, "acc"),
      };
      const wanted = {
        lgrs: expected.lgrs,
        acc: expected.acc,
        text: expected.text,
        pointLgrs: expected.lgrs,
        pointAcc: expected.acc,
      };
      if (!isDeepStrictEqual(actual, wanted)) {
        mismatches.push(`${referenceCase.category} ${latitude},${longitude}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  test("labels every readable and seeded south-LPS box like the reference", () => {
    const cases = [...pointFixture.readableCases, ...pointFixture.seededCases];
    expect(cases.length).toBeGreaterThan(3000);
    const mismatches: string[] = [];
    for (const referenceCase of cases) {
      const label = formatLgrsLabel(
        referenceCase.easting,
        referenceCase.northing,
        LGRS_CRS_LPS_SOUTH,
        referenceCase.precision
      );
      const actual = label && {
        lgrs: label.lgrs,
        acc: label.acc,
        condensed: label.condensed,
        text: label.text,
        lowerLeft: label.lowerLeft,
      };
      const ok = referenceCase.supported
        ? actual !== null &&
          isDeepStrictEqual(actual, referenceCase.expected) &&
          label.acc === label.prefix + label.condensed
        : actual === null;
      if (!ok) {
        mismatches.push(
          `${referenceCase.category} ${referenceCase.easting},${referenceCase.northing}@${referenceCase.precision}`
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  test("projects random points bit-identically to latLonToSouthLps", () => {
    const random = createSeededRandom(20261105);
    let compared = 0;
    for (let index = 0; index < 5000; index++) {
      const lat = index < 4000 ? -90 + random() * 10 : -90 + random() * 180;
      const lon = -180 + random() * 360;
      const legacy = latLonToSouthLps({ lat, lng: lon });
      const ok = projectLatLon(lat, lon, LGRS_CRS_LPS_SOUTH, out);
      if (!legacy || !Number.isFinite(legacy[0]) || !Number.isFinite(legacy[1])) {
        expect(ok).toBe(false);
        continue;
      }
      expect(ok).toBe(true);
      expect(Object.is(out[0], legacy[0]) && Object.is(out[1], legacy[1]), `${lat},${lon}`).toBe(
        true
      );
      compared++;
    }
    expect(compared).toBeGreaterThan(4900);
  });
});
