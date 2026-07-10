import {
  computeColumnCoverage,
  diffLevel3,
  diffLevel3Actions,
  diffRuleActions,
  getCoverageDifferences,
  getEvaSequenceItems,
  groupMatchesBySequenceItem,
} from "utils/stmEvaCoverage";
import {
  getActionRexStatus,
  getEligibleActionsForColumn,
  getEvaColumns,
  groupCoverageColumns,
  STM_COVERAGE_ORPHAN_GROUP_KEY,
  STM_COVERAGE_ORPHAN_GROUP_LABEL,
} from "utils/evaReportColumns";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankRex } from "store/storeUtils/rex";
import { generateBlankStmLvl3, generateBlankStmRule } from "store/storeUtils/stm";

/**
 * Fixture: one as-planned EVA ("Alpha") with stations s1, s2 and traverse t1,
 * plus a REX copy of it. Actions use verb/noun/adjective uuids v1/n1/a1.
 */
const buildFixture = () => {
  const mission = generateBlankMission({ actionSystemVersion: 2 });

  const s1 = generateBlankStation({ uuid: "s1", name: "Station 1" });
  const s2 = generateBlankStation({ uuid: "s2", name: "Station 2" });
  const t1 = generateBlankTraverse({ uuid: "t1", name: "Traverse 1" });
  mission.stations = { s1, s2 };
  mission.traverses = { t1 };

  const eva = generateBlankEVA({
    uuid: "eva1",
    name: "Alpha",
    sequence: [
      { type: "traverse", uuid: "t1" },
      { type: "station", uuid: "s1" },
      { type: "station", uuid: "s2" },
    ],
  });
  mission.evas = { eva1: eva };

  const makeAction = (partial: Partial<Action>): Action =>
    generateBlankAction({
      stmAction: true,
      actionDefinition: { verbUuid: "v1", nounUuid: "n1", adjectiveUuid: "a1" },
      ...partial,
    });

  return { mission, makeAction };
};

const makeRule = (partial: Partial<STMRule>): STMRule => ({
  ...generateBlankStmRule({ stmUuid: "stm1" }),
  verbUuids: ["v1"],
  nounUuids: ["n1"],
  adjectiveUuids: ["a1"],
  ...partial,
});

const asPlannedColumn: EvaReportColumn = {
  key: "eva1",
  kind: "eva",
  evaUuid: "eva1",
  isRex: false,
  label: "Alpha",
  groupKey: "eva1",
  groupLabel: "Alpha",
};

