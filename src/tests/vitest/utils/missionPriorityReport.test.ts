import {
  computePriorityColumnCoverage,
  computePriorityUnscheduledUsages,
  diffPriorityActions,
  diffPriorityCell,
  explainMissingBaselineAction,
  getActionLineagePriorityMismatch,
  getPriorityActionsForColumn,
  getPriorityCoverageDifferences,
  getSortedMissionPriorityCategories,
  groupCampaignPriorityMatchesByMemberEva,
  groupPriorityMatchesBySequenceItem,
  resolveActionMissionPriority,
} from "utils/missionPriorityReport";
import { getEvaColumns } from "utils/evaReportColumns";
import { generateBlankActionTemplate, generateBlankMission } from "store/storeUtils/mission";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankRex } from "store/storeUtils/rex";
import { generateBlankPoi } from "store/storeUtils/poi";

const buildFixture = () => {
  const mission = generateBlankMission({ actionSystemVersion: 2 });
  mission.missionPriorities = {
    p10: { trace: "SIMD-0010.1", category: "Sample Collection" },
    p2: { trace: "SIMD-0002.1", category: "Sample Collection" },
    pGeo: { trace: "GEO-0001.1", category: "Field Geology" },
  };
  mission.stations = {
    s1: generateBlankStation({ uuid: "s1", refUuid: "ref-s1", name: "Station 1" }),
    s2: generateBlankStation({ uuid: "s2", refUuid: "ref-s2", name: "Station 2" }),
  };
  mission.traverses = {
    t1: generateBlankTraverse({ uuid: "t1", refUuid: "ref-t1", name: "Traverse 1" }),
  };
  mission.evas = {
    eva1: generateBlankEVA({
      uuid: "eva1",
      refUuid: "ref-eva1",
      name: "Alpha",
      sequence: [
        { type: "traverse", uuid: "t1" },
        { type: "station", uuid: "s1" },
        { type: "station", uuid: "s2" },
      ],
    }),
  };
  return { mission };
};

const alphaColumn: EvaReportColumn = {
  key: "eva1",
  kind: "eva",
  evaUuid: "eva1",
  isRex: false,
  label: "Alpha",
  groupKey: "eva1",
  groupLabel: "Alpha",
};

describe("getSortedMissionPriorityCategories()", () => {
  test("sorts categories alphabetically and traces with numeric collation (SIMD-0002 before SIMD-0010)", () => {
    const { mission } = buildFixture();
    mission.missionPriorities!.p3 = { trace: "SIMD-0003.2", category: "Sample Collection" };

    const groups = getSortedMissionPriorityCategories(mission);
    expect(groups.map((g) => g.category)).toEqual(["Field Geology", "Sample Collection"]);
    expect(groups[0].items.map((item) => item.trace)).toEqual(["GEO-0001.1"]);
    expect(groups[1].items.map((item) => item.trace)).toEqual([
      "SIMD-0002.1",
      "SIMD-0003.2",
      "SIMD-0010.1",
    ]);
  });

  test("returns empty array when missionPriorities is null or empty", () => {
    const { mission } = buildFixture();
    mission.missionPriorities = null;
    expect(getSortedMissionPriorityCategories(mission)).toEqual([]);
  });
});

describe("resolveActionMissionPriority()", () => {
  test("resolves direct missionPriorityUuid on both STM and non-STM actions", () => {
    const { mission } = buildFixture();
    const stmAction = generateBlankAction({
      uuid: "a1",
      stmAction: true,
      missionPriorityUuid: "p2",
    });
    const nonStmAction = generateBlankAction({
      uuid: "a2",
      stmAction: false,
      name: "Deploy instrument",
      missionPriorityUuid: "pGeo",
    });

    expect(resolveActionMissionPriority(stmAction, mission)).toEqual({
      priorityUuid: "p2",
      trace: "SIMD-0002.1",
      category: "Sample Collection",
      fromLegacyAdjective: false,
    });
    expect(resolveActionMissionPriority(nonStmAction, mission)).toEqual({
      priorityUuid: "pGeo",
      trace: "GEO-0001.1",
      category: "Field Geology",
      fromLegacyAdjective: false,
    });
  });

  test("maps legacy adjective-encoded priorities to matching missionPriorities entry", () => {
    const { mission } = buildFixture();
    mission.actionDefinitions = {
      verbs: { v1: { name: "Collect", abbr: "c" } },
      nouns: { n1: { name: "Core", abbr: "co" } },
      adjectives: { adjPri: { name: "Pri: simd-0002.1", abbr: "p" } },
    };
    const legacyAction = generateBlankAction({
      uuid: "legacy",
      stmAction: true,
      missionPriorityUuid: null,
      actionDefinition: { verbUuid: "v1", nounUuid: "n1", adjectiveUuid: "adjPri" },
    });

    expect(resolveActionMissionPriority(legacyAction, mission)).toEqual({
      priorityUuid: "p2",
      trace: "SIMD-0002.1",
      category: "Sample Collection",
      fromLegacyAdjective: true,
    });
  });
});

