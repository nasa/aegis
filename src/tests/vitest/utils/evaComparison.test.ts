import {
  EVA_COMPARISON_METRIC_ROWS,
  computeComparisonColumnValues,
  computeSequenceItemMetrics,
  getActualDistanceWalked,
  getMaxDistanceFromLander,
} from "utils/evaComparison";
import { getDistanceBetweenTwoCoordinates, getTotalDistance } from "utils/mapping/geoMath";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankRex, generateBlankPosEntry } from "store/storeUtils/rex";

const LANDER: AEGISPoint = { lat: 0, lng: 0 };

/**
 * Fixture: one as-planned EVA "Alpha" (eva1) — traverse t1 then stations s1, s2 —
 * with hand-checkable action times, masses, distances and elevations; plus a
 * matching REX EVA copy (rexEva1) driven by rex1. A second as-planned EVA
 * "Bravo" (eva2) with traverse t2 / station s3 supports campaign aggregation.
 */
const buildFixture = () => {
  const mission = generateBlankMission({ actionSystemVersion: 2 });
  mission.landerLocation = { ...LANDER };
  mission.traverseRate = 2; // km/h
  mission.walkbackRate = 2; // km/h
  mission.equipmentItems = {
    bag: { name: "Sample bag", quantity: 100, singleUse: true },
    tool: { name: "Hammer", quantity: 5, singleUse: false },
  };

  // ---- EVA Alpha (eva1) ----
  const t1 = generateBlankTraverse({
    uuid: "t1",
    name: "Traverse 1",
    pathSegmentDistances: [100, 200], // 300 m total -> 9 min at 2 km/h
    pathSegmentElevations: [[0, 10, 5]], // ascent 10, descent 5
    path: [
      { lat: 0, lng: 0.01 },
      { lat: 0, lng: 0.02 },
    ],
  });
  const s1 = generateBlankStation({
    uuid: "s1",
    name: "Station 1",
    location: { lat: 0, lng: 0.05 },
    walkbackPathSegmentDistances: [600], // 18 min at 2 km/h
  });
  const s2 = generateBlankStation({
    uuid: "s2",
    name: "Station 2",
    location: { lat: 0, lng: 0.1 }, // farthest station from lander
  });

  const eva1 = generateBlankEVA({
    uuid: "eva1",
    name: "Alpha",
    duration: 120, // allotted minutes
    egressDuration: 10,
    ingressDuration: 10,
    sequence: [
      { type: "traverse", uuid: "t1" },
      { type: "station", uuid: "s1" },
      { type: "station", uuid: "s2" },
    ],
  });

  // REX EVA copy of Alpha (same refUuid), same sequence -> same plan metrics.
  const rexEva1 = generateBlankEVA({
    uuid: "rexEva1",
    name: "",
    refUuid: eva1.refUuid,
    duration: 120,
    egressDuration: 10,
    ingressDuration: 10,
    sequence: [
      { type: "traverse", uuid: "t1" },
      { type: "station", uuid: "s1" },
      { type: "station", uuid: "s2" },
    ],
  });

  // ---- EVA Bravo (eva2) ----
  const t2 = generateBlankTraverse({
    uuid: "t2",
    name: "Traverse 2",
    pathSegmentDistances: [500], // 15 min at 2 km/h
    pathSegmentElevations: [[0, 20, 15]], // ascent 20, descent 5
    path: [
      { lat: 0, lng: 0.2 },
      { lat: 0, lng: 0.3 }, // farthest point in the whole mission
    ],
  });
  const s3 = generateBlankStation({
    uuid: "s3",
    name: "Station 3",
    location: { lat: 0, lng: 0.25 },
  });
  const eva2 = generateBlankEVA({
    uuid: "eva2",
    name: "Bravo",
    duration: null,
    egressDuration: 10,
    ingressDuration: 10,
    sequence: [
      { type: "traverse", uuid: "t2" },
      { type: "station", uuid: "s3" },
    ],
  });

  mission.stations = { s1, s2, s3 };
  mission.traverses = { t1, t2 };
  mission.evas = { eva1, rexEva1, eva2 };

  const makeAction = (partial: Partial<Action>): Action =>
    generateBlankAction({
      stmAction: true,
      enabled: true,
      actionDefinition: { verbUuid: "v1", nounUuid: "n1", adjectiveUuid: "a1" },
      ...partial,
    });

  // s1: a1 (EV1, 20 min, 100 g), a2 (EV2, 30 min, 50 g)
  // s2: a3 (EV1, 15 min, 200 g, uses 2 single-use bags + 1 non-consumable tool)
  mission.actions = {
    a1: makeAction({
      uuid: "a1",
      stationUuid: "s1",
      crewAssigned: ["EV1"],
      duration: 20,
      mass: 100,
    }),
    a2: makeAction({
      uuid: "a2",
      stationUuid: "s1",
      crewAssigned: ["EV2"],
      duration: 30,
      mass: 50,
    }),
    a3: makeAction({
      uuid: "a3",
      stationUuid: "s2",
      crewAssigned: ["EV1"],
      duration: 15,
      mass: 200,
      equipmentItemsUsage: { bag: { quantityUsed: 2 }, tool: { quantityUsed: 1 } },
    }),
  };

  // REX for Alpha: recorded masses + statuses + a position track.
  const rex1 = generateBlankRex({
    uuid: "rex1",
    evaUuid: "rexEva1",
    name: "Rex Alpha",
    actionEntries: {
      a1: { rexStatus: "complete", mass: 90 },
      a2: { rexStatus: "skipped", mass: 40 },
      a3: { rexStatus: "complete", mass: 210 },
    },
    posEntries: [
      generateBlankPosEntry({ location: { lat: 0, lng: 0 } }),
      generateBlankPosEntry({ location: { lat: 0, lng: 0.05 } }),
      generateBlankPosEntry({ location: { lat: 0, lng: 0.1 } }),
    ],
  });
  mission.rexes = { rex1 };

  return { mission, makeAction };
};

