import { exactText } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";

const test = base.extend({ scenario: "execution" as BehavioralScenario });

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
  await page.getByLabelText("reports Section", { exact: true }).click();
  await page.getByText("EVA STM Coverage", { exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: "Survey Alpha: Expand into stations", exact: true }))
    .toBeVisible();
  // The saved report begins in differences mode; switch to absolute values for the known totals.
  await page.getByLabelText("Diff", { exact: true }).click();
}

function objectiveRow(page: Page) {
  return page
    .getBySelector('[class*="gridCellLevel3Name"]')
    .filter({ hasText: "Known core objective" })
    .getBySelector("xpath=ancestor::div[contains(@class, 'gridCellLevel3Container')][1]");
}

function summaryCell(page: Page, columnIndex: number) {
  return objectiveRow(page)
    .getBySelector('[class*="tableRowCells"] > div[class*="cell_"]:not([class*="cellStation"])')
    .nth(columnIndex);
}

function summaryExpectation(page: Page, columnIndex: number, message: RegExp) {
  return expect
    .poll(() => summaryCell(page, columnIndex).element().getAttribute("data-tooltip-html"))
    .toMatch(message);
}

test("STM coverage totals and satisfaction follow independent plan, REX, and campaign fixtures", async ({
  page,
  mission,
}) => {
  const before = await mission.read();
  await mission.open();
  await openCoverageReport(page);

  await expect
    .poll(() => summaryCell(page, 0).element().getAttribute("data-tooltip-html"))
    .toMatch(/3 matching actions, 2\/2 rules satisfied \(all rules satisfied\)/);
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

  const statusFilter = page.getBySelector(
    '[data-tooltip-content="Which REX action statuses count toward rule satisfaction"] select'
  );
  await expect.element(statusFilter).toHaveValue("all");
  await statusFilter.selectOptions("completeOnly");
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
  await expect.element(statusFilter).toHaveValue("completeOnly");
  await statusFilter.selectOptions("notSkipped");
  await summaryExpectation(
    page,
    1,
    /2 matching actions, 1\/2 rules satisfied \(partially satisfied\)/
  );
  await expect.element(statusFilter).toHaveValue("notSkipped");
  expect(await mission.read()).toEqual(before);
});

test("STM drilldown expands sequence counts and scopes matched and unmatched rules to the selected plan or REX", async ({
  page,
  mission,
}) => {
  const before = await mission.read();
  await mission.open();
  await openCoverageReport(page);

  await page
    .getByRole("button", { name: "Survey Alpha: Expand into stations", exact: true })
    .click();
  await expect
    .element(
      objectiveRow(page).getBySelector('[data-tooltip-html="Alpha station: 2 matching actions"]')
    )
    .toMatchTextContent(exactText("2"));
  await expect
    .element(
      objectiveRow(page).getBySelector('[data-tooltip-html="Bravo station: 1 matching actions"]')
    )
    .toMatchTextContent(exactText("1"));

  await summaryCell(page, 1).click();
  const panel = page.getBySelector('[class*="drilldownContent"]');
  await expect
    .element(page.getBySelector('[class*="drilldownTitle"]'))
    .toMatchTextContent(exactText("Known core objective"));
  await expect
    .element(page.getBySelector('[class*="drilldownSubtitle"]'))
    .toMatchTextContent(exactText("REX: Survey Alpha"));
  await expect
    .poll(
      () =>
        panel.getBySelector('[class*="drilldownRuleCounts"]').filter({ hasText: "2 of 2 required" })
          .length
    )
    .toBe(1);
  await expect
    .poll(
      () =>
        panel.getBySelector('[class*="drilldownRuleCounts"]').filter({ hasText: "1 of 1 required" })
          .length
    )
    .toBe(1);
  await expect.poll(() => panel.getBySelector('[class*="drilldownActionRow"]').length).toBe(3);
  await expect
    .poll(
      () =>
        panel.getBySelector('[class*="drilldownActionRow"]').filter({ hasText: "Observe" }).length
    )
    .toBe(2);
  await expect
    .poll(
      () =>
        panel.getBySelector('[class*="drilldownActionRow"]').filter({ hasText: "Collect" }).length
    )
    .toBe(1);

  const statusFilter = page.getBySelector(
    '[data-tooltip-content="Which REX action statuses count toward rule satisfaction"] select'
  );
  await statusFilter.selectOptions("completeOnly");
  await expect
    .element(page.getBySelector('[class*="drilldownSubtitle"]'))
    .toMatchTextContent(exactText("REX: Survey Alpha"));
  await expect
    .poll(
      () =>
        panel.getBySelector('[class*="drilldownRuleCounts"]').filter({ hasText: "1 of 2 required" })
          .length
    )
    .toBe(1);
  await expect.poll(() => panel.getBySelector('[class*="drilldownActionRow"]').length).toBe(2);
  await expect
    .poll(
      () =>
        panel.getBySelector('[class*="drilldownActionRow"]').filter({ hasText: "Observe" }).length
    )
    .toBe(1);

  await summaryCell(page, 2).click();
  await expect
    .element(page.getBySelector('[class*="drilldownSubtitle"]'))
    .toMatchTextContent(exactText("Survey Bravo"));
  await expect
    .poll(
      () =>
        panel.getBySelector('[class*="drilldownRuleCounts"]').filter({ hasText: "0 of 2 required" })
          .length
    )
    .toBe(1);
  await expect
    .poll(
      () =>
        panel.getBySelector('[class*="drilldownRuleCounts"]').filter({ hasText: "1 of 1 required" })
          .length
    )
    .toBe(1);
  await expect.poll(() => panel.getBySelector('[class*="drilldownActionRow"]').length).toBe(1);
  await expect
    .poll(
      () =>
        panel.getBySelector('[class*="drilldownActionRow"]').filter({ hasText: "Collect" }).length
    )
    .toBe(1);
  await expect
    .poll(
      () =>
        panel.getBySelector('[class*="drilldownActionRow"]').filter({ hasText: "Observe" }).length
    )
    .toBe(0);

  await summaryCell(page, 5).click();
  await expect
    .element(page.getBySelector('[class*="drilldownSubtitle"]'))
    .toMatchTextContent(exactText("Executed set"));
  await expect.poll(() => panel.getBySelector('[class*="drilldownActionRow"]').length).toBe(3);
  expect(await mission.read()).toEqual(before);
});