describe("computePriorityColumnCoverage() — plan columns & disabled actions", () => {
  test("includes both STM and non-STM actions and separates enabled vs disabled actions", () => {
    const { mission } = buildFixture();
    mission.actions = {
      aStm: generateBlankAction({
        uuid: "aStm",
        stationUuid: "s1",
        stmAction: true,
        enabled: true,
        missionPriorityUuid: "p2",
      }),
      aNonStm: generateBlankAction({
        uuid: "aNonStm",
        traverseUuid: "t1",
        stmAction: false,
        name: "Walk survey",
        enabled: true,
        missionPriorityUuid: "p2",
      }),
      aDisabled: generateBlankAction({
        uuid: "aDisabled",
        stationUuid: "s2",
        stmAction: false,
        enabled: false,
        missionPriorityUuid: "p2",
      }),
      aDisabledOnly: generateBlankAction({
        uuid: "aDisabledOnly",
        stationUuid: "s1",
        stmAction: true,
        enabled: false,
        missionPriorityUuid: "p10",
      }),
    };

    const collected = getPriorityActionsForColumn({
      mission,
      column: alphaColumn,
      rexStatusFilter: "all",
    });
    expect(collected.enabledActions.map((a) => a.uuid).sort()).toEqual(["aNonStm", "aStm"]);
    expect(collected.disabledActions.map((a) => a.uuid).sort()).toEqual([
      "aDisabled",
      "aDisabledOnly",
    ]);

    const coverage = computePriorityColumnCoverage({
      mission,
      column: alphaColumn,
      rexStatusFilter: "all",
    });

    expect(coverage.p2).toMatchObject({
      priorityUuid: "p2",
      status: "planned",
      activeCount: 2,
      disabledCount: 1,
      activeActionUuids: ["aStm", "aNonStm"],
      disabledActionUuids: ["aDisabled"],
    });
    expect(coverage.p10).toMatchObject({
      priorityUuid: "p10",
      status: "disabledOnly",
      activeCount: 0,
      disabledCount: 1,
      activeActionUuids: [],
      disabledActionUuids: ["aDisabledOnly"],
    });
    expect(coverage.pGeo).toMatchObject({
      priorityUuid: "pGeo",
      status: "none",
      activeCount: 0,
      disabledCount: 0,
    });
  });
});

