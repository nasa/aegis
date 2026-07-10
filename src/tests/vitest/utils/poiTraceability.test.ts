import {
  computePoiTraceability,
  resolveScopeEvaUuids,
  resolveScopeExecutionRexes,
} from "utils/poiTraceability";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankRex } from "store/storeUtils/rex";
import { generateBlankPoi } from "store/storeUtils/poi";

/**
 * Base fixture: one as-planned EVA ("Alpha", refUuid "refAlpha") with stations
 * s1, s2 and traverse t1. Tests layer POIs, actions, rexes, and campaigns on
 * top. Actions default to stmAction:false — irrelevant here, traceability keys
 * off parentActionUuid, not rule eligibility.
 */
const buildFixture = () => {
  const mission = generateBlankMission({ actionSystemVersion: 2 });

  mission.stations = {
    s1: generateBlankStation({ uuid: "s1", name: "Station 1" }),
    s2: generateBlankStation({ uuid: "s2", name: "Station 2" }),
  };
  mission.traverses = { t1: generateBlankTraverse({ uuid: "t1", name: "Traverse 1" }) };
  mission.evas = {
    eva1: generateBlankEVA({
      uuid: "eva1",
      name: "Alpha",
      refUuid: "refAlpha",
      sequence: [
        { type: "traverse", uuid: "t1" },
        { type: "station", uuid: "s1" },
        { type: "station", uuid: "s2" },
      ],
    }),
  };
  mission.pois = {};
  mission.actions = {};
  mission.rexes = {};
  mission.reportCampaigns = {};

  return { mission };
};

const makeCampaign = (partial: Partial<ReportCampaign> & { uuid: string }): ReportCampaign => ({
  name: "Campaign",
  description: null,
  memberEvaUuids: [],
  executionRexUuidByEvaUuid: null,
  createdAt: 0,
  updatedAt: null,
  ...partial,
});

/**
 * Adds a REX EVA copy of Alpha (refUuid "refAlpha") with its own station copies
 * s1r/s2r in sequence, plus a REX referencing it. Returns the rex EVA uuid.
 */
const addRexEvaOfAlpha = (
  mission: Mission,
  { rexUuid, createdAt = 1 }: { rexUuid: string; createdAt?: number }
): { rexEvaUuid: string } => {
  const rexEvaUuid = `${rexUuid}Eva`;
  mission.stations[`s1r_${rexUuid}`] = generateBlankStation({
    uuid: `s1r_${rexUuid}`,
    name: "Station 1 (REX)",
  });
  mission.stations[`s2r_${rexUuid}`] = generateBlankStation({
    uuid: `s2r_${rexUuid}`,
    name: "Station 2 (REX)",
  });
  mission.evas[rexEvaUuid] = generateBlankEVA({
    uuid: rexEvaUuid,
    name: "",
    refUuid: "refAlpha",
    sequence: [
      { type: "station", uuid: `s1r_${rexUuid}` },
      { type: "station", uuid: `s2r_${rexUuid}` },
    ],
  });
  mission.rexes[rexUuid] = generateBlankRex({
    uuid: rexUuid,
    evaUuid: rexEvaUuid,
    name: rexUuid,
    createdAt,
  });
  return { rexEvaUuid };
};

const rowByPoi = (rows: PoiTraceRow[], poiUuid: string): PoiTraceRow =>
  rows.find((row) => row.poiUuid === poiUuid) as PoiTraceRow;