const evaColumn: EvaReportColumn = {
  key: "eva1",
  kind: "eva",
  evaUuid: "eva1",
  isRex: false,
  label: "Alpha",
  groupKey: "eva1",
  groupLabel: "Alpha",
};

const rexColumn: EvaReportColumn = {
  key: "rex1",
  kind: "rex",
  evaUuid: "rexEva1",
  isRex: true,
  rexUuid: "rex1",
  label: "Alpha",
  groupKey: "eva1",
  groupLabel: "Alpha",
};

const bravoColumn: EvaReportColumn = {
  key: "eva2",
  kind: "eva",
  evaUuid: "eva2",
  isRex: false,
  label: "Bravo",
  groupKey: "eva2",
  groupLabel: "Bravo",
};

const RADIUS = 1737400; // moon default

describe("EVA_COMPARISON_METRIC_ROWS", () => {
  test("ids are unique and rexOnly rows are exactly the four rexOnly-group rows", () => {
    const ids = EVA_COMPARISON_METRIC_ROWS.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);

    const rexOnlyIds = EVA_COMPARISON_METRIC_ROWS.filter((row) => row.rexOnly).map((row) => row.id);
    expect(rexOnlyIds.sort()).toEqual(
      [
        "actionsCompleteCount",
        "actionsSkippedCount",
        "actualDistanceWalked",
        "actualSampleMass",
      ].sort()
    );
    // Every rexOnly row lives in the rexOnly group and vice versa.
    for (const row of EVA_COMPARISON_METRIC_ROWS) {
      expect(row.rexOnly).toBe(row.group === "rexOnly");
    }
  });

  test("max aggregation is used for max-from-lander and worst-case walkback only", () => {
    const maxRows = EVA_COMPARISON_METRIC_ROWS.filter((row) => row.aggregation === "max").map(
      (row) => row.id
    );
    expect(maxRows.sort()).toEqual(["maxDistanceFromLander", "worstCaseWalkbackDuration"].sort());
  });
});

