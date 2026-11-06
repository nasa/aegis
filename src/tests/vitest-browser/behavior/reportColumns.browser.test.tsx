import type { BrowserPage } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { setChecked } from "./browserAssertions";

const test = base.extend({ scenario: "execution" as BehavioralScenario });
const headers = [
  "Survey Alpha: Expand into stations",
  "REX: Survey Alpha (Survey Alpha): Expand into stations",
  "Survey Bravo: Expand into stations",
  "REX: Survey Bravo (Survey Bravo): Expand into stations",
];
const headings = (page: BrowserPage) =>
  page.getBySelector('[class*="columnHeaderCell"][role="button"]');
const labels = (page: BrowserPage) =>
  headings(page)
    .elements()
    .map((node) => node.getAttribute("aria-label"));
async function report(page: BrowserPage, title: string) {
  await page.getByLabelText("reports Section", { exact: true }).click();
  await page.getByText(title, { exact: true }).click();
}
async function selector(page: BrowserPage) {
  await page.getByRole("button", { name: /^View/ }).click();
  const panel = page.getByRole("dialog", { name: "Visible report columns", exact: true });
  await expect.element(panel).toBeVisible();
  return panel;
}
for (const title of ["EVA Comparison", "EVA STM Coverage"]) {
  test(`${title} columns preserve family order, filters and local navigation state and reset on remount`, async ({
    page,
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
    await mission.open();
    await report(page, title);
    await expect.poll(() => labels(page)).toEqual(headers);
    let panel = await selector(page);
    await panel.getByRole("button", { name: "Expand Survey Alpha", exact: true }).click();
    await setChecked(panel.getByLabelText("Show REX: Survey Alpha", { exact: true }), false);
    await setChecked(panel.getByLabelText("Show Survey Bravo", { exact: true }), false);
    await panel.getByRole("button", { name: "Close column selector" }).click();
    await expect.poll(() => labels(page)).toEqual([headers[0]]);
    panel = await selector(page);
    await panel.getByLabelText("Find EVA or campaign", { exact: true }).fill("bravo");
    await expect.element(panel.getByText("1 matching groups", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Show matches", exact: true }).click();
    await expect.poll(() => labels(page)).toEqual([headers[0], headers[2], headers[3]]);
    await panel.getByLabelText("Find EVA or campaign", { exact: true }).fill("");
    await panel.getByRole("button", { name: "Hide all", exact: true }).click();
    await expect.poll(() => headings(page).length).toBe(0);
    await panel.getByRole("button", { name: "Show all", exact: true }).click();
    await panel.getByRole("button", { name: "Close column selector" }).click();
    await expect.poll(() => labels(page)).toEqual(headers);
    await page.getByRole("button", { name: headers[0], exact: true }).click();
    await page.getByRole("button", { name: headers[1], exact: true }).click();
    await expect.poll(() => page.getBySelector('[class*="stationHeaderCell"]').length).toBe(14);
    const filter = page.getBySelector(
      '[data-tooltip-content="Which REX action statuses count toward rule satisfaction"] select'
    );
    if (title === "EVA STM Coverage") {
      await page
        .getBySelector('[data-tooltip-content="Show other columns as differences vs the baseline"]')
        .click();
      const summary = page
        .getBySelector('[class*="gridCellLevel3Name"]')
        .filter({ hasText: "Known objective" })
        .getBySelector("xpath=ancestor::div[contains(@class, 'gridCellLevel3Container')]")
        .getBySelector(
          '[class*="tableRowCells"] > div[class*="cell_"]:not([class*="cellStation"])'
        );
      await expect.poll(() => summary.length).toBe(4);
      await expect.element(filter).toHaveValue("all");
      await expect
        .element(summary.nth(1))
        .toHaveAttribute(
          "data-tooltip-html",
          "Survey Alpha: 2 matching actions, 1/1 rules satisfied (all rules satisfied)"
        );
      await filter.selectOptions("completeOnly");
      await expect
        .element(summary.nth(1))
        .toHaveAttribute(
          "data-tooltip-html",
          "Survey Alpha: 1 matching actions, 0/1 rules satisfied (partially satisfied)"
        );
    } else await expect.poll(() => filter.length).toBe(0);
    panel = await selector(page);
    await panel.getByRole("button", { name: "Expand Survey Alpha", exact: true }).click();
    await setChecked(panel.getByLabelText("Show REX: Survey Alpha", { exact: true }), false);
    await panel.getByRole("button", { name: "Close column selector" }).click();
    await expect.poll(() => headings(page).length).toBe(3);
    await page.getByLabelText("station Section", { exact: true }).click();
    await report(page, title);
    await expect.poll(() => headings(page).length).toBe(3);
    await expect
      .element(page.getByRole("button", { name: "Survey Alpha: Collapse stations", exact: true }))
      .toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => page.getBySelector('[class*="stationHeaderCell"]').length).toBe(7);
    if (title === "EVA STM Coverage") await expect.element(filter).toHaveValue("completeOnly");
    await mission.open();
    await report(page, title);
    await expect.poll(() => labels(page)).toEqual(headers);
    await expect.poll(() => page.getBySelector('[class*="stationHeaderCell"]').length).toBe(0);
    if (title === "EVA STM Coverage") await expect.element(filter).toHaveValue("all");
    expect(await mission.read()).toEqual(before);
  });
}
