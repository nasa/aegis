import type { BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";

async function openReport(page: Page): Promise<void> {
  await page.getByLabelText("reports Section", { exact: true }).click();
  await page.getByText("Mission Priorities", { exact: true }).click();
  await page.getByLabelText("Diff", { exact: true }).click();
}

test("legacy missions hide reports and empty v2 missions explain missing priorities", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.actionSystemVersion = 1;
  });
  await mission.open();
  await expect.poll(() => page.getByLabelText("reports Section", { exact: true }).length).toBe(0);
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
    doc.missionPriorities = {};
  });
  await mission.open();
  await openReport(page);
  await expect
    .element(
      page.getByText("No Mission Priority Identifiers are configured for this mission.", {
        exact: true,
      })
    )
    .toBeVisible();
});