describe("computeComparisonColumnValues() — single EVA column", () => {
  test("computes hand-checkable plan metrics and nulls the REX-only rows", () => {
    const { mission } = buildFixture();
    const values = computeComparisonColumnValues({ mission, column: evaColumn });

    // Time (minutes)
    expect(values.totalEvaTimeCalculated).toBe(74); // dwell 45 + traverse 9 + egress 10 + ingress 10
    expect(values.allottedEvaTime).toBe(120);
    expect(values.evaTimeMargin).toBe(46); // 120 - 74
    expect(values.totalTraverseTime).toBe(9);
    expect(values.dwellEv1).toBe(35); // 20 + 15
    expect(values.dwellEv2).toBe(30);
    expect(values.dwellUnassigned).toBe(0);
    expect(values.totalDwellTime).toBe(45); // 30 (s1) + 15 (s2)

    // Distance
    expect(values.totalTraverseDistance).toBe(300);
    expect(values.totalAscent).toBe(10);
    expect(values.totalDescent).toBe(5);
    expect(values.maxDistanceFromLander).toBe(
      getDistanceBetweenTwoCoordinates({ lat: 0, lng: 0.1 }, LANDER, RADIUS)
    );
    expect(values.worstCaseWalkbackDuration).toBe(18);

    // Work
    expect(values.stationCount).toBe(2);
    expect(values.actionCount).toBe(3);
    expect(values.totalActionTime).toBe(65); // 50 + 15
    expect(values.plannedSampleMass).toBe(0.35); // 350 g -> kg
    expect(values.singleUseConsumablesCount).toBe(2); // 2 bags, tool excluded

    // REX-only rows blank on a plan column
    expect(values.actualSampleMass).toBeNull();
    expect(values.actionsCompleteCount).toBeNull();
    expect(values.actionsSkippedCount).toBeNull();
    expect(values.actualDistanceWalked).toBeNull();
  });

  test("null allotted duration yields null allotted + null margin", () => {
    const { mission } = buildFixture();
    const values = computeComparisonColumnValues({ mission, column: bravoColumn });
    expect(values.allottedEvaTime).toBeNull();
    expect(values.evaTimeMargin).toBeNull();
    expect(values.totalTraverseDistance).toBe(500);
  });

  test("missing EVA yields all-null values", () => {
    const { mission } = buildFixture();
    const values = computeComparisonColumnValues({
      mission,
      column: { ...evaColumn, key: "ghost", evaUuid: "ghost" },
    });
    for (const row of EVA_COMPARISON_METRIC_ROWS) expect(values[row.id]).toBeNull();
  });
});

describe("computeComparisonColumnValues() — REX column", () => {
  test("plan metrics from the REX EVA copy plus populated REX-only rows", () => {
    const { mission } = buildFixture();
    const values = computeComparisonColumnValues({ mission, column: rexColumn });

    // Plan metrics identical to Alpha (same sequence)
    expect(values.totalTraverseDistance).toBe(300);
    expect(values.plannedSampleMass).toBe(0.35);

    // REX-only rows
    expect(values.actualSampleMass).toBe(0.34); // (90 + 40 + 210) g -> kg
    expect(values.actionsCompleteCount).toBe(2);
    expect(values.actionsSkippedCount).toBe(1);
    expect(values.actualDistanceWalked).toBe(
      getTotalDistance(
        [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.05 },
          { lat: 0, lng: 0.1 },
        ],
        RADIUS
      )
    );
  });

  test("missing REX yields null REX-only rows but keeps plan metrics", () => {
    const { mission } = buildFixture();
    const values = computeComparisonColumnValues({
      mission,
      column: { ...rexColumn, rexUuid: "ghost" },
    });
    expect(values.totalTraverseDistance).toBe(300);
    expect(values.actualSampleMass).toBeNull();
    expect(values.actualDistanceWalked).toBeNull();
  });
});

