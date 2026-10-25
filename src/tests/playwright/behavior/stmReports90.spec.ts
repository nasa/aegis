import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";

test.use({ scenario: "execution" });

const ids = {
  verbObserve: "83000000-0000-4000-8000-000000000001",
  verbCollect: "83000000-0000-4000-8000-000000000002",
  nounCore: "83000000-0000-4000-8000-000000000003",
  adjectivePristine: "83000000-0000-4000-8000-000000000004",
  level1: "83000000-0000-4000-8000-000000000011",
  level2: "83000000-0000-4000-8000-000000000012",
  level3: "83000000-0000-4000-8000-000000000013",
  observeRule: "83000000-0000-4000-8000-000000000021",
  collectRule: "83000000-0000-4000-8000-000000000022",
  plannedExact2: "83000000-0000-4000-8000-000000000031",
  plannedCollect: "83000000-0000-4000-8000-000000000032",
  plannedUnmatched: "83000000-0000-4000-8000-000000000033",
  plannedDisabled: "83000000-0000-4000-8000-000000000034",
  rexExactSkipped: "83000000-0000-4000-8000-000000000041",
  rexCollectComplete: "83000000-0000-4000-8000-000000000042",
  rexUnmatched: "83000000-0000-4000-8000-000000000043",
  rexDisabled: "83000000-0000-4000-8000-000000000044",
  rexBExactSkipped: "83000000-0000-4000-8000-000000000045",
  rexBCollectComplete: "83000000-0000-4000-8000-000000000046",
  campaign: "83000000-0000-4000-8000-000000000051",
} as const;

const definition = (verbUuid: string, adjectiveUuid: string | null = ids.adjectivePristine) => ({
  verbUuid,
  nounUuid: ids.nounCore,
  ...(adjectiveUuid ? { adjectiveUuid } : {}),
});

test.beforeEach(async ({ mission }) => {
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = {
      verbs: {
        [ids.verbObserve]: { name: "Observe", abbr: "observe" },
        [ids.verbCollect]: { name: "Collect", abbr: "collect" },
      },
      nouns: { [ids.nounCore]: { name: "Core", abbr: "core" } },
      adjectives: { [ids.adjectivePristine]: { name: "Pristine", abbr: "pristine" } },
    };
    doc.actionDefinitionConjunctions = { verbToNoun: "of", nounToAdjective: "in" };
    doc.stmLevel1s[ids.level1] = {
      uuid: ids.level1,
      name: "Mission Science",
      numbering: "1",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmLevel2s[ids.level2] = {
      uuid: ids.level2,
      level1Uuid: ids.level1,
      name: "Sampling",
      numbering: "a",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmLevel3s[ids.level3] = {
      uuid: ids.level3,
      level2Uuid: ids.level2,
      name: "Known core objective",
      numbering: "1",
      createdAt: 1,
      updatedAt: 1,
    };
    doc.stmRules = {
      [ids.observeRule]: {
        uuid: ids.observeRule,
        stmUuid: ids.level3,
        count: 2,
        verbUuids: [ids.verbObserve],
        nounUuids: [ids.nounCore],
        adjectiveUuids: [ids.adjectivePristine],
        verbAny: false,
        nounAny: false,
        adjectiveAny: false,
        createdAt: 1,
        updatedAt: 1,
      },
      [ids.collectRule]: {
        uuid: ids.collectRule,
        stmUuid: ids.level3,
        count: 1,
        verbUuids: [ids.verbCollect],
        nounUuids: [ids.nounCore],
        adjectiveUuids: [ids.adjectivePristine],
        verbAny: false,
        nounAny: false,
        adjectiveAny: false,
        createdAt: 2,
        updatedAt: 2,
      },
    };

    const source = doc.actions[mission.ids.actionA];
    source.stmAction = true;
    source.actionDefinition = definition(ids.verbObserve);

    const addAction = ({
      uuid,
      name,
      stationUuid,
      actionDefinition,
      enabled = true,
    }: {
      uuid: string;
      name: string;
      stationUuid: string;
      actionDefinition: ActionDefinition;
      enabled?: boolean;
    }): Action => {
      const action: Action = JSON.parse(JSON.stringify(source));
      action.uuid = uuid;
      action.refUuid = uuid;
      action.name = name;
      action.poiUuid = null;
      action.traverseUuid = null;
      action.stationUuid = stationUuid;
      action.parentActionUuid = null;
      action.parentCopyDate = null;
      action.stmAction = true;
      action.actionDefinition = actionDefinition;
      action.enabled = enabled;
      doc.actions[uuid] = action;
      doc.stations[stationUuid].actionOrderUuids.push(uuid);
      return action;
    };

    addAction({
      uuid: ids.plannedExact2,
      name: "Known planned exact duplicate",
      stationUuid: mission.ids.stationA,
      actionDefinition: definition(ids.verbObserve),
    });
    addAction({
      uuid: ids.plannedCollect,
      name: "Known planned collect",
      stationUuid: mission.ids.stationB,
      actionDefinition: definition(ids.verbCollect),
    });
    addAction({
      uuid: ids.plannedUnmatched,
      name: "Known planned incomplete tuple",
      stationUuid: mission.ids.stationB,
      actionDefinition: definition(ids.verbObserve, null),
    });
    addAction({
      uuid: ids.plannedDisabled,
      name: "Known planned disabled collect",
      stationUuid: mission.ids.stationA,
      actionDefinition: definition(ids.verbCollect),
      enabled: false,
    });

    doc.actions[mission.ids.rexActionA].stmAction = true;
    doc.actions[mission.ids.rexActionA].actionDefinition = definition(ids.verbObserve);
    const addRexAction = (
      uuid: string,
      name: string,
      stationUuid: string,
      actionDefinition: ActionDefinition,
      enabled = true
    ) => {
      addAction({ uuid, name, stationUuid, actionDefinition, enabled });
      doc.actions[uuid].refUuid = `ref-${uuid}`;
    };
    addRexAction(
      ids.rexExactSkipped,
      "Known skipped exact",
      mission.ids.rexStationA,
      definition(ids.verbObserve)
    );
    addRexAction(
      ids.rexCollectComplete,
      "Known complete collect",
      mission.ids.rexStationA,
      definition(ids.verbCollect)
    );
    addRexAction(
      ids.rexUnmatched,
      "Known executed incomplete tuple",
      mission.ids.rexStationA,
      definition(ids.verbObserve, null)
    );
    addRexAction(
      ids.rexDisabled,
      "Known executed disabled collect",
      mission.ids.rexStationA,
      definition(ids.verbCollect),
      false
    );
    addRexAction(
      ids.rexBExactSkipped,
      "Known Bravo skipped exact",
      mission.ids.rexStationB,
      definition(ids.verbObserve)
    );
    addRexAction(
      ids.rexBCollectComplete,
      "Known Bravo complete collect",
      mission.ids.rexStationB,
      definition(ids.verbCollect)
    );

    doc.rexes[mission.ids.rexA].actionEntries = {
      [mission.ids.rexActionA]: { rexStatus: "complete" },
      [ids.rexExactSkipped]: { rexStatus: "skipped" },
      [ids.rexCollectComplete]: { rexStatus: "complete" },
      [ids.rexUnmatched]: { rexStatus: "complete" },
      [ids.rexDisabled]: { rexStatus: "complete" },
    };
    doc.rexes[mission.ids.rexB].actionEntries = {
      [ids.rexBExactSkipped]: { rexStatus: "skipped" },
      [ids.rexBCollectComplete]: { rexStatus: "complete" },
    };
    doc.reportCampaigns = {
      [ids.campaign]: {
        uuid: ids.campaign,
        name: "Known science campaign",
        description: null,
        memberEvaUuids: [mission.ids.evaA, mission.ids.evaB],
        executionRexUuidByEvaUuid: {
          [mission.ids.evaA]: mission.ids.rexA,
          [mission.ids.evaB]: mission.ids.rexB,
        },
        createdAt: 1,
        updatedAt: 1,
      },
    };
  });
});

