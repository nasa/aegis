import {
  getAsPlannedEvas,
  getExecutionRexesForEva,
  resolveCampaignExecutionRexes,
} from "utils/evaReportColumns";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankRex } from "store/storeUtils/rex";

const buildFixture = () => {
  const mission = generateBlankMission();
  const alpha = generateBlankEVA({ uuid: "alpha", refUuid: "alpha-ref", name: "Alpha" });
  const bravo = generateBlankEVA({ uuid: "bravo", refUuid: "bravo-ref", name: "bravo" });
  const alphaRexEva = generateBlankEVA({
    uuid: "alpha-rex-eva",
    name: "",
    refUuid: alpha.refUuid,
  });
  const bravoRexEva = generateBlankEVA({
    uuid: "bravo-rex-eva",
    name: "",
    refUuid: bravo.refUuid,
  });
  mission.evas = {
    [alpha.uuid]: alpha,
    [bravo.uuid]: bravo,
    [alphaRexEva.uuid]: alphaRexEva,
    [bravoRexEva.uuid]: bravoRexEva,
  };
  mission.rexes = {
    alphaOld: generateBlankRex({
      uuid: "alphaOld",
      evaUuid: alphaRexEva.uuid,
      name: "Alpha old",
      createdAt: 10,
    }),
    alphaNew: generateBlankRex({
      uuid: "alphaNew",
      evaUuid: alphaRexEva.uuid,
      name: "Alpha new",
      createdAt: 20,
    }),
    bravoRex: generateBlankRex({
      uuid: "bravoRex",
      evaUuid: bravoRexEva.uuid,
      name: "Bravo",
      createdAt: 15,
    }),
  };
  const campaign: ReportCampaign = {
    uuid: "campaign",
    name: "Campaign",
    description: null,
    memberEvaUuids: ["bravo", "alpha"],
    executionRexUuidByEvaUuid: null,
    createdAt: 1,
    updatedAt: null,
  };
  return { mission, campaign };
};

describe("campaign EVA/REX resolution", () => {
  test("lists only as-planned EVAs in case-insensitive name order", () => {
    const { mission } = buildFixture();
    expect(getAsPlannedEvas(mission).map((eva) => eva.uuid)).toEqual(["alpha", "bravo"]);
  });

  test("lists associated execution REXes newest first", () => {
    const { mission } = buildFixture();
    expect(getExecutionRexesForEva(mission, "alpha").map((rex) => rex.uuid)).toEqual([
      "alphaNew",
      "alphaOld",
    ]);
  });

  test("defaults to latest REX and preserves campaign member order", () => {
    const { mission, campaign } = buildFixture();
    expect(resolveCampaignExecutionRexes(mission, campaign).map((rex) => rex.uuid)).toEqual([
      "bravoRex",
      "alphaNew",
    ]);
  });

  test("uses a valid designated REX", () => {
    const { mission, campaign } = buildFixture();
    campaign.executionRexUuidByEvaUuid = { alpha: "alphaOld" };
    expect(resolveCampaignExecutionRexes(mission, campaign).map((rex) => rex.uuid)).toEqual([
      "bravoRex",
      "alphaOld",
    ]);
  });

  test("falls back to latest for stale or wrong-EVA designations", () => {
    const { mission, campaign } = buildFixture();
    campaign.executionRexUuidByEvaUuid = {
      alpha: "bravoRex",
      bravo: "missing",
    };
    expect(resolveCampaignExecutionRexes(mission, campaign).map((rex) => rex.uuid)).toEqual([
      "bravoRex",
      "alphaNew",
    ]);
  });

  test("skips deleted members, members without REXes, and REXes with missing EVAs", () => {
    const { mission, campaign } = buildFixture();
    const charlie = generateBlankEVA({ uuid: "charlie", name: "Charlie" });
    mission.evas.charlie = charlie;
    mission.rexes.ghost = generateBlankRex({ uuid: "ghost", evaUuid: "missing", name: "Ghost" });
    delete mission.evas.bravo;
    campaign.memberEvaUuids = ["bravo", "charlie", "alpha"];
    expect(resolveCampaignExecutionRexes(mission, campaign).map((rex) => rex.uuid)).toEqual([
      "alphaNew",
    ]);
  });

  test("breaks equal/missing createdAt ties deterministically by uuid", () => {
    const { mission } = buildFixture();
    mission.rexes.alphaOld.createdAt = undefined;
    mission.rexes.alphaNew.createdAt = undefined;
    mission.rexes.zeta = generateBlankRex({
      uuid: "zeta",
      evaUuid: "alpha-rex-eva",
      name: "Zeta",
      createdAt: undefined,
    });
    expect(getExecutionRexesForEva(mission, "alpha").map((rex) => rex.uuid)).toEqual([
      "zeta",
      "alphaOld",
      "alphaNew",
    ]);
  });
});
