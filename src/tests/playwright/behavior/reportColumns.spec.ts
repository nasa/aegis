import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";

async function openReport(page: Page, title: string) {
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText(title, { exact: true }).click();
}
const headings = (page: Page) => page.locator('[class*="columnHeaderCell"][role="button"]');
async function showSelector(page: Page) {
  await page.getByRole("button", { name: /^View/ }).click();
  const panel = page.getByRole("dialog", { name: "Visible report columns", exact: true });
  await expect(panel).toBeVisible();
  return panel;
}
const allHeaders = [
  "Survey Alpha: Expand into stations",
  "REX: Survey Alpha (Survey Alpha): Expand into stations",
  "Survey Bravo: Expand into stations",
  "REX: Survey Bravo (Survey Bravo): Expand into stations",
];

test.use({ scenario: "execution" });
for (const title of ["EVA Comparison", "EVA STM Coverage"] as const) {
  test(`${title} column visibility, stable family order, expansion and filters follow their local lifetime`, async ({
    page,
    context,
    mission,
  }) => {
    await mission.change((doc) => {
      const top = "82000000-0000-4000-8000-000000000001";
      const middle = "82000000-0000-4000-8000-000000000002";
      const objective = "82000000-0000-4000-8000-000000000003";
      doc.actionSystemVersion = 2;
      doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
      doc.stmLevel1s = {
        [top]: { uuid: top, name: "Science", numbering: "1", createdAt: 1, updatedAt: 1 },
      };
      doc.stmLevel2s = {
        [middle]: {
          uuid: middle,
          level1Uuid: top,
          name: "Survey",
          numbering: "a",
          createdAt: 1,
          updatedAt: 1,
        },
      };
      doc.stmLevel3s = {
        [objective]: {
          uuid: objective,
          level2Uuid: middle,
          name: "Known objective",
          numbering: "1",
          createdAt: 1,
          updatedAt: 1,
        },
      };
      if (title === "EVA STM Coverage") {
        const verb = "82000000-0000-4000-8000-000000000004";
        const noun = "82000000-0000-4000-8000-000000000005";
        const adjective = "82000000-0000-4000-8000-000000000006";
        const rule = "82000000-0000-4000-8000-000000000007";
        const pendingRexAction = "82000000-0000-4000-8000-000000000008";
        doc.actionDefinitions = {
          verbs: { [verb]: { name: "Observe", abbr: "observe" } },
          nouns: { [noun]: { name: "Core", abbr: "core" } },
          adjectives: { [adjective]: { name: "Pristine", abbr: "pristine" } },
        };
        doc.stmRules = {
          [rule]: {
            uuid: rule,
            stmUuid: objective,
            count: 2,
            verbUuids: [verb],
            nounUuids: [noun],
            adjectiveUuids: [adjective],
            verbAny: false,
            nounAny: false,
            adjectiveAny: false,
            createdAt: 1,
            updatedAt: 1,
          },
        };
        const actionDefinition = {
          verbUuid: verb,
          nounUuid: noun,
          adjectiveUuid: adjective,
        };
        doc.actions[mission.ids.actionA].stmAction = true;
        doc.actions[mission.ids.actionA].actionDefinition = actionDefinition;
        doc.actions[mission.ids.rexActionA].stmAction = true;
        doc.actions[mission.ids.rexActionA].actionDefinition = actionDefinition;
        doc.actions[pendingRexAction] = {
          ...JSON.parse(JSON.stringify(doc.actions[mission.ids.rexActionA])),
          uuid: pendingRexAction,
          refUuid: pendingRexAction,
          name: "Pending matching action",
        };
        doc.stations[mission.ids.rexStationA].actionOrderUuids.push(pendingRexAction);
        doc.rexes[mission.ids.rexA].actionEntries = {
          [mission.ids.rexActionA]: { rexStatus: "complete" },
          [pendingRexAction]: { rexStatus: "pending" },
        };
      }
    });
    const before = await mission.read();
    await mission.open(page);
    await openReport(page, title);
    await expect(headings(page)).toHaveCount(4);
    expect(
      await headings(page).evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label"))
      )
    ).toEqual(allHeaders);
    let panel = await showSelector(page);
    await panel.getByRole("button", { name: "Expand Survey Alpha", exact: true }).click();
    await panel.getByLabel("Show REX: Survey Alpha", { exact: true }).uncheck();
    await panel.getByLabel("Show Survey Bravo", { exact: true }).uncheck();
    await panel.getByRole("button", { name: "Close column selector" }).click();
    await expect(headings(page)).toHaveCount(1);
    await expect(headings(page)).toHaveAttribute("aria-label", allHeaders[0]);
    panel = await showSelector(page);
    await panel.getByLabel("Find EVA or campaign", { exact: true }).fill("bravo");
    await expect(panel.getByText("1 matching groups", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Show matches", exact: true }).click();
    expect(
      await headings(page).evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label"))
      )
    ).toEqual([allHeaders[0], allHeaders[2], allHeaders[3]]);
    await panel.getByLabel("Find EVA or campaign", { exact: true }).fill("");
    await panel.getByRole("button", { name: "Hide all", exact: true }).click();
    await expect(headings(page)).toHaveCount(0);
    await panel.getByRole("button", { name: "Show all", exact: true }).click();
    await panel.getByRole("button", { name: "Close column selector" }).click();
    await expect(headings(page)).toHaveCount(4);
    expect(
      await headings(page).evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label"))
      )
    ).toEqual(allHeaders);
    await page.getByRole("button", { name: allHeaders[0], exact: true }).click();
    await page.getByRole("button", { name: allHeaders[1], exact: true }).click();
    await expect(page.locator('[class*="stationHeaderCell"]')).toHaveCount(14);
    if (title === "EVA STM Coverage") {
      await page
        .locator('[data-tooltip-content="Show other columns as differences vs the baseline"]')
        .click();
      const statusFilter = page.locator(
        '[data-tooltip-content="Which REX action statuses count toward rule satisfaction"] select'
      );
      const objectiveRow = page
        .locator('[class*="gridCellLevel3Name"]')
        .filter({ hasText: "Known objective" })
        .locator("xpath=ancestor::div[contains(@class, 'gridCellLevel3Container')]");
      const summaryCells = objectiveRow.locator(
        '[class*="tableRowCells"] > div[class*="cell_"]:not([class*="cellStation"])'
      );
      await expect(summaryCells).toHaveCount(4);
      await expect(statusFilter).toHaveValue("all");
      await expect
        .poll(() => summaryCells.nth(1).getAttribute("data-tooltip-html"))
        .toBe("Survey Alpha: 2 matching actions, 1/1 rules satisfied (all rules satisfied)");
      await statusFilter.selectOption("completeOnly");
      await expect
        .poll(() => summaryCells.nth(1).getAttribute("data-tooltip-html"))
        .toBe("Survey Alpha: 1 matching actions, 0/1 rules satisfied (partially satisfied)");
    } else {
      await expect(
        page.locator(
          '[data-tooltip-content="Which REX action statuses count toward rule satisfaction"]'
        )
      ).toHaveCount(0);
    }
    panel = await showSelector(page);
    await panel.getByRole("button", { name: "Expand Survey Alpha", exact: true }).click();
    await panel.getByLabel("Show REX: Survey Alpha", { exact: true }).uncheck();
    await panel.getByRole("button", { name: "Close column selector" }).click();
    await expect(headings(page)).toHaveCount(3);
    await page.getByLabel("station Section", { exact: true }).click();
    await openReport(page, title);
    await expect(headings(page)).toHaveCount(3);
    await expect(
      page.getByRole("button", { name: "Survey Alpha: Collapse stations", exact: true })
    ).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator('[class*="stationHeaderCell"]')).toHaveCount(7);
    if (title === "EVA STM Coverage")
      await expect(
        page.locator(
          '[data-tooltip-content="Which REX action statuses count toward rule satisfaction"] select'
        )
      ).toHaveValue("completeOnly");
    const peer = await context.newPage();
    await mission.open(peer);
    await openReport(peer, title);
    await expect(headings(peer)).toHaveCount(4);
    await expect(peer.locator('[class*="stationHeaderCell"]')).toHaveCount(0);
    await mission.open(page);
    await openReport(page, title);
    await expect(headings(page)).toHaveCount(4);
    await expect(page.locator('[class*="stationHeaderCell"]')).toHaveCount(0);
    if (title === "EVA STM Coverage")
      await expect(
        page.locator(
          '[data-tooltip-content="Which REX action statuses count toward rule satisfaction"] select'
        )
      ).toHaveValue("all");
    expect(
      await headings(page).evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label"))
      )
    ).toEqual(allHeaders);
    expect(await mission.read()).toEqual(before);
  });
}