describe("computePriorityColumnCoverage() — REX execution statuses and filter", () => {
  test("rolls up complete, in-progress, pending (including missing entries), and skippedOnly", () => {
    const { mission } = buildFixture();
    mission.missionPriorities = {
      pComplete: { trace: "PRI-1", category: "Cat" },
      pInProg: { trace: "PRI-2", category: "Cat" },
      pPending: { trace: "PRI-3", category: "Cat" },
      pSkipped: { trace: "PRI-4", category: "Cat" },
    };
    mission.evas.rexEva = generateBlankEVA({
      uuid: "rexEva",
      refUuid: "ref-eva1",
      name: "",
      sequence: [{ type: "station", uuid: "s1" }],
    });
    mission.actions = {
      aComp: generateBlankAction({
        uuid: "aComp",
        stationUuid: "s1",
        enabled: true,
        missionPriorityUuid: "pComplete",
      }),
      aProg: generateBlankAction({
        uuid: "aProg",
        stationUuid: "s1",
        enabled: true,
        missionPriorityUuid: "pInProg",
      }),
      aPend: generateBlankAction({
        uuid: "aPend",
        stationUuid: "s1",
        enabled: true,
        missionPriorityUuid: "pPending",
      }),
      aSkip: generateBlankAction({
        uuid: "aSkip",
        stationUuid: "s1",
        enabled: true,
        missionPriorityUuid: "pSkipped",
      }),
    };
    mission.rexes = {
      rex1: generateBlankRex({
        uuid: "rex1",
        evaUuid: "rexEva",
        name: "Run 1",
        actionEntries: {
          aComp: { rexStatus: "complete" },
          aProg: { rexStatus: "in-progress" },
          // aPend omitted -> defaults to pending
          aSkip: { rexStatus: "skipped" },
        },
      }),
    };

    const rexCol = getEvaColumns(mission).find((c) => c.kind === "rex")!;

    const allCoverage = computePriorityColumnCoverage({
      mission,
      column: rexCol,
      rexStatusFilter: "all",
    });
    expect(allCoverage.pComplete.status).toBe("complete");
    expect(allCoverage.pInProg.status).toBe("inProgress");
    expect(allCoverage.pPending.status).toBe("pending");
    expect(allCoverage.pSkipped.status).toBe("skippedOnly");
    expect(allCoverage.pSkipped.activeCount).toBe(1);

    const notSkippedCoverage = computePriorityColumnCoverage({
      mission,
      column: rexCol,
      rexStatusFilter: "notSkipped",
    });
    expect(notSkippedCoverage.pSkipped.status).toBe("skippedOnly");
    expect(notSkippedCoverage.pSkipped.activeCount).toBe(0);
    expect(notSkippedCoverage.pSkipped.excludedRexActionUuids).toEqual(["aSkip"]);

    const completeOnlyCoverage = computePriorityColumnCoverage({
      mission,
      column: rexCol,
      rexStatusFilter: "completeOnly",
    });
    expect(completeOnlyCoverage.pComplete.activeCount).toBe(1);
    expect(completeOnlyCoverage.pInProg).toMatchObject({
      status: "none",
      activeCount: 0,
      inProgressCount: 1,
      excludedRexActionUuids: ["aProg"],
    });
    expect(completeOnlyCoverage.pPending).toMatchObject({
      status: "none",
      activeCount: 0,
      pendingCount: 1,
      excludedRexActionUuids: ["aPend"],
    });
    expect(completeOnlyCoverage.pSkipped.status).toBe("skippedOnly");
  });
});