describe("resolveScopeEvaUuids()", () => {
  test("'all' scope returns every as-planned EVA, excluding REX EVAs", () => {
    const { mission } = buildFixture();
    addRexEvaOfAlpha(mission, { rexUuid: "rex1" });
    mission.evas["eva2"] = generateBlankEVA({ uuid: "eva2", name: "Bravo", refUuid: "refBravo" });

    expect(resolveScopeEvaUuids(mission, { type: "all" }).sort()).toEqual(["eva1", "eva2"]);
  });

  test("'campaignPlanned' returns member EVAs, skipping deleted ones", () => {
    const { mission } = buildFixture();
    mission.reportCampaigns = {
      c1: makeCampaign({ uuid: "c1", memberEvaUuids: ["eva1", "ghostEva"] }),
    };
    expect(resolveScopeEvaUuids(mission, { type: "campaignPlanned", campaignUuid: "c1" })).toEqual([
      "eva1",
    ]);
  });

  test("'campaignExecuted' returns the resolved execution REX EVAs (latest-rex default)", () => {
    const { mission } = buildFixture();
    addRexEvaOfAlpha(mission, { rexUuid: "rexOld", createdAt: 1 });
    const { rexEvaUuid: newEva } = addRexEvaOfAlpha(mission, { rexUuid: "rexNew", createdAt: 5 });
    mission.reportCampaigns = {
      c1: makeCampaign({ uuid: "c1", memberEvaUuids: ["eva1"] }),
    };
    expect(resolveScopeEvaUuids(mission, { type: "campaignExecuted", campaignUuid: "c1" })).toEqual(
      [newEva]
    );
  });

  test("'campaignExecuted' honours a designated REX per member EVA", () => {
    const { mission } = buildFixture();
    const { rexEvaUuid: oldEva } = addRexEvaOfAlpha(mission, { rexUuid: "rexOld", createdAt: 1 });
    addRexEvaOfAlpha(mission, { rexUuid: "rexNew", createdAt: 5 });
    mission.reportCampaigns = {
      c1: makeCampaign({
        uuid: "c1",
        memberEvaUuids: ["eva1"],
        executionRexUuidByEvaUuid: { eva1: "rexOld" },
      }),
    };
    expect(resolveScopeEvaUuids(mission, { type: "campaignExecuted", campaignUuid: "c1" })).toEqual(
      [oldEva]
    );
  });

  test("missing campaign yields an empty scope", () => {
    const { mission } = buildFixture();
    expect(
      resolveScopeEvaUuids(mission, { type: "campaignPlanned", campaignUuid: "ghost" })
    ).toEqual([]);
  });
});

describe("resolveScopeExecutionRexes()", () => {
  test("only the executed campaign scope has execution rexes", () => {
    const { mission } = buildFixture();
    addRexEvaOfAlpha(mission, { rexUuid: "rex1", createdAt: 1 });
    mission.reportCampaigns = { c1: makeCampaign({ uuid: "c1", memberEvaUuids: ["eva1"] }) };

    expect(resolveScopeExecutionRexes(mission, { type: "all" })).toEqual([]);
    expect(
      resolveScopeExecutionRexes(mission, { type: "campaignPlanned", campaignUuid: "c1" })
    ).toEqual([]);
    expect(
      resolveScopeExecutionRexes(mission, { type: "campaignExecuted", campaignUuid: "c1" }).map(
        (rex) => rex.uuid
      )
    ).toEqual(["rex1"]);
  });
});

describe("computePoiTraceability() — rows and sorting", () => {
  test("returns every POI, sorted by priorityOverride then name; null priority sorts last", () => {
    const { mission } = buildFixture();
    mission.pois = {
      pB: generateBlankPoi({ uuid: "pB", name: "Bravo", priorityOverride: 1 }),
      pA: generateBlankPoi({ uuid: "pA", name: "Alpha", priorityOverride: 1 }),
      pC: generateBlankPoi({ uuid: "pC", name: "Charlie", priorityOverride: 0 }),
    };

    const rows = computePoiTraceability({ mission, scope: { type: "all" } });
    expect(rows.map((row) => row.poiUuid)).toEqual(["pC", "pA", "pB"]);
    expect(rows.map((row) => row.name)).toEqual(["Charlie", "Alpha", "Bravo"]);
  });

  test("exposes tags, priorityOverride, and totalPoiActionCount from the POI", () => {
    const { mission } = buildFixture();
    mission.pois = {
      p1: generateBlankPoi({
        uuid: "p1",
        name: "P1",
        priorityOverride: 3,
        tags: ["science", "urgent"],
        actionOrderUuids: ["pa1", "pa2"],
      }),
    };
    mission.actions = {
      pa1: generateBlankAction({ uuid: "pa1", poiUuid: "p1", name: "Action 1" }),
      pa2: generateBlankAction({ uuid: "pa2", poiUuid: "p1", name: "Action 2" }),
    };

    const [row] = computePoiTraceability({ mission, scope: { type: "all" } });
    expect(row.tags).toEqual(["science", "urgent"]);
    expect(row.priorityOverride).toBe(3);
    expect(row.totalPoiActionCount).toBe(2);
    expect(row.actions.map((action) => action.name)).toEqual(["Action 1", "Action 2"]);
  });
});