async function openCoverageReport(page: Page): Promise<void> {
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText("EVA STM Coverage", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Survey Alpha: Expand into stations", exact: true })
  ).toBeVisible();
  // The saved report begins in differences mode; switch to absolute values for the known totals.
  await page.getByLabel("Diff", { exact: true }).click();
}

function objectiveRow(page: Page) {
  return page
    .locator('[class*="gridCellLevel3Name"]')
    .filter({ hasText: "Known core objective" })
    .locator("xpath=ancestor::div[contains(@class, 'gridCellLevel3Container')][1]");
}

function summaryCell(page: Page, columnIndex: number) {
  return objectiveRow(page)
    .locator('[class*="tableRowCells"] > div[class*="cell_"]:not([class*="cellStation"])')
    .nth(columnIndex);
}

function summaryExpectation(page: Page, columnIndex: number, message: RegExp) {
  return expect(summaryCell(page, columnIndex)).toHaveAttribute("data-tooltip-html", message);
}

test("STM coverage totals and satisfaction follow independent plan, REX, and campaign fixtures", async ({
  page,
  mission,
}) => {
  const before = await mission.read();
  await mission.open(page);
  await openCoverageReport(page);

  await expect(summaryCell(page, 0)).toHaveAttribute(
    "data-tooltip-html",
    /3 matching actions, 2\/2 rules satisfied \(all rules satisfied\)/
  );
  await summaryExpectation(
    page,
    1,
    /3 matching actions, 2\/2 rules satisfied \(all rules satisfied\)/
  );
  await summaryExpectation(
    page,
    2,
    /1 matching actions, 1\/2 rules satisfied \(partially satisfied\)/
  );
  await summaryExpectation(
    page,
    3,
    /2 matching actions, 1\/2 rules satisfied \(partially satisfied\)/
  );
  await summaryExpectation(
    page,
    4,
    /4 matching actions, 2\/2 rules satisfied \(all rules satisfied\)/
  );
  await summaryExpectation(
    page,
    5,
    /5 matching actions, 2\/2 rules satisfied \(all rules satisfied\)/
  );

  const statusFilter = page.locator(
    '[data-tooltip-content="Which REX action statuses count toward rule satisfaction"] select'
  );
  await expect(statusFilter).toHaveValue("all");
  await statusFilter.selectOption("completeOnly");
  await summaryExpectation(
    page,
    0,
    /3 matching actions, 2\/2 rules satisfied \(all rules satisfied\)/
  );
  await summaryExpectation(
    page,
    1,
    /2 matching actions, 1\/2 rules satisfied \(partially satisfied\)/
  );
  await summaryExpectation(
    page,
    3,
    /1 matching actions, 1\/2 rules satisfied \(partially satisfied\)/
  );
  await summaryExpectation(
    page,
    4,
    /4 matching actions, 2\/2 rules satisfied \(all rules satisfied\)/
  );
  await summaryExpectation(
    page,
    5,
    /3 matching actions, 1\/2 rules satisfied \(partially satisfied\)/
  );
  await expect(statusFilter).toHaveValue("completeOnly");
  await statusFilter.selectOption("notSkipped");
  await summaryExpectation(
    page,
    1,
    /2 matching actions, 1\/2 rules satisfied \(partially satisfied\)/
  );
  await expect(statusFilter).toHaveValue("notSkipped");
  expect(await mission.read()).toEqual(before);
});