describe("Campaign columns, member expansion, and diff pairing", () => {
  const buildCampaignFixture = () => {
    const { mission } = buildFixture();
    mission.evas.eva2 = generateBlankEVA({
      uuid: "eva2",
      refUuid: "ref-eva2",
      name: "Bravo",
      sequence: [{ type: "station", uuid: "s2" }],
    });
    mission.stations.s1Rex = generateBlankStation({
      uuid: "s1Rex",
      refUuid: "ref-s1",
      name: "Station 1",
    });
    mission.evas.eva1Rex = generateBlankEVA({
      uuid: "eva1Rex",
      refUuid: "ref-eva1",
      name: "",
      sequence: [{ type: "station", uuid: "s1Rex" }],
    });
    mission.actions = {
      planA: generateBlankAction({
        uuid: "planA",
        refUuid: "ref-action-a",
        stationUuid: "s1",
        name: "Collect core",
        enabled: true,
        missionPriorityUuid: "p2",
      }),
      planB: generateBlankAction({
        uuid: "planB",
        refUuid: "ref-action-b",
        stationUuid: "s2",
        name: "Measure field",
        enabled: true,
        missionPriorityUuid: "p10",
      }),
      execA: generateBlankAction({
        uuid: "execA",
        refUuid: "ref-action-a",
        stationUuid: "s1Rex",
        name: "Collect core (edited in REX)",
        enabled: true,
        missionPriorityUuid: "p2",
      }),
    };
    mission.rexes = {
      rex1: generateBlankRex({
        uuid: "rex1",
        evaUuid: "eva1Rex",
        name: "Alpha Run 1",
        createdAt: 10,
        actionEntries: {
          execA: { rexStatus: "complete" },
        },
      }),
    };
    mission.reportCampaigns = {
      c1: {
        uuid: "c1",
        name: "Campaign 1",
        description: null,
        memberEvaUuids: ["eva1", "eva2"],
        executionRexUuidByEvaUuid: null,
        createdAt: 1,
        updatedAt: null,
      },
    };
    return { mission };
  };

  test("pairs planned actions with REX clones via refUuid even when renamed, and explains unexecuted member EVAs", () => {
    const { mission } = buildCampaignFixture();
    const columns = getEvaColumns(mission);
    const plannedCol = columns.find((c) => c.kind === "campaignPlanned")!;
    const executedCol = columns.find((c) => c.kind === "campaignExecuted")!;

    const plannedCov = computePriorityColumnCoverage({
      mission,
      column: plannedCol,
      rexStatusFilter: "all",
    });
    const executedCov = computePriorityColumnCoverage({
      mission,
      column: executedCol,
      rexStatusFilter: "all",
    });

    expect(
      groupCampaignPriorityMatchesByMemberEva({
        mission,
        column: executedCol,
        cellCoverage: executedCov.p2,
      })
    ).toEqual({ eva1: 1 });

    // p2 was planned in eva1 (s1) and completed in rex1 (s1Rex) -> matched via refUuid, equal
    const diffP2 = diffPriorityCell({
      mission,
      baseline: plannedCov.p2,
      other: executedCov.p2,
    });
    expect(diffP2.matched.map((a) => a.uuid)).toEqual(["execA"]);
    expect(diffP2.added).toEqual([]);
    expect(diffP2.removed).toEqual([]);
    expect(diffP2.statusChanged).toBe(false);
    expect(diffP2.equal).toBe(true);

    // p10 was planned in eva1 (s2) and eva2 (s2), neither in rex1 -> removed
    const diffP10 = diffPriorityCell({
      mission,
      baseline: plannedCov.p10,
      other: executedCov.p10,
    });
    expect(diffP10.removed.length).toBe(2);
    expect(diffP10.statusChanged).toBe(true);
    expect(diffP10.equal).toBe(false);

    const explanation = explainMissingBaselineAction({
      mission,
      baselineAction: mission.actions.planB,
      targetColumn: executedCol,
      priorityUuid: "p10",
    });
    expect(explanation).toEqual({ kind: "text", text: "Bravo: no execution REX recorded" });

    const differences = getPriorityCoverageDifferences({
      mission,
      coverageByColumnKey: {
        [plannedCol.key]: plannedCov,
        [executedCol.key]: executedCov,
      },
      columns: [plannedCol, executedCol],
      baselineKey: plannedCol.key,
      priorityUuids: ["p2", "p10", "pGeo"],
    });
    expect([...differences.priorityUuids]).toEqual(["p10"]);
    expect([...differences.columnKeys]).toEqual([executedCol.key]);
  });

  test("partitions shared-station occurrences across campaign member EVAs and sequence items so sub-columns sum to total", () => {
    const { mission } = buildCampaignFixture();
    const columns = getEvaColumns(mission);
    const plannedCol = columns.find((c) => c.kind === "campaignPlanned")!;
    const plannedCov = computePriorityColumnCoverage({
      mission,
      column: plannedCol,
      rexStatusFilter: "all",
    });

    // Station s2 is visited in both eva1 and eva2, so planB appears twice in campaignPlanned
    expect(plannedCov.p10.activeCount).toBe(2);
    const memberCounts = groupCampaignPriorityMatchesByMemberEva({
      mission,
      column: plannedCol,
      cellCoverage: plannedCov.p10,
    });
    expect(memberCounts).toEqual({ eva1: 1, eva2: 1 });
    expect(memberCounts.eva1 + memberCounts.eva2).toBe(plannedCov.p10.activeCount);

    mission.actions.disabled = generateBlankAction({
      uuid: "disabled",
      stationUuid: "s2",
      enabled: false,
      missionPriorityUuid: "p10",
    });
    const withDisabled = computePriorityColumnCoverage({
      mission,
      column: plannedCol,
      rexStatusFilter: "all",
    });
    expect(withDisabled.p10.disabledCount).toBe(2);
    expect(
      groupCampaignPriorityMatchesByMemberEva({
        mission,
        column: plannedCol,
        cellCoverage: withDisabled.p10,
        includeDisabled: false,
      })
    ).toEqual({ eva1: 1, eva2: 1 });
    const memberCountsWithDisabled = groupCampaignPriorityMatchesByMemberEva({
      mission,
      column: plannedCol,
      cellCoverage: withDisabled.p10,
      includeDisabled: true,
    });
    expect(memberCountsWithDisabled).toEqual({ eva1: 2, eva2: 2 });
    expect(memberCountsWithDisabled.eva1 + memberCountsWithDisabled.eva2).toBe(
      withDisabled.p10.activeCount + withDisabled.p10.disabledCount
    );

    const eva1Cov = computePriorityColumnCoverage({
      mission,
      column: alphaColumn,
      rexStatusFilter: "all",
    });
    const seqMatches = groupPriorityMatchesBySequenceItem({
      mission,
      cellCoverage: eva1Cov.p2,
    });
    expect(seqMatches.stations).toEqual({ s1: 1 });
  });
});