describe("computePoiTraceability() — promotion (planned scope)", () => {
  test("POI with actions but no station copies is 'not promoted'", () => {
    const { mission } = buildFixture();
    mission.pois = {
      p1: generateBlankPoi({ uuid: "p1", name: "P1", actionOrderUuids: ["pa1"] }),
    };
    mission.actions = {
      pa1: generateBlankAction({ uuid: "pa1", poiUuid: "p1", name: "Sample" }),
    };

    const [row] = computePoiTraceability({ mission, scope: { type: "all" } });
    expect(row.promotedActionCount).toBe(0);
    expect(row.totalPoiActionCount).toBe(1);
    expect(row.plannedEvaCount).toBe(0);
    expect(row.actions[0].stationCopies).toEqual([]);
  });

  test("POI promoted into a planned EVA: counts and lineage detail populate", () => {
    const { mission } = buildFixture();
    mission.pois = {
      p1: generateBlankPoi({ uuid: "p1", name: "P1", actionOrderUuids: ["pa1"] }),
    };
    mission.actions = {
      pa1: generateBlankAction({ uuid: "pa1", poiUuid: "p1", name: "Sample" }),
      sa1: generateBlankAction({
        uuid: "sa1",
        stationUuid: "s1",
        parentActionUuid: "pa1",
        parentCopyDate: 1234,
      }),
    };

    const [row] = computePoiTraceability({ mission, scope: { type: "all" } });
    expect(row.promotedActionCount).toBe(1);
    expect(row.plannedEvaCount).toBe(1);
    expect(row.completeCount).toBe(0);
    expect(row.skippedCount).toBe(0);

    const copies = row.actions[0].stationCopies;
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({
      stationActionUuid: "sa1",
      stationUuid: "s1",
      stationName: "Station 1",
      traverseUuid: null,
      traverseName: null,
      parentCopyDate: 1234,
      inScopeEvaUuids: ["eva1"],
      executions: [],
    });
  });

  test("a station copy landing outside the scope's EVAs is not counted", () => {
    const { mission } = buildFixture();
    // s3 exists but is in no EVA sequence
    mission.stations["s3"] = generateBlankStation({ uuid: "s3", name: "Station 3" });
    mission.pois = {
      p1: generateBlankPoi({ uuid: "p1", name: "P1", actionOrderUuids: ["pa1"] }),
    };
    mission.actions = {
      pa1: generateBlankAction({ uuid: "pa1", poiUuid: "p1" }),
      sa1: generateBlankAction({ uuid: "sa1", stationUuid: "s3", parentActionUuid: "pa1" }),
    };

    const [row] = computePoiTraceability({ mission, scope: { type: "all" } });
    expect(row.promotedActionCount).toBe(0);
    expect(row.plannedEvaCount).toBe(0);
    expect(row.actions[0].stationCopies).toEqual([]);
  });

  test("a traverse-authored copy is attributed via traverse membership", () => {
    const { mission } = buildFixture();
    mission.pois = {
      p1: generateBlankPoi({ uuid: "p1", name: "P1", actionOrderUuids: ["pa1"] }),
    };
    mission.actions = {
      pa1: generateBlankAction({ uuid: "pa1", poiUuid: "p1" }),
      sa1: generateBlankAction({ uuid: "sa1", traverseUuid: "t1", parentActionUuid: "pa1" }),
    };

    const [row] = computePoiTraceability({ mission, scope: { type: "all" } });
    expect(row.promotedActionCount).toBe(1);
    const copy = row.actions[0].stationCopies[0];
    expect(copy.traverseUuid).toBe("t1");
    expect(copy.traverseName).toBe("Traverse 1");
    expect(copy.stationUuid).toBeNull();
    expect(copy.inScopeEvaUuids).toEqual(["eva1"]);
  });
});

