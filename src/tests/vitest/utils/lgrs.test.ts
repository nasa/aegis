import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createDynamicLgrsRenderPlan,
  formatSouthLpsCoordinate,
  isCanonicalSouthLpsMission,
  mapCapToLps,
  SOUTH_LPS_DOMAIN_RADIUS_METERS,
  type LgrsPrecision,
  type LpsExtent,
} from "utils/lgrs/dynamicGrid";

type ExpectedLabel = {
  lgrs: string;
  acc: string;
  condensed: string;
  text: string;
  lowerLeft: [number, number];
};

type OraclePointCase = {
  category: string;
  easting: number;
  northing: number;
  precision: LgrsPrecision;
  supported: boolean;
  expected: ExpectedLabel | null;
};

type OracleViewport = {
  name: string;
  extent: LpsExtent;
  gridSpacingMode: GridSpacingMode;
  gridLabelInterval: GridSpacingMode;
  mapResolution: number;
  labelsVisible: boolean;
  expected: {
    lineSpacing: number;
    labelSpacing: number;
    lines: {
      axis: "easting" | "northing";
      value: number;
      start: [number, number];
      end: [number, number];
    }[];
    labels: { coordinate: [number, number]; expected: ExpectedLabel }[];
  };
};

const fixturePath = (filename: string) =>
  resolve(process.cwd(), "src/tests/vitest/fixtures/lgrs/0.3.0", filename);
const pointFixture = JSON.parse(readFileSync(fixturePath("south-lps-cases.json"), "utf8")) as {
  readableCases: OraclePointCase[];
  seededCases: OraclePointCase[];
};
const viewportFixture = JSON.parse(
  readFileSync(fixturePath("south-lps-viewports.json"), "utf8")
) as { viewports: OracleViewport[] };

function roundedCoordinate(coordinate: [number, number]): [number, number] {
  return coordinate.map((value) => Number(value.toFixed(6))) as [number, number];
}

function expectedLabel(label: NonNullable<ReturnType<typeof formatSouthLpsCoordinate>>) {
  return {
    lgrs: label.lgrs,
    acc: label.acc,
    condensed: label.condensed,
    text: label.text,
    lowerLeft: label.lowerLeft,
  };
}

describe("formatSouthLpsCoordinate", () => {
  test.each([
    [[500000, 500000], 10, "BAN00000000", "BAN-00-00", "-00 -00"],
    [[499999.999, 500000], 10, "AZN24990000", "AZNZ99-00", "Z99 -00"],
    [[500000, 499999.999], 100, "BAM000249", "BAM-0Z9", "-0 Z9"],
    [[475000, 500000], 100, "AZN000000", "AZN-0-0", "-0 -0"],
  ] as const)(
    "matches the Python oracle at %j with %s m precision",
    (coordinate, precision, lgrs, acc, text) => {
      expect(formatSouthLpsCoordinate([...coordinate], precision)).toMatchObject({
        lgrs,
        acc,
        text,
      });
    }
  );

  test("uses floor-based cell boundaries", () => {
    expect(formatSouthLpsCoordinate([500099.999, 500099.999], 100)?.lowerLeft).toEqual([
      500000, 500000,
    ]);
    expect(formatSouthLpsCoordinate([500100, 500100], 100)?.lowerLeft).toEqual([500100, 500100]);
  });

  test("rejects coordinates outside the nominal south-LPS domain", () => {
    expect(
      formatSouthLpsCoordinate([500000 + SOUTH_LPS_DOMAIN_RADIUS_METERS + 1, 500000], 10)
    ).toBeNull();
  });
});