describe("getEvaColumns()", () => {
  test("groups each as-planned EVA with its rexes: plan column then rex columns sorted by rex name", () => {
    const { mission } = buildFixture();
    mission.evas["eva2"] = generateBlankEVA({ uuid: "eva2", name: "Bravo", sequence: [] });
    // REX EVA copy of Alpha: blank name, refUuid preserved from the source
    // EVA (as stageDuplicateEva does), referenced by two rexes
    mission.evas["rexEva1"] = generateBlankEVA({
      uuid: "rexEva1",
      name: "",
      refUuid: mission.evas["eva1"].refUuid,
      sequence: [],
    });
    mission.rexes = {
      rexB: generateBlankRex({ uuid: "rexB", evaUuid: "rexEva1", name: "Rex Bravo" }),
      rexA: generateBlankRex({ uuid: "rexA", evaUuid: "rexEva1", name: "Rex Alpha" }),
    };

    const columns = getEvaColumns(mission);
    expect(columns.map((c) => c.key)).toEqual(["eva1", "rexA", "rexB", "eva2"]);
    // REX columns label with their as-planned EVA's name (the header prefixes
    // "REX:"); both rexes copy Alpha, so both read "Alpha".
    expect(columns.map((c) => c.label)).toEqual(["Alpha", "Alpha", "Alpha", "Bravo"]);
    expect(columns.map((c) => c.isRex)).toEqual([false, true, true, false]);
    expect(columns.map((c) => c.groupKey)).toEqual(["eva1", "eva1", "eva1", "eva2"]);
    expect(columns.map((c) => c.groupLabel)).toEqual(["Alpha", "Alpha", "Alpha", "Bravo"]);
    expect(columns[1].evaUuid).toBe("rexEva1");
  });

  test("rex whose EVA matches no as-planned refUuid lands in the trailing orphan group", () => {
    const { mission } = buildFixture();
    // rexEva with its own (unmatched) refUuid
    mission.evas["rexEva1"] = generateBlankEVA({ uuid: "rexEva1", name: "", sequence: [] });
    mission.rexes = {
      rexX: generateBlankRex({ uuid: "rexX", evaUuid: "rexEva1", name: "Rex X" }),
    };

    const columns = getEvaColumns(mission);
    expect(columns.map((c) => c.key)).toEqual(["eva1", "rexX"]);
    expect(columns[1].groupKey).toBe(STM_COVERAGE_ORPHAN_GROUP_KEY);
    expect(columns[1].groupLabel).toBe(STM_COVERAGE_ORPHAN_GROUP_LABEL);
  });

  test("mission with no rexes returns only as-planned columns", () => {
    const { mission } = buildFixture();
    const columns = getEvaColumns(mission);
    expect(columns).toHaveLength(1);
    expect(columns[0]).toEqual(asPlannedColumn);
  });

  test("rex pointing at a missing EVA is skipped", () => {
    const { mission } = buildFixture();
    mission.rexes = {
      rexX: generateBlankRex({ uuid: "rexX", evaUuid: "ghost", name: "Ghost" }),
    };
    expect(getEvaColumns(mission)).toHaveLength(1);
  });
});

describe("groupCoverageColumns()", () => {
  test("chunks consecutive columns sharing a groupKey, keeping a group whose plan column is hidden", () => {
    const rexColumn = (key: string, groupKey: string, groupLabel: string): EvaReportColumn => ({
      key,
      kind: "rex",
      evaUuid: `${key}Eva`,
      isRex: true,
      rexUuid: key,
      label: key,
      groupKey,
      groupLabel,
    });
    const groups = groupCoverageColumns([
      asPlannedColumn,
      rexColumn("rexA", "eva1", "Alpha"),
      // eva2's plan column hidden: its rex still forms an "eva2" group
      rexColumn("rexB", "eva2", "Bravo"),
    ]);
    expect(groups.map((g) => g.groupKey)).toEqual(["eva1", "eva2"]);
    expect(groups[0].columns.map((c) => c.key)).toEqual(["eva1", "rexA"]);
    expect(groups[1].columns.map((c) => c.key)).toEqual(["rexB"]);
    expect(groups[1].groupLabel).toBe("Bravo");
  });
});