describe("computePoiTraceability() — linkage", () => {
  test("linked via station.poiUuids but no copied actions: linked distinct from promoted", () => {
    const { mission } = buildFixture();
    mission.stations["s1"].poiUuids = ["p1"];
    mission.pois = {
      p1: generateBlankPoi({ uuid: "p1", name: "P1", actionOrderUuids: ["pa1"] }),
    };
    mission.actions = { pa1: generateBlankAction({ uuid: "pa1", poiUuid: "p1" }) };

    const [row] = computePoiTraceability({ mission, scope: { type: "all" } });
    expect(row.linkedStationCount).toBe(1);
    expect(row.promotedActionCount).toBe(0);
    expect(row.plannedEvaCount).toBe(1); // eva1 contributed by linkage alone
    expect(row.linkedStations).toEqual([
      { stationUuid: "s1", stationName: "Station 1", stationIcon: null, inScopeEvaUuids: ["eva1"] },
    ]);
  });

  test("a linked station in no in-scope EVA is listed but not counted", () => {
    const { mission } = buildFixture();
    // s3 is linked but appears in no EVA sequence
    mission.stations["s3"] = generateBlankStation({
      uuid: "s3",
      name: "Station 3",
      poiUuids: ["p1"],
    });
    mission.pois = { p1: generateBlankPoi({ uuid: "p1", name: "P1" }) };

    const [row] = computePoiTraceability({ mission, scope: { type: "all" } });
    expect(row.linkedStationCount).toBe(0);
    expect(row.plannedEvaCount).toBe(0);
    expect(row.linkedStations).toEqual([
      { stationUuid: "s3", stationName: "Station 3", stationIcon: null, inScopeEvaUuids: [] },
    ]);
  });
});

describe("computePoiTraceability() — gap handling", () => {
  test("dangling parentActionUuid and direct-authored (null parent) actions are ignored", () => {
    const { mission } = buildFixture();
    mission.pois = {
      p1: generateBlankPoi({ uuid: "p1", name: "P1", actionOrderUuids: ["pa1"] }),
    };
    mission.actions = {
      pa1: generateBlankAction({ uuid: "pa1", poiUuid: "p1" }),
      // parent points at a POI action that no longer exists
      dangling: generateBlankAction({
        uuid: "dangling",
        stationUuid: "s1",
        parentActionUuid: "ghostPoiAction",
      }),
      // authored directly on the station, no parent
      direct: generateBlankAction({ uuid: "direct", stationUuid: "s1", parentActionUuid: null }),
    };

    const [row] = computePoiTraceability({ mission, scope: { type: "all" } });
    expect(row.promotedActionCount).toBe(0);
    expect(row.actions[0].stationCopies).toEqual([]);
  });

  test("a dangling entry in actionOrderUuids is skipped but still counts toward the total", () => {
    const { mission } = buildFixture();
    mission.pois = {
      p1: generateBlankPoi({ uuid: "p1", name: "P1", actionOrderUuids: ["pa1", "deletedPa"] }),
    };
    mission.actions = { pa1: generateBlankAction({ uuid: "pa1", poiUuid: "p1", name: "Kept" }) };

    const [row] = computePoiTraceability({ mission, scope: { type: "all" } });
    expect(row.totalPoiActionCount).toBe(2);
    expect(row.actions.map((action) => action.poiActionUuid)).toEqual(["pa1"]);
  });
});