describe("createDynamicLgrsRenderPlan", () => {
  test("uses the existing auto density targets on the 10 m lattice", () => {
    const plan = createDynamicLgrsRenderPlan({
      extent: [499000, 499000, 501000, 501000],
      gridSpacingMode: "auto",
      gridLabelInterval: "auto",
      mapResolution: 1,
      labelsVisible: true,
    });

    expect(plan.lineSpacing).toBe(200);
    expect(plan.labelSpacing).toBe(400);
    expect(plan.lines).toHaveLength(22);
    expect(plan.labels).toHaveLength(25);
  });

  test("keeps fixed line spacing while independently suppressing overlapping labels", () => {
    const plan = createDynamicLgrsRenderPlan({
      extent: [499900, 499900, 500100, 500100],
      gridSpacingMode: 10,
      gridLabelInterval: "auto",
      mapResolution: 1,
      labelsVisible: true,
    });

    expect(plan.lineSpacing).toBe(10);
    expect(plan.lines).toHaveLength(42);
    expect(plan.labels).toEqual([]);
  });

  test("clips line endpoints to the 80 degree south domain", () => {
    const radius = SOUTH_LPS_DOMAIN_RADIUS_METERS;
    const plan = createDynamicLgrsRenderPlan({
      extent: [500000 - radius - 100, 499900, 500000 + radius + 100, 500100],
      gridSpacingMode: 1000,
      gridLabelInterval: 1000,
      mapResolution: 1,
      labelsVisible: false,
    });

    expect(plan.lines.every((line) => line.start[0] >= 500000 - radius)).toBe(true);
    expect(plan.lines.every((line) => line.end[0] <= 500000 + radius)).toBe(true);
  });
});

describe("canonical cap projection", () => {
  test("recognizes the pipeline projection and maps its origin to the LPS false origin", () => {
    expect(
      isCanonicalSouthLpsMission({
        planetRadius: 1737400,
        projIsCustom: true,
        projProj4String:
          "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs",
      })
    ).toBe(true);
    expect(mapCapToLps([0, 0])).toEqual([500000, 500000]);
  });
});

describe("lgrs 0.3.0 oracle corpus", () => {
  test("matches every readable and seeded south-LPS point", () => {
    const cases = [...pointFixture.readableCases, ...pointFixture.seededCases];
    expect(cases.length).toBeGreaterThan(3000);

    for (const oracleCase of cases) {
      const actual = formatSouthLpsCoordinate(
        [oracleCase.easting, oracleCase.northing],
        oracleCase.precision
      );
      if (!oracleCase.supported) {
        expect(actual, oracleCase.category).toBeNull();
      } else {
        expect(actual, oracleCase.category).not.toBeNull();
        expect(expectedLabel(actual!), oracleCase.category).toEqual(oracleCase.expected);
      }
    }
  });

  test.each(viewportFixture.viewports)("matches viewport plan $name", (oracle) => {
    const actual = createDynamicLgrsRenderPlan({
      extent: oracle.extent,
      gridSpacingMode: oracle.gridSpacingMode,
      gridLabelInterval: oracle.gridLabelInterval,
      mapResolution: oracle.mapResolution,
      labelsVisible: oracle.labelsVisible,
    });
    const normalized = {
      lineSpacing: actual.lineSpacing,
      labelSpacing: actual.labelSpacing,
      lines: actual.lines.map((line) => ({
        axis: line.axis,
        value: line.value,
        start: roundedCoordinate(line.start),
        end: roundedCoordinate(line.end),
      })),
      labels: actual.labels.map(({ coordinate, label }) => ({
        coordinate,
        expected: expectedLabel(label),
      })),
    };

    expect(normalized).toEqual(oracle.expected);
  });

  test("fixture manifest matches the committed oracle files", () => {
    const manifest = readFileSync(fixturePath("manifest.sha256"), "ascii").trim().split("\n");
    for (const entry of manifest) {
      const [expectedHash, filename] = entry.split(/\s+/);
      const actualHash = createHash("sha256")
        .update(readFileSync(fixturePath(filename)))
        .digest("hex");
      expect(actualHash, filename).toBe(expectedHash);
    }
  });

  test("builds a representative 10 km plan within the regression budget", () => {
    const start = performance.now();
    const plan = createDynamicLgrsRenderPlan({
      extent: [495000, 495000, 505000, 505000],
      gridSpacingMode: "auto",
      gridLabelInterval: "auto",
      mapResolution: 10,
      labelsVisible: true,
    });
    const elapsed = performance.now() - start;

    expect(plan.lines.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(250);
  });
});