describe("computeComparisonColumnValues() — campaign columns", () => {
  const campaignPlannedColumn: EvaReportColumn = {
    key: "campaign:c1:planned",
    kind: "campaignPlanned",
    isRex: false,
    campaignUuid: "c1",
    label: "Planned set",
    groupKey: "campaign:c1",
    groupLabel: "Campaign 1",
  };
  const campaignExecutedColumn: EvaReportColumn = {
    key: "campaign:c1:executed",
    kind: "campaignExecuted",
    isRex: false,
    campaignUuid: "c1",
    label: "Executed set",
    groupKey: "campaign:c1",
    groupLabel: "Campaign 1",
  };

  const withCampaign = (mission: Mission, campaign: Partial<ReportCampaign>): Mission => ({
    ...mission,
    reportCampaigns: {
      c1: {
        uuid: "c1",
        name: "Campaign 1",
        description: null,
        memberEvaUuids: [],
        executionRexUuidByEvaUuid: null,
        createdAt: 0,
        updatedAt: null,
        ...campaign,
      },
    },
  });

  test("campaignPlanned sums members (sum rows) and takes the max (max rows)", () => {
    const { mission: base } = buildFixture();
    const mission = withCampaign(base, { memberEvaUuids: ["eva1", "eva2"] });

    const alpha = computeComparisonColumnValues({ mission, column: evaColumn });
    const bravo = computeComparisonColumnValues({ mission, column: bravoColumn });
    const planned = computeComparisonColumnValues({ mission, column: campaignPlannedColumn });

    // Sum rows: hand-summed members
    expect(planned.totalTraverseDistance).toBe(800); // 300 + 500
    expect(planned.totalEvaTimeCalculated).toBe(
      (alpha.totalEvaTimeCalculated as number) + (bravo.totalEvaTimeCalculated as number)
    );
    expect(planned.stationCount).toBe(3); // 2 + 1

    // Max rows: farthest point wins (Bravo's traverse point at lng 0.3)
    expect(planned.maxDistanceFromLander).toBe(
      getDistanceBetweenTwoCoordinates({ lat: 0, lng: 0.3 }, LANDER, RADIUS)
    );
    expect(planned.maxDistanceFromLander).toBe(bravo.maxDistanceFromLander);

    // REX-only rows null on a plan (campaignPlanned) column
    expect(planned.actualSampleMass).toBeNull();
    expect(planned.actualDistanceWalked).toBeNull();
  });

  test("null margin from a member is skipped, not treated as zero", () => {
    const { mission: base } = buildFixture();
    // eva2 has null duration -> null margin; campaign margin should equal eva1's only
    const mission = withCampaign(base, { memberEvaUuids: ["eva1", "eva2"] });
    const planned = computeComparisonColumnValues({ mission, column: campaignPlannedColumn });
    expect(planned.evaTimeMargin).toBe(46); // only Alpha contributes
    expect(planned.allottedEvaTime).toBe(120); // only Alpha contributes
  });

  test("deleted member EVAs are skipped", () => {
    const { mission: base } = buildFixture();
    const withGhost = withCampaign(base, { memberEvaUuids: ["eva1", "ghost"] });
    const onlyAlpha = withCampaign(base, { memberEvaUuids: ["eva1"] });

    const a = computeComparisonColumnValues({ mission: withGhost, column: campaignPlannedColumn });
    const b = computeComparisonColumnValues({ mission: onlyAlpha, column: campaignPlannedColumn });
    for (const row of EVA_COMPARISON_METRIC_ROWS) expect(a[row.id]).toBe(b[row.id]);
  });

  test("campaignExecuted aggregates the resolved execution REXes", () => {
    const { mission: base } = buildFixture();
    const mission = withCampaign(base, {
      memberEvaUuids: ["eva1"],
      executionRexUuidByEvaUuid: { eva1: "rex1" },
    });
    const executed = computeComparisonColumnValues({ mission, column: campaignExecutedColumn });

    // Plan metrics from the resolved rex's EVA copy
    expect(executed.totalTraverseDistance).toBe(300);
    // REX-only rows populated from the resolved rex
    expect(executed.actualSampleMass).toBe(0.34);
    expect(executed.actionsCompleteCount).toBe(2);
    expect(executed.actionsSkippedCount).toBe(1);
  });

  test("empty members and missing campaign both yield all-null values", () => {
    const { mission: base } = buildFixture();

    const emptyMembers = withCampaign(base, { memberEvaUuids: [] });
    const planned = computeComparisonColumnValues({
      mission: emptyMembers,
      column: campaignPlannedColumn,
    });
    for (const row of EVA_COMPARISON_METRIC_ROWS) expect(planned[row.id]).toBeNull();

    // base has no reportCampaigns at all -> campaign not found
    const missingCampaign = computeComparisonColumnValues({
      mission: base,
      column: campaignExecutedColumn,
    });
    for (const row of EVA_COMPARISON_METRIC_ROWS) expect(missingCampaign[row.id]).toBeNull();
  });
});