describe("computePriorityUnscheduledUsages() & lineage mismatch", () => {
  test("identifies unpromoted POI actions, unassigned station actions, and action templates", () => {
    const { mission } = buildFixture();
    mission.pois = {
      poi1: generateBlankPoi({ uuid: "poi1", name: "Crater Rim", actionOrderUuids: ["poiAct1"] }),
    };
    mission.stations.sUnscheduled = generateBlankStation({
      uuid: "sUnscheduled",
      name: "Outpost Station",
    });
    mission.actions = {
      poiAct1: generateBlankAction({
        uuid: "poiAct1",
        poiUuid: "poi1",
        missionPriorityUuid: "p2",
      }),
      unschedAct: generateBlankAction({
        uuid: "unschedAct",
        stationUuid: "sUnscheduled",
        missionPriorityUuid: "p10",
      }),
      adoptedStationAct: generateBlankAction({
        uuid: "adoptedStationAct",
        stationUuid: "s1",
        parentActionUuid: "poiAct1",
        missionPriorityUuid: "pGeo",
      }),
    };
    mission.actionTemplates = {
      tpl1: generateBlankActionTemplate({
        templateName: "Standard Core Template",
        missionPriorityUuid: "pGeo",
      }),
    };

    const usages = computePriorityUnscheduledUsages(mission);
    // poiAct1 has a station copy (adoptedStationAct), so poiActionUuids has it, but unpromotedPoiActionUuids is empty
    expect(usages.p2.poiActionUuids).toEqual(["poiAct1"]);
    expect(usages.p2.unpromotedPoiActionUuids).toEqual([]);
    expect(usages.p2.plannedInAnyEvaCount).toBe(0);

    // unschedAct is on sUnscheduled (not in any EVA)
    expect(usages.p10.unassignedLocationActionUuids).toEqual(["unschedAct"]);
    expect(usages.p10.plannedInAnyEvaCount).toBe(0);

    // pGeo is on adoptedStationAct (in eva1) and tpl1
    expect(usages.pGeo.plannedInAnyEvaCount).toBe(1);
    expect(usages.pGeo.actionTemplateUuids).toEqual(["tpl1"]);

    // Lineage mismatch between poiAct1 (p2) and adoptedStationAct (pGeo)
    expect(getActionLineagePriorityMismatch(mission.actions.adoptedStationAct, mission)).toEqual({
      poiActionUuid: "poiAct1",
      poiName: "Crater Rim",
      poiIcon: "1F534",
      poiPriorityTrace: "SIMD-0002.1",
      currentPriorityTrace: "GEO-0001.1",
    });
  });
});