test("STM drilldown expands sequence counts and scopes matched and unmatched rules to the selected plan or REX", async ({
  page,
  mission,
}) => {
  const before = await mission.read();
  await mission.open(page);
  await openCoverageReport(page);

  await page
    .getByRole("button", { name: "Survey Alpha: Expand into stations", exact: true })
    .click();
  await expect(
    objectiveRow(page).locator('[data-tooltip-html="Alpha station: 2 matching actions"]')
  ).toHaveText("2");
  await expect(
    objectiveRow(page).locator('[data-tooltip-html="Bravo station: 1 matching actions"]')
  ).toHaveText("1");

  await summaryCell(page, 1).click();
  const panel = page.locator('[class*="drilldownContent"]');
  await expect(page.locator('[class*="drilldownTitle"]')).toHaveText("Known core objective");
  await expect(page.locator('[class*="drilldownSubtitle"]')).toHaveText("REX: Survey Alpha");
  await expect(
    panel.locator('[class*="drilldownRuleCounts"]').filter({ hasText: "2 of 2 required" })
  ).toHaveCount(1);
  await expect(
    panel.locator('[class*="drilldownRuleCounts"]').filter({ hasText: "1 of 1 required" })
  ).toHaveCount(1);
  await expect(panel.locator('[class*="drilldownActionRow"]')).toHaveCount(3);
  await expect(
    panel.locator('[class*="drilldownActionRow"]').filter({ hasText: "Observe" })
  ).toHaveCount(2);
  await expect(
    panel.locator('[class*="drilldownActionRow"]').filter({ hasText: "Collect" })
  ).toHaveCount(1);

  const statusFilter = page.locator(
    '[data-tooltip-content="Which REX action statuses count toward rule satisfaction"] select'
  );
  await statusFilter.selectOption("completeOnly");
  await expect(page.locator('[class*="drilldownSubtitle"]')).toHaveText("REX: Survey Alpha");
  await expect(
    panel.locator('[class*="drilldownRuleCounts"]').filter({ hasText: "1 of 2 required" })
  ).toHaveCount(1);
  await expect(panel.locator('[class*="drilldownActionRow"]')).toHaveCount(2);
  await expect(
    panel.locator('[class*="drilldownActionRow"]').filter({ hasText: "Observe" })
  ).toHaveCount(1);

  await summaryCell(page, 2).click();
  await expect(page.locator('[class*="drilldownSubtitle"]')).toHaveText("Survey Bravo");
  await expect(
    panel.locator('[class*="drilldownRuleCounts"]').filter({ hasText: "0 of 2 required" })
  ).toHaveCount(1);
  await expect(
    panel.locator('[class*="drilldownRuleCounts"]').filter({ hasText: "1 of 1 required" })
  ).toHaveCount(1);
  await expect(panel.locator('[class*="drilldownActionRow"]')).toHaveCount(1);
  await expect(
    panel.locator('[class*="drilldownActionRow"]').filter({ hasText: "Collect" })
  ).toHaveCount(1);
  await expect(
    panel.locator('[class*="drilldownActionRow"]').filter({ hasText: "Observe" })
  ).toHaveCount(0);

  await summaryCell(page, 5).click();
  await expect(page.locator('[class*="drilldownSubtitle"]')).toHaveText("Executed set");
  await expect(panel.locator('[class*="drilldownActionRow"]')).toHaveCount(3);
  expect(await mission.read()).toEqual(before);
});
