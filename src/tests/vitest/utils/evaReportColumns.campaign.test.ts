import {
  actionBelongsToCampaignMember,
  getCampaignMemberItems,
  getEligibleActionsForColumn,
  getEvaColumns,
  groupCampaignMatchesByMember,
} from "utils/evaReportColumns";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankRex } from "store/storeUtils/rex";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankAction } from "store/storeUtils/action";

const buildCampaignFixture = () => {
  const mission = generateBlankMission();
  const alpha = generateBlankEVA({
    uuid: "alpha",
    refUuid: "alpha-ref",
    name: "Alpha",
    sequence: [{ type: "station", uuid: "alpha-station" }],
  });
  const bravo = generateBlankEVA({
    uuid: "bravo",
    refUuid: "bravo-ref",
    name: "Bravo",
    sequence: [{ type: "station", uuid: "bravo-station" }],
  });
  const alphaRexEva = generateBlankEVA({
    uuid: "alpha-rex-eva",
    refUuid: alpha.refUuid,
    name: "Alpha execution EVA",
    sequence: [{ type: "station", uuid: "alpha-rex-station" }],
  });
  const bravoRexEva = generateBlankEVA({
    uuid: "bravo-rex-eva",
    refUuid: bravo.refUuid,
    name: "Bravo execution EVA",
    sequence: [{ type: "station", uuid: "bravo-rex-station" }],
  });
  mission.evas = {
    [alpha.uuid]: alpha,
    [bravo.uuid]: bravo,
    [alphaRexEva.uuid]: alphaRexEva,
    [bravoRexEva.uuid]: bravoRexEva,
  };
  mission.stations = {
    "alpha-station": generateBlankStation({ uuid: "alpha-station", name: "Site" }),
    "bravo-station": generateBlankStation({ uuid: "bravo-station", name: "Site" }),
    "alpha-rex-station": generateBlankStation({ uuid: "alpha-rex-station", name: "Site" }),
    "bravo-rex-station": generateBlankStation({ uuid: "bravo-rex-station", name: "Site" }),
  };
  const action = (uuid: string, stationUuid: string) =>
    generateBlankAction({ uuid, stationUuid, stmAction: true, enabled: true });
  mission.actions = {
    alphaPlan: action("alpha-plan", "alpha-station"),
    bravoPlan: action("bravo-plan", "bravo-station"),
    alphaExecuted: action("alpha-executed", "alpha-rex-station"),
    bravoExecuted: action("bravo-executed", "bravo-rex-station"),
  };
  mission.rexes = {
    alphaRex: generateBlankRex({
      uuid: "alpha-rex",
      evaUuid: alphaRexEva.uuid,
      name: "Alpha execution",
      createdAt: 20,
      actionEntries: { "alpha-executed": { rexStatus: "complete" } },
    }),
    bravoRex: generateBlankRex({
      uuid: "bravo-rex",
      evaUuid: bravoRexEva.uuid,
      name: "Bravo execution",
      createdAt: 20,
      actionEntries: { "bravo-executed": { rexStatus: "skipped" } },
    }),
  };
  const campaign: ReportCampaign = {
    uuid: "campaign-1",
    name: "Primary plan",
    description: null,
    memberEvaUuids: [alpha.uuid, bravo.uuid],
    executionRexUuidByEvaUuid: null,
    createdAt: 1,
    updatedAt: null,
  };
  mission.reportCampaigns = { [campaign.uuid]: campaign };
  return { mission, campaign };
};