describe("resolveActionMissionPriority() — non-STM and version guards", () => {
  test("does not interpret a non-STM action's retained definition as a legacy priority", () => {
    const { mission } = buildFixture();
    mission.actionDefinitions = {
      verbs: { v1: { name: "Collect", abbr: "c" } },
      nouns: { n1: { name: "Core", abbr: "co" } },
      adjectives: { adjPri: { name: "Pri: simd-0002.1", abbr: "p" } },
    };
    const nonStm = generateBlankAction({
      uuid: "n1",
      stmAction: false,
      name: "Pri: SIMD-0002.1",
      missionPriorityUuid: null,
      actionDefinition: { verbUuid: "v1", nounUuid: "n1", adjectiveUuid: "adjPri" },
    });
    expect(resolveActionMissionPriority(nonStm, mission)).toBeNull();
  });

  test("legacy adjective mapping requires actionSystemVersion 2", () => {
    const { mission } = buildFixture();
    mission.actionSystemVersion = 1;
    mission.actionDefinitions = {
      verbs: { v1: { name: "Collect", abbr: "c" } },
      nouns: { n1: { name: "Core", abbr: "co" } },
      adjectives: { adjPri: { name: "Pri: simd-0002.1", abbr: "p" } },
    };
    const v1Action = generateBlankAction({
      uuid: "v1act",
      stmAction: true,
      missionPriorityUuid: null,
      actionDefinition: { verbUuid: "v1", nounUuid: "n1", adjectiveUuid: "adjPri" },
    });
    expect(resolveActionMissionPriority(v1Action, mission)).toBeNull();
  });

  test("dangling missionPriorityUuid falls through to the legacy adjective check", () => {
    const { mission } = buildFixture();
    const dangling = generateBlankAction({
      uuid: "d1",
      stmAction: true,
      missionPriorityUuid: "pGone",
    });
    expect(resolveActionMissionPriority(dangling, mission)).toBeNull();

    // ...and still maps via a priority adjective when one matches
    mission.actionDefinitions = {
      verbs: { v1: { name: "Collect", abbr: "c" } },
      nouns: { n1: { name: "Core", abbr: "co" } },
      adjectives: { adjPri: { name: "Pri: simd-0002.1", abbr: "p" } },
    };
    dangling.actionDefinition = { verbUuid: "v1", nounUuid: "n1", adjectiveUuid: "adjPri" };
    expect(resolveActionMissionPriority(dangling, mission)).toEqual({
      priorityUuid: "p2",
      trace: "SIMD-0002.1",
      category: "Sample Collection",
      fromLegacyAdjective: true,
    });
  });
});

describe("diffPriorityActions() — refUuid pairing vs fallback keys", () => {
  test("pairs a renamed REX clone by refUuid, not by a same-named unrelated baseline action", () => {
    const baseline = [
      generateBlankAction({ uuid: "a1", refUuid: "r1", name: "Alpha original" }),
      generateBlankAction({ uuid: "b1", refUuid: "r2", name: "Shared name" }),
    ];
    const selected = [
      generateBlankAction({ uuid: "s2", refUuid: "r3", name: "Alpha original" }),
      generateBlankAction({ uuid: "s1", refUuid: "r1", name: "Shared name" }),
    ];

    const { matched, added, removed } = diffPriorityActions({
      baselineActions: baseline,
      selectedActions: selected,
    });
    // s1 (ref r1) must pair with a1 (its actual clone) even though b1 shares its name
    expect(matched.map((a) => a.uuid)).toEqual(["s1"]);
    expect(added.map((a) => a.uuid)).toEqual(["s2"]);
    expect(removed.map((a) => a.uuid)).toEqual(["b1"]);
  });

  test("preserves repeated campaign occurrences when one side has fewer copies", () => {
    const baseline = generateBlankAction({ uuid: "a1", refUuid: "shared-ref", name: "Dig" });
    const selected = generateBlankAction({ uuid: "s1", refUuid: "shared-ref", name: "Dig" });
    expect(
      diffPriorityActions({ baselineActions: [baseline], selectedActions: [selected, selected] })
    ).toEqual({
      matched: [selected],
      added: [selected],
      removed: [],
    });
    expect(
      diffPriorityActions({ baselineActions: [baseline, baseline], selectedActions: [selected] })
    ).toEqual({
      matched: [selected],
      added: [],
      removed: [baseline],
    });
  });

  test("STM tuple fallback pairs identical verb|noun|adjective but never differing tuples or cross-kind actions", () => {
    const tuple = (verbUuid: string, nounUuid: string, adjectiveUuid: string) => ({
      verbUuid,
      nounUuid,
      adjectiveUuid,
    });
    const stmAction = (uuid: string, definition: ActionDefinition, name: string) =>
      generateBlankAction({
        uuid,
        refUuid: `ref-${uuid}`,
        stmAction: true,
        actionDefinition: definition,
        name,
      });

    // Same tuple, different names -> matched via stm: key
    const sameTuple = diffPriorityActions({
      baselineActions: [stmAction("a1", tuple("v1", "n1", "ad1"), "One")],
      selectedActions: [stmAction("s1", tuple("v1", "n1", "ad1"), "Two")],
    });
    expect(sameTuple.matched.map((a) => a.uuid)).toEqual(["s1"]);
    expect(sameTuple.added).toEqual([]);
    expect(sameTuple.removed).toEqual([]);

    // Same name, different tuple -> no false pair
    const differentTuple = diffPriorityActions({
      baselineActions: [stmAction("a1", tuple("v1", "n1", "ad1"), "Same")],
      selectedActions: [stmAction("s1", tuple("v1", "n2", "ad1"), "Same")],
    });
    expect(differentTuple.matched).toEqual([]);
    expect(differentTuple.added.map((a) => a.uuid)).toEqual(["s1"]);
    expect(differentTuple.removed.map((a) => a.uuid)).toEqual(["a1"]);

    // STM vs non-STM with identical names -> keys differ (stm: vs name:), no pair
    const crossKind = diffPriorityActions({
      baselineActions: [stmAction("a1", tuple("v1", "n1", "ad1"), "Sample")],
      selectedActions: [
        generateBlankAction({ uuid: "s1", refUuid: "ref-s1", stmAction: false, name: "Sample" }),
      ],
    });
    expect(crossKind.matched).toEqual([]);
    expect(crossKind.added).toHaveLength(1);
    expect(crossKind.removed).toHaveLength(1);
  });

  test("name fallback is case-insensitive and whitespace-trimming; empty refUuid falls back to name", () => {
    const baseline = [generateBlankAction({ uuid: "a1", refUuid: "", name: "Collect Core" })];
    const selected = [generateBlankAction({ uuid: "s1", refUuid: "", name: "  collect core  " })];
    const { matched, added, removed } = diffPriorityActions({
      baselineActions: baseline,
      selectedActions: selected,
    });
    expect(matched.map((a) => a.uuid)).toEqual(["s1"]);
    expect(added).toEqual([]);
    expect(removed).toEqual([]);

    const different = diffPriorityActions({
      baselineActions: [generateBlankAction({ uuid: "a1", refUuid: "", name: "Collect Core" })],
      selectedActions: [generateBlankAction({ uuid: "s1", refUuid: "", name: "Collect Cores" })],
    });
    expect(different).toMatchObject({
      matched: [],
      added: [{ uuid: "s1" }],
      removed: [{ uuid: "a1" }],
    });
  });
});

