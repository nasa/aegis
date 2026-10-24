import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  savePlanningField,
  selectPlanningStationActions,
} from "./planningHelpers";

async function openComparison(page: Page): Promise<void> {
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText("EVA Comparison", { exact: true }).click();
  await expect(page.getByText("Metric", { exact: true })).toBeVisible();
  // Each fresh page starts in difference mode; establish absolute values first.
  await page.getByText("Diff", { exact: true }).click();
}

function metricCells(page: Page, label: string): Locator {
  return page
    .locator(`div[data-tooltip-html="${label}"]`)
    .locator("..")
    .locator('[class*="tableRowCells"] > [data-tooltip-id="aegis-tooltip"]');
}

test.describe("EVA comparison report contracts", () => {
  test.beforeEach(async ({ mission }) => {
    await mission.change((doc) => {
      doc.actionSystemVersion = 2;
      doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
    });
  });

  test("comparison shows known plan metrics, signed differences, and station breakdowns without changing mission data", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await openComparison(page);
    // Alpha visits egress, Alpha, Bravo, ingress; Bravo visits egress, Bravo, ingress.
    await expect(metricCells(page, "Station count")).toHaveText(["4", "3"]);
    await expect(metricCells(page, "Action count")).toHaveText(["1", "0"]);
    await expect(metricCells(page, "Total action time")).toHaveText(["6", "0"]);
    await expect(metricCells(page, "Total EVA time (allotted)")).toHaveText(["240", "180"]);
    await page.getByText("Diff", { exact: true }).click();
    await expect(metricCells(page, "Station count")).toHaveText(["4", "−1"]);
    await expect(metricCells(page, "Action count")).toHaveText(["1", "−1"]);
    await expect(metricCells(page, "Total EVA time (allotted)")).toHaveText(["240", "−60"]);
    await page.getByText("Diff", { exact: true }).click();
    await expect(metricCells(page, "Action count")).toHaveText(["1", "0"]);

    await page
      .getByRole("button", { name: "Survey Alpha: Expand into stations", exact: true })
      .click();
    await expect(page.getByText("Alpha station", { exact: true })).toBeVisible();
    // Total plus egress, outbound traverse, Alpha, middle traverse, Bravo, return, ingress.
    await expect(metricCells(page, "Action count")).toHaveText([
      "1",
      "0",
      "0",
      "1",
      "0",
      "0",
      "0",
      "0",
      "0",
    ]);
    await page
      .getByRole("button", { name: "Survey Alpha: Collapse stations", exact: true })
      .click();
    await expect(metricCells(page, "Action count")).toHaveText(["1", "0"]);
    expect(await mission.read()).toEqual(before);
  });

  test("a saved action duration reaches an open report in another client and survives reload", async ({
    page,
    context,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    const report = await context.newPage();
    const reportErrors: string[] = [];
    report.on("pageerror", (error) => reportErrors.push(error.message));
    try {
      await mission.open(report);
      await openComparison(report);
      await expect(metricCells(report, "Total action time")).toHaveText(["6", "0"]);
      await page
        .getByRole("listitem")
        .filter({
          has: page.locator('div[aria-label="Action Name"]').filter({ hasText: "Sample regolith" }),
        })
        .locator('svg[data-icon="caret-right"]')
        .click();
      await savePlanningField(page, "Duration in minutes", "23");
      await expect(metricCells(report, "Total action time")).toHaveText(["23", "0"]);
      await expect
        .poll(async () => (await mission.read()).actions[mission.ids.actionA].duration)
        .toBe(23);
      await report.reload();
      await openComparison(report);
      await expect(metricCells(report, "Total action time")).toHaveText(["23", "0"]);
      await expect(metricCells(report, "Action count")).toHaveText(["1", "0"]);
      expect(reportErrors, "The report client must not raise uncaught errors").toEqual([]);
    } finally {
      await report.close();
    }
  });
});