describe("getEligibleActionsForColumn()", () => {
  test("includes stmAction actions at the EVA's stations and traverses only", () => {
    const { mission, makeAction } = buildFixture();
    const atS1 = makeAction({ uuid: "act1", stationUuid: "s1" });
    const atT1 = makeAction({ uuid: "act2", traverseUuid: "t1" });
    const notStm = makeAction({ uuid: "act3", stationUuid: "s1", stmAction: false });
    const disabled = makeAction({ uuid: "act4", stationUuid: "s1", enabled: false });
    const atPoi = makeAction({ uuid: "act5", poiUuid: "poi1" });
    const otherStation = makeAction({ uuid: "act6", stationUuid: "elsewhere" });
    mission.actions = {
      act1: atS1,
      act2: atT1,
      act3: notStm,
      act4: disabled,
      act5: atPoi,
      act6: otherStation,
    };

    const eligible = getEligibleActionsForColumn({
      mission,
      column: asPlannedColumn,
      rexStatusFilter: "all",
    });
    expect(eligible.map((a) => a.uuid).sort()).toEqual(["act1", "act2"]);
  });

  test("rex-status filter: notSkipped and completeOnly", () => {
    const { mission, makeAction } = buildFixture();
    mission.actions = {
      done: makeAction({ uuid: "done", stationUuid: "s1" }),
      skipped: makeAction({ uuid: "skipped", stationUuid: "s1" }),
      pending: makeAction({ uuid: "pending", stationUuid: "s2" }),
      nullStatus: makeAction({ uuid: "nullStatus", stationUuid: "s2" }),
    };
    mission.rexes = {
      rex1: generateBlankRex({
        uuid: "rex1",
        evaUuid: "eva1",
        name: "Rex 1",
        actionEntries: {
          done: { rexStatus: "complete" },
          skipped: { rexStatus: "skipped" },
          nullStatus: { rexStatus: null },
        },
      }),
    };
    const column: EvaReportColumn = {
      key: "rex1",
      kind: "rex",
      evaUuid: "eva1",
      isRex: true,
      rexUuid: "rex1",
      label: "Rex 1",
      groupKey: "eva1",
      groupLabel: "Alpha",
    };

    const all = getEligibleActionsForColumn({ mission, column, rexStatusFilter: "all" });
    expect(all).toHaveLength(4);

    const notSkipped = getEligibleActionsForColumn({
      mission,
      column,
      rexStatusFilter: "notSkipped",
    });
    expect(notSkipped.map((a) => a.uuid).sort()).toEqual(["done", "nullStatus", "pending"]);

    const completeOnly = getEligibleActionsForColumn({
      mission,
      column,
      rexStatusFilter: "completeOnly",
    });
    expect(completeOnly.map((a) => a.uuid)).toEqual(["done"]);
  });

  test("rex with null actionEntries treats every action as pending", () => {
    const { mission, makeAction } = buildFixture();
    mission.actions = { act1: makeAction({ uuid: "act1", stationUuid: "s1" }) };
    mission.rexes = {
      rex1: generateBlankRex({ uuid: "rex1", evaUuid: "eva1", name: "Rex 1", actionEntries: null }),
    };
    const column: EvaReportColumn = {
      key: "rex1",
      kind: "rex",
      evaUuid: "eva1",
      isRex: true,
      rexUuid: "rex1",
      label: "Rex 1",
      groupKey: "eva1",
      groupLabel: "Alpha",
    };

    expect(getActionRexStatus(mission.rexes["rex1"], "act1")).toBe("pending");
    expect(
      getEligibleActionsForColumn({ mission, column, rexStatusFilter: "notSkipped" })
    ).toHaveLength(1);
    expect(
      getEligibleActionsForColumn({ mission, column, rexStatusFilter: "completeOnly" })
    ).toHaveLength(0);
  });
});