describe("computePriorityColumnCoverage() — per-REX scoping of diff pairing", () => {
  const buildTwoRexFixture = () => {
    const { mission } = buildFixture();
    mission.missionPriorities = { p2: { trace: "SIMD-0002.1", category: "Sample Collection" } };
    mission.stations.s1Rex1 = generateBlankStation({
      uuid: "s1Rex1",
      refUuid: "ref-s1",
      name: "Station 1",
    });
    mission.stations.s1Rex2 = generateBlankStation({
      uuid: "s1Rex2",
      refUuid: "ref-s1",
      name: "Station 1",
    });
    mission.evas.eva1Rex1 = generateBlankEVA({
      uuid: "eva1Rex1",
      refUuid: "ref-eva1",
      name: "",
      sequence: [{ type: "station", uuid: "s1Rex1" }],
    });
    mission.evas.eva1Rex2 = generateBlankEVA({
      uuid: "eva1Rex2",
      refUuid: "ref-eva1",
      name: "",
      sequence: [{ type: "station", uuid: "s1Rex2" }],
    });
    mission.actions = {
      planA: generateBlankAction({
        uuid: "planA",
        refUuid: "ref-action-a",
        stationUuid: "s1",
        name: "Collect core",
        enabled: true,
        missionPriorityUuid: "p2",
      }),
      aRex1: generateBlankAction({
        uuid: "aRex1",
        refUuid: "ref-action-a",
        stationUuid: "s1Rex1",
        name: "Collect core",
        enabled: true,
        missionPriorityUuid: "p2",
      }),
      aRex2: generateBlankAction({
        uuid: "aRex2",
        refUuid: "ref-action-a",
        stationUuid: "s1Rex2",
        name: "Collect core",
        enabled: true,
        missionPriorityUuid: "p2",
      }),
    };
    mission.rexes = {
      rex1: generateBlankRex({
        uuid: "rex1",
        evaUuid: "eva1Rex1",
        name: "Run 1",
        createdAt: 10,
        actionEntries: { aRex1: { rexStatus: "complete" } },
      }),
      rex2: generateBlankRex({
        uuid: "rex2",
        evaUuid: "eva1Rex2",
        name: "Run 2",
        createdAt: 20,
        actionEntries: { aRex2: { rexStatus: "skipped" } },
      }),
    };
    return { mission };
  };

  test("each REX column only sees its own clones; cross-REX diff still pairs via shared refUuid", () => {
    const { mission } = buildTwoRexFixture();
    const columns = getEvaColumns(mission);
    const rex1Col = columns.find((c) => c.rexUuid === "rex1")!;
    const rex2Col = columns.find((c) => c.rexUuid === "rex2")!;

    const rex1Cov = computePriorityColumnCoverage({
      mission,
      column: rex1Col,
      rexStatusFilter: "all",
    });
    const rex2Cov = computePriorityColumnCoverage({
      mission,
      column: rex2Col,
      rexStatusFilter: "all",
    });

    // aRex2 (same refUuid, sibling REX's station copy) must not leak into rex1's cell
    expect(rex1Cov.p2.activeActionUuids).toEqual(["aRex1"]);
    expect(rex1Cov.p2.status).toBe("complete");
    expect(rex1Cov.p2.excludedRexActionUuids).toEqual([]);
    expect(rex2Cov.p2.activeActionUuids).toEqual(["aRex2"]);
    expect(rex2Cov.p2.status).toBe("skippedOnly");

    const diff = diffPriorityCell({ mission, baseline: rex1Cov.p2, other: rex2Cov.p2 });
    // The two REX clones share refUuid, so they pair as matched despite different station copies
    expect(diff.matched.map((a) => a.uuid)).toEqual(["aRex2"]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.statusChanged).toBe(true);
    expect(diff.equal).toBe(false);
  });
});