describe("computePoiTraceability() — executed scope", () => {
  const buildExecuted = () => {
    const { mission } = buildFixture();
    const { rexEvaUuid } = addRexEvaOfAlpha(mission, { rexUuid: "rex1", createdAt: 1 });
    mission.reportCampaigns = {
      c1: makeCampaign({ uuid: "c1", memberEvaUuids: ["eva1"] }),
    };
    mission.pois = {
      p1: generateBlankPoi({ uuid: "p1", name: "P1", actionOrderUuids: ["pa1", "pa2", "pa3"] }),
    };
    // POI actions + one REX station-action copy per POI action, on the rex EVA's
    // station s1r_rex1 (in-scope for the executed scope).
    mission.actions = {
      pa1: generateBlankAction({ uuid: "pa1", poiUuid: "p1", name: "A1" }),
      pa2: generateBlankAction({ uuid: "pa2", poiUuid: "p1", name: "A2" }),
      pa3: generateBlankAction({ uuid: "pa3", poiUuid: "p1", name: "A3" }),
      done: generateBlankAction({ uuid: "done", stationUuid: "s1r_rex1", parentActionUuid: "pa1" }),
      skip: generateBlankAction({ uuid: "skip", stationUuid: "s1r_rex1", parentActionUuid: "pa2" }),
      miss: generateBlankAction({ uuid: "miss", stationUuid: "s1r_rex1", parentActionUuid: "pa3" }),
    };
    mission.rexes["rex1"].actionEntries = {
      done: { rexStatus: "complete" },
      skip: { rexStatus: "skipped" },
      // "miss" has no entry -> pending
    };
    return { mission, rexEvaUuid };
  };

  test("complete + skipped + missing(=pending) tally into row counts and per-copy executions", () => {
    const { mission } = buildExecuted();

    const [row] = computePoiTraceability({
      mission,
      scope: { type: "campaignExecuted", campaignUuid: "c1" },
    });
    expect(row.promotedActionCount).toBe(3);
    expect(row.completeCount).toBe(1);
    expect(row.skippedCount).toBe(1);

    const statusOf = (poiActionUuid: string): PoiTraceActionStatus =>
      rowByPoi([row], "p1").actions.find((a) => a.poiActionUuid === poiActionUuid)!.stationCopies[0]
        .executions[0].status;
    expect(statusOf("pa1")).toBe("complete");
    expect(statusOf("pa2")).toBe("skipped");
    expect(statusOf("pa3")).toBe("pending");
  });

  test("null actionEntries treats every execution as pending", () => {
    const { mission } = buildExecuted();
    mission.rexes["rex1"].actionEntries = null;

    const [row] = computePoiTraceability({
      mission,
      scope: { type: "campaignExecuted", campaignUuid: "c1" },
    });
    expect(row.completeCount).toBe(0);
    expect(row.skippedCount).toBe(0);
    for (const action of row.actions) {
      expect(action.stationCopies[0].executions[0].status).toBe("pending");
    }
  });

  test("'all' scope carries no execution set: complete/skipped are 0 even with rexes present", () => {
    const { mission } = buildExecuted();

    const rows = computePoiTraceability({ mission, scope: { type: "all" } });
    const row = rowByPoi(rows, "p1");
    expect(row.completeCount).toBe(0);
    expect(row.skippedCount).toBe(0);
    // the as-planned scope sees no promoted copies here (copies live on the rex EVA)
    expect(row.promotedActionCount).toBe(0);
    for (const action of row.actions) {
      for (const copy of action.stationCopies) expect(copy.executions).toEqual([]);
    }
  });

  test("executed scope: as-planned linkage yields 0 linked stations (REX EVAs hold copies)", () => {
    const { mission } = buildExecuted();
    mission.stations["s1"].poiUuids = ["p1"]; // as-planned link

    const [row] = computePoiTraceability({
      mission,
      scope: { type: "campaignExecuted", campaignUuid: "c1" },
    });
    expect(row.linkedStationCount).toBe(0);
  });
});
