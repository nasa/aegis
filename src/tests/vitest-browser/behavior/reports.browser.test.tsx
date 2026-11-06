import type { Locator, BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";

async function openComparison(page: Page): Promise<void> {
  await page.getByLabelText("reports Section", { exact: true }).click();
  await page.getByText("EVA Comparison", { exact: true }).click();
  await expect.element(page.getByText("Metric", { exact: true })).toBeVisible();
  // Each fresh page starts in difference mode; establish absolute values first.
  await page.getByText("Diff", { exact: true }).click();
}

function metricCells(page: Page, label: string): Locator {
  return page
    .getBySelector(`div[data-tooltip-html="${label}"]`)
    .getBySelector("..")
    .getBySelector('[class*="tableRowCells"] > [data-tooltip-id="aegis-tooltip"]');
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
    await mission.open();
    await openComparison(page);
    // Alpha visits egress, Alpha, Bravo, ingress; Bravo visits egress, Bravo, ingress.
    await expect
      .poll(() =>
        metricCells(page, "Station count")
          .elements()
          .map((element) => element.textContent.trim().replace(/\s+/g, " "))
      )
      .toEqual(["4", "3"]);
    await expect
      .poll(() =>
        metricCells(page, "Action count")
          .elements()
          .map((element) => element.textContent.trim().replace(/\s+/g, " "))
      )
      .toEqual(["1", "0"]);
    await expect
      .poll(() =>
        metricCells(page, "Total action time")
          .elements()
          .map((element) => element.textContent.trim().replace(/\s+/g, " "))
      )
      .toEqual(["6", "0"]);
    await expect
      .poll(() =>
        metricCells(page, "Total EVA time (allotted)")
          .elements()
          .map((element) => element.textContent.trim().replace(/\s+/g, " "))
      )
      .toEqual(["240", "180"]);
    await page.getByText("Diff", { exact: true }).click();
    await expect
      .poll(() =>
        metricCells(page, "Station count")
          .elements()
          .map((element) => element.textContent.trim().replace(/\s+/g, " "))
      )
      .toEqual(["4", "−1"]);
    await expect
      .poll(() =>
        metricCells(page, "Action count")
          .elements()
          .map((element) => element.textContent.trim().replace(/\s+/g, " "))
      )
      .toEqual(["1", "−1"]);
    await expect
      .poll(() =>
        metricCells(page, "Total EVA time (allotted)")
          .elements()
          .map((element) => element.textContent.trim().replace(/\s+/g, " "))
      )
      .toEqual(["240", "−60"]);
    await page.getByText("Diff", { exact: true }).click();
    await expect
      .poll(() =>
        metricCells(page, "Action count")
          .elements()
          .map((element) => element.textContent.trim().replace(/\s+/g, " "))
      )
      .toEqual(["1", "0"]);

    await page
      .getByRole("button", { name: "Survey Alpha: Expand into stations", exact: true })
      .click();
    await expect.element(page.getByText("Alpha station", { exact: true })).toBeVisible();
    // Total plus egress, outbound traverse, Alpha, middle traverse, Bravo, return, ingress.
    await expect
      .poll(() =>
        metricCells(page, "Action count")
          .elements()
          .map((element) => element.textContent.trim().replace(/\s+/g, " "))
      )
      .toEqual(["1", "0", "0", "1", "0", "0", "0", "0", "0"]);
    await page
      .getByRole("button", { name: "Survey Alpha: Collapse stations", exact: true })
      .click();
    await expect
      .poll(() =>
        metricCells(page, "Action count")
          .elements()
          .map((element) => element.textContent.trim().replace(/\s+/g, " "))
      )
      .toEqual(["1", "0"]);
    expect(await mission.read()).toEqual(before);
  });
});