describe("computePriorityColumnCoverage() mixed execution statuses", () => {
  test("filters occurrences without losing the raw status counts or status precedence", () => {
    const { mission } = buildFixture();
    mission.stations.sRex = generateBlankStation({ uuid: "sRex" });
    mission.evas.rexEva = generateBlankEVA({
      uuid: "rexEva",
      refUuid: "ref-eva1",
      sequence: [{ type: "station", uuid: "sRex" }],
    });
    mission.actions = {
      complete: generateBlankAction({
        uuid: "complete",
        stationUuid: "sRex",
        missionPriorityUuid: "p2",
      }),
      progress: generateBlankAction({
        uuid: "progress",
        stationUuid: "sRex",
        missionPriorityUuid: "p2",
      }),
      mixedProgress: generateBlankAction({
        uuid: "mixedProgress",
        stationUuid: "sRex",
        missionPriorityUuid: "p10",
      }),
      skipped: generateBlankAction({
        uuid: "skipped",
        stationUuid: "sRex",
        missionPriorityUuid: "p10",
      }),
    };
    mission.rexes = {
      rex1: generateBlankRex({
        uuid: "rex1",
        evaUuid: "rexEva",
        actionEntries: {
          complete: { rexStatus: "complete" },
          progress: { rexStatus: "in-progress" },
          mixedProgress: { rexStatus: "in-progress" },
          skipped: { rexStatus: "skipped" },
        },
      }),
    };
    const column = getEvaColumns(mission).find((c) => c.kind === "rex")!;
    const coverage = (rexStatusFilter: RexStatusFilter) =>
      computePriorityColumnCoverage({ mission, column, rexStatusFilter });

    const all = coverage("all");
    expect(all.p2).toMatchObject({
      status: "complete",
      activeActionUuids: ["complete", "progress"],
    });
    expect(all.p10).toMatchObject({
      status: "inProgress",
      activeActionUuids: ["mixedProgress", "skipped"],
    });
    expect(coverage("notSkipped").p10).toMatchObject({
      status: "inProgress",
      activeActionUuids: ["mixedProgress"],
      excludedRexActionUuids: ["skipped"],
      inProgressCount: 1,
      skippedCount: 1,
    });
    const completeOnly = coverage("completeOnly");
    expect(completeOnly.p2).toMatchObject({
      status: "complete",
      activeCount: 1,
      activeActionUuids: ["complete"],
      excludedRexActionUuids: ["progress"],
      completeCount: 1,
      inProgressCount: 1,
    });
    expect(completeOnly.p10).toMatchObject({
      status: "none",
      activeCount: 0,
      activeActionUuids: [],
      excludedRexActionUuids: ["mixedProgress", "skipped"],
      inProgressCount: 1,
      skippedCount: 1,
    });
  });
});