describe("computeColumnCoverage()", () => {
  const level3s = [generateBlankStmLvl3({ uuid: "stm1" }), generateBlankStmLvl3({ uuid: "stm2" })];

  test("satisfied when matches meet the rule count, per-rule details populated", () => {
    const { mission, makeAction } = buildFixture();
    mission.actions = {
      act1: makeAction({ uuid: "act1", stationUuid: "s1" }),
      act2: makeAction({ uuid: "act2", stationUuid: "s2" }),
    };
    const rule = makeRule({ uuid: "rule1", count: 2 });

    const coverage = computeColumnCoverage({
      mission,
      level3s,
      rules: [rule],
      column: asPlannedColumn,
      rexStatusFilter: "all",
    });

    expect(coverage["stm1"].status).toBe("satisfied");
    expect(coverage["stm1"].totalMatches).toBe(2);
    expect(coverage["stm1"].rules[0]).toEqual({
      ruleUuid: "rule1",
      matchCount: 2,
      required: 2,
      satisfied: true,
      matchingActionUuids: ["act1", "act2"],
    });
    // stm2 has no rules
    expect(coverage["stm2"].status).toBe("noRules");
    expect(coverage["stm2"].totalMatches).toBe(0);
  });

  test("partial when there are matches but not all rules are satisfied", () => {
    const { mission, makeAction } = buildFixture();
    mission.actions = { act1: makeAction({ uuid: "act1", stationUuid: "s1" }) };
    const needsThree = makeRule({ uuid: "rule1", count: 3 });

    const coverage = computeColumnCoverage({
      mission,
      level3s,
      rules: [needsThree],
      column: asPlannedColumn,
      rexStatusFilter: "all",
    });
    expect(coverage["stm1"].status).toBe("partial");
    expect(coverage["stm1"].totalMatches).toBe(1);
  });

  test("none when no eligible action matches any rule", () => {
    const { mission, makeAction } = buildFixture();
    mission.actions = {
      act1: makeAction({
        uuid: "act1",
        stationUuid: "s1",
        actionDefinition: { verbUuid: "otherVerb", nounUuid: "n1", adjectiveUuid: "a1" },
      }),
    };
    const coverage = computeColumnCoverage({
      mission,
      level3s,
      rules: [makeRule({ uuid: "rule1" })],
      column: asPlannedColumn,
      rexStatusFilter: "all",
    });
    expect(coverage["stm1"].status).toBe("none");
  });

  test("wildcard Any rules match any populated definition, but not missing dimensions", () => {
    const { mission, makeAction } = buildFixture();
    mission.actions = {
      full: makeAction({ uuid: "full", stationUuid: "s1" }),
      noDef: makeAction({ uuid: "noDef", stationUuid: "s1", actionDefinition: null }),
      partialDef: makeAction({
        uuid: "partialDef",
        stationUuid: "s2",
        // adjectiveUuid missing: json-logic "!!" on a missing var is false,
        // so this does not match adjectiveAny
        actionDefinition: { verbUuid: "v9", nounUuid: "n9" },
      }),
    };
    const anyRule = makeRule({
      uuid: "rule1",
      count: 1,
      verbUuids: [],
      nounUuids: [],
      adjectiveUuids: [],
      verbAny: true,
      nounAny: true,
      adjectiveAny: true,
    });

    const coverage = computeColumnCoverage({
      mission,
      level3s,
      rules: [anyRule],
      column: asPlannedColumn,
      rexStatusFilter: "all",
    });
    expect(coverage["stm1"].rules[0].matchingActionUuids).toEqual(["full"]);
  });

  test("EVA with an empty sequence yields none for ruled level3s", () => {
    const { mission } = buildFixture();
    mission.evas["eva1"].sequence = [];
    const coverage = computeColumnCoverage({
      mission,
      level3s,
      rules: [makeRule({ uuid: "rule1" })],
      column: asPlannedColumn,
      rexStatusFilter: "all",
    });
    expect(coverage["stm1"].status).toBe("none");
  });
});

describe("diffLevel3()", () => {
  const coverageOf = (counts: { [ruleUuid: string]: [number, number] }): StmCoverageLevel3 => {
    const rules = Object.entries(counts).map(([ruleUuid, [matchCount, required]]) => ({
      ruleUuid,
      matchCount,
      required,
      satisfied: matchCount >= required,
      matchingActionUuids: [] as string[],
    }));
    const totalMatches = rules.reduce((acc, rc) => acc + rc.matchCount, 0);
    const allSatisfied = rules.every((rc) => rc.satisfied);
    return {
      stmUuid: "stm1",
      status:
        rules.length === 0
          ? "noRules"
          : allSatisfied
            ? "satisfied"
            : totalMatches > 0
              ? "partial"
              : "none",
      rules,
      totalMatches,
    };
  };

  test("reports delta and status change", () => {
    const baseline = coverageOf({ rule1: [2, 2] }); // satisfied
    const other = coverageOf({ rule1: [1, 2] }); // partial
    expect(diffLevel3(baseline, other)).toEqual({ delta: -1, statusChanged: true, equal: false });
  });

  test("equal requires identical per-rule counts, not just an equal total", () => {
    const baseline = coverageOf({ rule1: [2, 3], rule2: [0, 1] }); // partial, total 2
    const shuffled = coverageOf({ rule1: [1, 3], rule2: [1, 1] }); // partial, total 2
    const identical = coverageOf({ rule1: [2, 3], rule2: [0, 1] });
    expect(diffLevel3(baseline, shuffled).equal).toBe(false);
    expect(diffLevel3(baseline, shuffled).delta).toBe(0);
    expect(diffLevel3(baseline, identical).equal).toBe(true);
  });
});