describe("computeSequenceItemMetrics() — per-station/traverse sub-columns", () => {
  const stationItem = (uuid: string, name: string): StmCoverageSequenceItem => ({
    type: "station",
    uuid,
    name,
  });
  const traverseItem = (uuid: string, name: string): StmCoverageSequenceItem => ({
    type: "traverse",
    uuid,
    name,
  });

  test("attributes a station's own plan metrics; EVA-level + traverse rows are null", () => {
    const { mission } = buildFixture();
    // s1: a1 (EV1, 20 min, 100 g), a2 (EV2, 30 min, 50 g); walkback 600 m -> 18 min.
    const s1 = computeSequenceItemMetrics({
      mission,
      column: evaColumn,
      item: stationItem("s1", "Station 1"),
    });

    expect(s1.totalEvaTimeCalculated).toBe(30); // station's dwell
    expect(s1.dwellEv1).toBe(20);
    expect(s1.dwellEv2).toBe(30);
    expect(s1.totalDwellTime).toBe(30); // max(EV1, EV2)
    expect(s1.stationCount).toBe(1);
    expect(s1.actionCount).toBe(2);
    expect(s1.totalActionTime).toBe(50);
    expect(s1.plannedSampleMass).toBe(0.15);
    expect(s1.singleUseConsumablesCount).toBe(0); // s1 actions use no equipment
    expect(s1.worstCaseWalkbackDuration).toBe(18);
    expect(s1.maxDistanceFromLander).toBe(
      getDistanceBetweenTwoCoordinates({ lat: 0, lng: 0.05 }, LANDER, RADIUS)
    );

    // EVA-level rows never attribute to a single item.
    expect(s1.allottedEvaTime).toBeNull();
    expect(s1.evaTimeMargin).toBeNull();
    // Traverse-only rows are null on a station.
    expect(s1.totalTraverseTime).toBeNull();
    expect(s1.totalTraverseDistance).toBeNull();
    // REX-only rows null on a plan column.
    expect(s1.actualSampleMass).toBeNull();
  });

  test("attributes a traverse's distance/ascent; station-only rows are null", () => {
    const { mission } = buildFixture();
    // t1: 300 m -> 9 min at 2 km/h; ascent 10, descent 5; no actions.
    const t1 = computeSequenceItemMetrics({
      mission,
      column: evaColumn,
      item: traverseItem("t1", "Traverse 1"),
    });

    expect(t1.totalTraverseTime).toBe(9);
    expect(t1.totalEvaTimeCalculated).toBe(9); // duration + own dwell (0)
    expect(t1.totalTraverseDistance).toBe(300);
    expect(t1.totalAscent).toBe(10);
    expect(t1.totalDescent).toBe(5);
    expect(t1.actionCount).toBe(0);
    expect(t1.maxDistanceFromLander).toBe(
      getDistanceBetweenTwoCoordinates({ lat: 0, lng: 0.02 }, LANDER, RADIUS)
    );
    // Station-only rows null on a traverse.
    expect(t1.stationCount).toBeNull();
    expect(t1.worstCaseWalkbackDuration).toBeNull();
  });

  test("summable rows sum to the column Total; max rows equal the item max", () => {
    const { mission } = buildFixture();
    const total = computeComparisonColumnValues({ mission, column: evaColumn });
    const items = [
      traverseItem("t1", "Traverse 1"),
      stationItem("s1", "Station 1"),
      stationItem("s2", "Station 2"),
    ].map((item) => computeSequenceItemMetrics({ mission, column: evaColumn, item }));

    const sumOf = (id: string) =>
      items.reduce((acc, values) => acc + ((values[id] as number | null) ?? 0), 0);

    for (const id of [
      "totalDwellTime",
      "dwellEv1",
      "dwellEv2",
      "actionCount",
      "totalActionTime",
      "plannedSampleMass",
      "stationCount",
      "totalTraverseDistance",
      "singleUseConsumablesCount",
    ]) {
      expect(sumOf(id)).toBeCloseTo(total[id] as number, 10);
    }

    const maxOf = (id: string) =>
      Math.max(...items.map((values) => (values[id] as number | null) ?? 0));
    expect(maxOf("maxDistanceFromLander")).toBe(total.maxDistanceFromLander);
    expect(maxOf("worstCaseWalkbackDuration")).toBe(total.worstCaseWalkbackDuration);
  });

  test("REX column attributes REX-only rows per station from action entries", () => {
    const { mission } = buildFixture();
    // s1 holds a1 (complete, 90 g) + a2 (skipped, 40 g); s2 holds a3 (complete, 210 g).
    const s1 = computeSequenceItemMetrics({
      mission,
      column: rexColumn,
      item: stationItem("s1", "Station 1"),
    });
    expect(s1.actualSampleMass).toBe(0.13);
    expect(s1.actionsCompleteCount).toBe(1);
    expect(s1.actionsSkippedCount).toBe(1);
    // Position track is REX-level, not attributable per station.
    expect(s1.actualDistanceWalked).toBeNull();

    const s2 = computeSequenceItemMetrics({
      mission,
      column: rexColumn,
      item: stationItem("s2", "Station 2"),
    });
    expect(s2.actualSampleMass).toBe(0.21);
    expect(s2.actionsCompleteCount).toBe(1);
    expect(s2.actionsSkippedCount).toBe(0);
  });

  test("missing EVA or missing station yields all-null values", () => {
    const { mission } = buildFixture();
    const ghostEva = computeSequenceItemMetrics({
      mission,
      column: { ...evaColumn, evaUuid: "ghost" },
      item: stationItem("s1", "Station 1"),
    });
    for (const row of EVA_COMPARISON_METRIC_ROWS) expect(ghostEva[row.id]).toBeNull();

    const ghostStation = computeSequenceItemMetrics({
      mission,
      column: evaColumn,
      item: stationItem("ghost", "Ghost"),
    });
    for (const row of EVA_COMPARISON_METRIC_ROWS) expect(ghostStation[row.id]).toBeNull();
  });
});

