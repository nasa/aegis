import {
  computePriorityColumnCoverage,
  computePriorityUnscheduledUsages,
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
    expect(completeOnlyCoverage.pInProg.activeCount).toBe(0);
    expect(completeOnlyCoverage.pInProg.excludedRexActionUuids).toEqual(["aProg"]);
    expect(completeOnlyCoverage.pPending.activeCount).toBe(0);
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
    expect(explanation).toBe("Bravo: no execution REX recorded");

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
      poiPriorityTrace: "SIMD-0002.1",
      currentPriorityTrace: "GEO-0001.1",
    });
  });
});