describe("diffRuleActions()", () => {
  const { makeAction } = buildFixture();
  const uuids = (actions: Action[]): string[] => actions.map((a) => a.uuid);

  test("identical tuples on both sides all pair as matched", () => {
    const baselineActions = [makeAction({ uuid: "b1", stationUuid: "s1" })];
    const selectedActions = [makeAction({ uuid: "c1", stationUuid: "s1" })];
    const diff = diffRuleActions({ baselineActions, selectedActions });
    expect(uuids(diff.matched)).toEqual(["c1"]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  test("multiset pairing: surplus selected actions become added, surplus baseline become removed", () => {
    const twoBaseline = [makeAction({ uuid: "b1" }), makeAction({ uuid: "b2" })];
    const threeSelected = [
      makeAction({ uuid: "c1" }),
      makeAction({ uuid: "c2" }),
      makeAction({ uuid: "c3" }),
    ];

    const moreSelected = diffRuleActions({
      baselineActions: twoBaseline,
      selectedActions: threeSelected,
    });
    expect(uuids(moreSelected.matched)).toEqual(["c1", "c2"]);
    expect(uuids(moreSelected.added)).toEqual(["c3"]);
    expect(moreSelected.removed).toEqual([]);

    const moreBaseline = diffRuleActions({
      baselineActions: threeSelected,
      selectedActions: twoBaseline,
    });
    expect(uuids(moreBaseline.matched)).toEqual(["b1", "b2"]);
    expect(moreBaseline.added).toEqual([]);
    expect(uuids(moreBaseline.removed)).toEqual(["c3"]);
  });

  test("station and traverse parents are ignored: same tuple pairs across locations", () => {
    const diff = diffRuleActions({
      baselineActions: [makeAction({ uuid: "b1", stationUuid: "s1" })],
      selectedActions: [makeAction({ uuid: "c1", traverseUuid: "t1" })],
    });
    expect(uuids(diff.matched)).toEqual(["c1"]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  test("disjoint tuples yield only added and removed", () => {
    const diff = diffRuleActions({
      baselineActions: [
        makeAction({
          uuid: "b1",
          actionDefinition: { verbUuid: "v2", nounUuid: "n1", adjectiveUuid: "a1" },
        }),
      ],
      selectedActions: [makeAction({ uuid: "c1" })],
    });
    expect(diff.matched).toEqual([]);
    expect(uuids(diff.added)).toEqual(["c1"]);
    expect(uuids(diff.removed)).toEqual(["b1"]);
  });

  test("null actionDefinitions share the empty tuple and pair with each other", () => {
    const bothNull = diffRuleActions({
      baselineActions: [makeAction({ uuid: "b1", actionDefinition: null })],
      selectedActions: [makeAction({ uuid: "c1", actionDefinition: null })],
    });
    expect(uuids(bothNull.matched)).toEqual(["c1"]);

    const oneNull = diffRuleActions({
      baselineActions: [makeAction({ uuid: "b1", actionDefinition: null })],
      selectedActions: [makeAction({ uuid: "c1" })],
    });
    expect(oneNull.matched).toEqual([]);
    expect(uuids(oneNull.added)).toEqual(["c1"]);
    expect(uuids(oneNull.removed)).toEqual(["b1"]);
  });

  test("a partial tuple does not pair with a full tuple sharing its populated dimensions", () => {
    const diff = diffRuleActions({
      baselineActions: [
        makeAction({ uuid: "b1", actionDefinition: { verbUuid: "v1", nounUuid: "n1" } }),
      ],
      selectedActions: [makeAction({ uuid: "c1" })],
    });
    expect(diff.matched).toEqual([]);
    expect(uuids(diff.added)).toEqual(["c1"]);
    expect(uuids(diff.removed)).toEqual(["b1"]);
  });

  test("empty sides: everything added when baseline is empty, everything removed when selected is empty", () => {
    const actions = [makeAction({ uuid: "x1" }), makeAction({ uuid: "x2" })];
    const emptyBaseline = diffRuleActions({ baselineActions: [], selectedActions: actions });
    expect(uuids(emptyBaseline.added)).toEqual(["x1", "x2"]);
    expect(emptyBaseline.matched).toEqual([]);
    expect(emptyBaseline.removed).toEqual([]);

    const emptySelected = diffRuleActions({ baselineActions: actions, selectedActions: [] });
    expect(uuids(emptySelected.removed)).toEqual(["x1", "x2"]);
    expect(emptySelected.matched).toEqual([]);
    expect(emptySelected.added).toEqual([]);
  });

  test("added keeps selected-input order and removed keeps baseline-input order across mixed tuples", () => {
    const tuple = (verbUuid: string): ActionDefinition => ({
      verbUuid,
      nounUuid: "n1",
      adjectiveUuid: "a1",
    });
    const diff = diffRuleActions({
      baselineActions: [
        makeAction({ uuid: "b1", actionDefinition: tuple("vOnlyBaseline1") }),
        makeAction({ uuid: "b2", actionDefinition: tuple("vShared") }),
        makeAction({ uuid: "b3", actionDefinition: tuple("vOnlyBaseline2") }),
      ],
      selectedActions: [
        makeAction({ uuid: "c1", actionDefinition: tuple("vOnlySelected1") }),
        makeAction({ uuid: "c2", actionDefinition: tuple("vShared") }),
        makeAction({ uuid: "c3", actionDefinition: tuple("vOnlySelected2") }),
      ],
    });
    expect(uuids(diff.matched)).toEqual(["c2"]);
    expect(uuids(diff.added)).toEqual(["c1", "c3"]);
    expect(uuids(diff.removed)).toEqual(["b1", "b3"]);
  });
});

describe("diffLevel3Actions()", () => {
  const { mission, makeAction } = buildFixture();
  mission.actions = {
    a1: makeAction({ uuid: "a1" }),
    a2: makeAction({ uuid: "a2" }),
    // same rule-set match, different tuple (v2 instead of v1)
    b1: makeAction({
      uuid: "b1",
      actionDefinition: { verbUuid: "v2", nounUuid: "n1", adjectiveUuid: "a1" },
    }),
  };
  const level3CoverageOf = (
    rules: { ruleUuid: string; actionUuids: string[] }[]
  ): StmCoverageLevel3 => ({
    stmUuid: "stm1",
    status: "partial",
    rules: rules.map(({ ruleUuid, actionUuids }) => ({
      ruleUuid,
      matchCount: actionUuids.length,
      required: 1,
      satisfied: actionUuids.length >= 1,
      matchingActionUuids: actionUuids,
    })),
    totalMatches: rules.reduce((acc, r) => acc + r.actionUuids.length, 0),
  });

  test("identical action sets per rule yield no added/removed", () => {
    const baseline = level3CoverageOf([{ ruleUuid: "rule1", actionUuids: ["a1", "a2"] }]);
    const other = level3CoverageOf([{ ruleUuid: "rule1", actionUuids: ["a1", "a2"] }]);
    expect(diffLevel3Actions({ mission, baseline, other })).toEqual({ added: 0, removed: 0 });
  });

  test("counts surplus actions as added or removed per rule", () => {
    const baseline = level3CoverageOf([{ ruleUuid: "rule1", actionUuids: ["a1"] }]);
    const other = level3CoverageOf([{ ruleUuid: "rule1", actionUuids: ["a1", "a2"] }]);
    expect(diffLevel3Actions({ mission, baseline, other })).toEqual({ added: 1, removed: 0 });
    expect(diffLevel3Actions({ mission, baseline: other, other: baseline })).toEqual({
      added: 0,
      removed: 1,
    });
  });

  test("equal match counts with different tuples report both added and removed", () => {
    const baseline = level3CoverageOf([{ ruleUuid: "rule1", actionUuids: ["a1"] }]);
    const other = level3CoverageOf([{ ruleUuid: "rule1", actionUuids: ["b1"] }]);
    expect(diffLevel3Actions({ mission, baseline, other })).toEqual({ added: 1, removed: 1 });
  });

  test("a rule present on only one side counts wholly as added or removed", () => {
    const baseline = level3CoverageOf([{ ruleUuid: "ruleOld", actionUuids: ["a1", "a2"] }]);
    const other = level3CoverageOf([{ ruleUuid: "ruleNew", actionUuids: ["b1"] }]);
    expect(diffLevel3Actions({ mission, baseline, other })).toEqual({ added: 1, removed: 2 });
  });

  test("deleted action uuids are ignored on both sides", () => {
    const baseline = level3CoverageOf([{ ruleUuid: "rule1", actionUuids: ["ghost1"] }]);
    const other = level3CoverageOf([{ ruleUuid: "rule1", actionUuids: ["a1", "ghost2"] }]);
    expect(diffLevel3Actions({ mission, baseline, other })).toEqual({ added: 1, removed: 0 });
  });
});

describe("getCoverageDifferences()", () => {
  const cellOf = (matchCount: number, required = 3): StmCoverageLevel3 => ({
    stmUuid: "ignored",
    status: matchCount >= required ? "satisfied" : matchCount > 0 ? "partial" : "none",
    rules: [
      {
        ruleUuid: "rule1",
        matchCount,
        required,
        satisfied: matchCount >= required,
        matchingActionUuids: [],
      },
    ],
    totalMatches: matchCount,
  });
  const makeColumn = (key: string): EvaReportColumn => ({
    key,
    kind: "eva",
    evaUuid: key,
    isRex: false,
    label: key,
    groupKey: key,
    groupLabel: key,
  });
  const level3s = [generateBlankStmLvl3({ uuid: "stmA" }), generateBlankStmLvl3({ uuid: "stmB" })];
  const { mission, makeAction } = buildFixture();

  test("collects only the rows and columns that differ from the baseline; baseline never included", () => {
    const columns = [makeColumn("base"), makeColumn("same"), makeColumn("diff")];
    const coverageByColumnKey = {
      base: { stmA: cellOf(2), stmB: cellOf(1) },
      same: { stmA: cellOf(2), stmB: cellOf(1) },
      diff: { stmA: cellOf(2), stmB: cellOf(0) },
    };

    const { stmUuids, columnKeys } = getCoverageDifferences({
      mission,
      coverageByColumnKey,
      columns,
      baselineKey: "base",
      level3s,
    });
    expect([...stmUuids]).toEqual(["stmB"]);
    expect([...columnKeys]).toEqual(["diff"]);
  });

  test("returns empty sets when every column matches the baseline or baseline coverage is missing", () => {
    const columns = [makeColumn("base"), makeColumn("same")];
    const coverageByColumnKey = {
      base: { stmA: cellOf(2), stmB: cellOf(0) },
      same: { stmA: cellOf(2), stmB: cellOf(0) },
    };

    const allEqual = getCoverageDifferences({
      mission,
      coverageByColumnKey,
      columns,
      baselineKey: "base",
      level3s,
    });
    expect(allEqual.stmUuids.size).toBe(0);
    expect(allEqual.columnKeys.size).toBe(0);

    const missingBaseline = getCoverageDifferences({
      mission,
      coverageByColumnKey,
      columns,
      baselineKey: "ghost",
      level3s,
    });
    expect(missingBaseline.stmUuids.size).toBe(0);
    expect(missingBaseline.columnKeys.size).toBe(0);
  });

  test("detects a cell with equal per-rule counts but different action tuples", () => {
    const tupleMission = { ...mission };
    tupleMission.actions = {
      a1: makeAction({ uuid: "a1" }),
      b1: makeAction({
        uuid: "b1",
        actionDefinition: { verbUuid: "v2", nounUuid: "n1", adjectiveUuid: "a1" },
      }),
    };
    const cellWith = (actionUuids: string[]): StmCoverageLevel3 => ({
      stmUuid: "ignored",
      status: "partial",
      rules: [
        {
          ruleUuid: "rule1",
          matchCount: actionUuids.length,
          required: 3,
          satisfied: false,
          matchingActionUuids: actionUuids,
        },
      ],
      totalMatches: actionUuids.length,
    });
    const columns = [makeColumn("base"), makeColumn("swapped")];
    const coverageByColumnKey = {
      base: { stmA: cellWith(["a1"]), stmB: cellOf(0) },
      swapped: { stmA: cellWith(["b1"]), stmB: cellOf(0) },
    };

    const { stmUuids, columnKeys } = getCoverageDifferences({
      mission: tupleMission,
      coverageByColumnKey,
      columns,
      baselineKey: "base",
      level3s,
    });
    expect([...stmUuids]).toEqual(["stmA"]);
    expect([...columnKeys]).toEqual(["swapped"]);
  });
});

describe("groupMatchesBySequenceItem()", () => {
  test("station and traverse counts sum to totalMatches, double-counting shared actions", () => {
    const { mission, makeAction } = buildFixture();
    mission.actions = {
      act1: makeAction({ uuid: "act1", stationUuid: "s1" }),
      act2: makeAction({ uuid: "act2", stationUuid: "s1" }),
      act3: makeAction({ uuid: "act3", traverseUuid: "t1" }),
    };
    // two rules that both match every action: each action counts once per rule
    const rules = [makeRule({ uuid: "rule1", count: 1 }), makeRule({ uuid: "rule2", count: 6 })];
    const coverage = computeColumnCoverage({
      mission,
      level3s: [generateBlankStmLvl3({ uuid: "stm1" })],
      rules,
      column: asPlannedColumn,
      rexStatusFilter: "all",
    });

    const grouped = groupMatchesBySequenceItem({ mission, level3Coverage: coverage["stm1"] });
    expect(grouped.stations).toEqual({ s1: 4 });
    expect(grouped.traverses).toEqual({ t1: 2 });
    expect(4 + 2).toBe(coverage["stm1"].totalMatches);
  });
});

describe("getEvaSequenceItems()", () => {
  test("returns stations and traverses interleaved in EVA sequence order", () => {
    const { mission } = buildFixture();
    const items = getEvaSequenceItems(mission, "eva1");
    expect(items.map((item) => `${item.type}:${item.uuid}`)).toEqual([
      "traverse:t1",
      "station:s1",
      "station:s2",
    ]);
    expect(items.map((item) => item.name)).toEqual(["Traverse 1", "Station 1", "Station 2"]);
  });

  test("skips deleted entities, dedupes revisits, and appends non-lander ingress/egress stations", () => {
    const { mission } = buildFixture();
    mission.stations["s3"] = generateBlankStation({ uuid: "s3", name: "Egress" });
    mission.evas["eva1"].sequence = [
      { type: "station", uuid: "s1" },
      { type: "traverse", uuid: "t1" },
      { type: "station", uuid: "s1" }, // revisit
      { type: "station", uuid: "ghost" }, // deleted
      { type: "traverse", uuid: "ghostTrav" }, // deleted
    ];
    mission.evas["eva1"].egressLocationUuid = "s3";

    const items = getEvaSequenceItems(mission, "eva1");
    expect(items.map((item) => `${item.type}:${item.uuid}`)).toEqual([
      "station:s1",
      "traverse:t1",
      "station:s3",
    ]);
  });

  test("missing EVA yields an empty list", () => {
    const { mission } = buildFixture();
    expect(getEvaSequenceItems(mission, "ghost")).toEqual([]);
  });
});