describe("getMaxDistanceFromLander()", () => {
  test("picks the farthest of station locations and traverse path points", () => {
    const { mission } = buildFixture();
    // Alpha: farthest is s2 at lng 0.1
    expect(getMaxDistanceFromLander(mission, "eva1")).toBe(
      getDistanceBetweenTwoCoordinates({ lat: 0, lng: 0.1 }, LANDER, RADIUS)
    );
    // Bravo: farthest is the traverse point at lng 0.3
    expect(getMaxDistanceFromLander(mission, "eva2")).toBe(
      getDistanceBetweenTwoCoordinates({ lat: 0, lng: 0.3 }, LANDER, RADIUS)
    );
  });

  test("returns 0 when there is no lander location", () => {
    const { mission } = buildFixture();
    mission.landerLocation = { lat: null, lng: null };
    expect(getMaxDistanceFromLander(mission, "eva1")).toBe(0);
  });

  test("returns 0 for a missing EVA", () => {
    const { mission } = buildFixture();
    expect(getMaxDistanceFromLander(mission, "ghost")).toBe(0);
  });
});

describe("getActualDistanceWalked()", () => {
  test("totals the great-circle length of the recorded position track", () => {
    const { mission } = buildFixture();
    const rex = mission.rexes["rex1"];
    expect(getActualDistanceWalked(rex, RADIUS)).toBe(
      getTotalDistance(
        [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.05 },
          { lat: 0, lng: 0.1 },
        ],
        RADIUS
      )
    );
  });

  test("skips null locations and returns 0 with fewer than two usable points", () => {
    const noTrack = generateBlankRex({ uuid: "r0", evaUuid: "rexEva1", name: "r0" });
    expect(getActualDistanceWalked(noTrack, RADIUS)).toBe(0);

    const oneNull = generateBlankRex({
      uuid: "r1",
      evaUuid: "rexEva1",
      name: "r1",
      posEntries: [
        generateBlankPosEntry({ location: null }),
        generateBlankPosEntry({ location: { lat: 0, lng: 0.05 } }),
      ],
    });
    expect(getActualDistanceWalked(oneNull, RADIUS)).toBe(0);
  });

  test("defaults to the Moon radius when none is supplied", () => {
    const { mission } = buildFixture();
    const rex = mission.rexes["rex1"];
    expect(getActualDistanceWalked(rex)).toBe(getActualDistanceWalked(rex, RADIUS));
  });
});