describe("campaign report columns", () => {
  test("adds a planned/executed header group with stable campaign keys", () => {
    const { mission } = buildCampaignFixture();
    const campaignColumns = getEvaColumns(mission).filter((column) => column.campaignUuid);
    expect(campaignColumns.map((column) => column.key)).toEqual([
      "campaign:campaign-1:planned",
      "campaign:campaign-1:executed",
    ]);
    expect(campaignColumns.map((column) => column.groupKey)).toEqual([
      "campaign:campaign-1",
      "campaign:campaign-1",
    ]);
  });

  test("labels REX columns with the matching as-planned EVA name, not the REX event name", () => {
    const { mission } = buildCampaignFixture();
    const rexColumns = getEvaColumns(mission).filter((column) => column.kind === "rex");

    expect(rexColumns.map(({ label }) => label)).toEqual(["Alpha", "Bravo"]);
  });

  test("concatenates member actions and applies the REX status filter per execution", () => {
    const { mission } = buildCampaignFixture();
    const columns = getEvaColumns(mission);
    const planned = columns.find((column) => column.kind === "campaignPlanned")!;
    const executed = columns.find((column) => column.kind === "campaignExecuted")!;

    expect(
      getEligibleActionsForColumn({ mission, column: planned, rexStatusFilter: "all" }).map(
        ({ uuid }) => uuid
      )
    ).toEqual(["alpha-plan", "bravo-plan"]);
    expect(
      getEligibleActionsForColumn({ mission, column: executed, rexStatusFilter: "all" }).map(
        ({ uuid }) => uuid
      )
    ).toEqual(["alpha-executed", "bravo-executed"]);
    expect(
      getEligibleActionsForColumn({
        mission,
        column: executed,
        rexStatusFilter: "notSkipped",
      }).map(({ uuid }) => uuid)
    ).toEqual(["alpha-executed"]);
    expect(
      getEligibleActionsForColumn({
        mission,
        column: executed,
        rexStatusFilter: "completeOnly",
      }).map(({ uuid }) => uuid)
    ).toEqual(["alpha-executed"]);
  });

  test("member-EVA expansion partitions all campaign matches even when station names collide", () => {
    const { mission } = buildCampaignFixture();
    for (const column of getEvaColumns(mission).filter((item) => item.campaignUuid)) {
      const actions = getEligibleActionsForColumn({ mission, column, rexStatusFilter: "all" });
      const memberItems = getCampaignMemberItems(mission, column);
      const perMemberCounts = memberItems.map(
        (item) =>
          actions.filter((action) =>
            actionBelongsToCampaignMember({
              mission,
              column,
              memberEvaUuid: item.uuid,
              action,
            })
          ).length
      );
      expect(memberItems.map(({ name }) => name)).toEqual(
        column.kind === "campaignExecuted" ? ["REX: Alpha", "REX: Bravo"] : ["Alpha", "Bravo"]
      );
      expect(perMemberCounts).toEqual([1, 1]);
      expect(perMemberCounts.reduce((sum, count) => sum + count, 0)).toBe(actions.length);
    }
  });

  test("shared entities are counted once per member occurrence, so sub-columns still sum to total", () => {
    const { mission, campaign } = buildCampaignFixture();
    mission.evas.bravo.sequence = [{ type: "station", uuid: "alpha-station" }];
    mission.actions = {
      shared: generateBlankAction({
        uuid: "shared",
        stationUuid: "alpha-station",
        stmAction: true,
        enabled: true,
      }),
    };
    const column = getEvaColumns(mission).find((item) => item.kind === "campaignPlanned")!;
    const eligible = getEligibleActionsForColumn({ mission, column, rexStatusFilter: "all" });
    expect(eligible.map(({ uuid }) => uuid)).toEqual(["shared", "shared"]);

    const level3Coverage: StmCoverageLevel3 = {
      stmUuid: "stm",
      status: "satisfied",
      rules: [
        {
          ruleUuid: "rule",
          matchCount: 2,
          required: 1,
          satisfied: true,
          matchingActionUuids: eligible.map(({ uuid }) => uuid),
        },
      ],
      totalMatches: 2,
    };
    const counts = groupCampaignMatchesByMember({ mission, column, level3Coverage });
    expect(counts).toEqual({ alpha: 1, bravo: 1 });
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(
      level3Coverage.totalMatches
    );
    expect(campaign.memberEvaUuids).toEqual(["alpha", "bravo"]);
  });
});
