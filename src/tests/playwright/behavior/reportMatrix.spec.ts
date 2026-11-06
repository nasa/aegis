import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { seedPoi } from "../fixtures/entitySeeds";
import {
  enablePlanningEditMode,
  selectPlanningPoi,
  confirmPlanningDelete,
} from "./planningHelpers";

function cells(page: Page, label: string) {
  return page
    .locator(`div[data-tooltip-html="${label}"]`)
    .locator("..")
    .locator('[class*="tableRowCells"] > [data-tooltip-id="aegis-tooltip"]');
}

for (const remainingPoi of [false, true]) {
  test(`empty reports and remote deletion recover ${remainingPoi ? "to another POI" : "to an explicit empty state"} without incidental mutations`, async ({
    page,
    context,
    mission,
  }) => {
    const second = "90000000-0000-4000-8000-000000000099";
    await mission.change((doc) => {
      doc.actionSystemVersion = 2;
      doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
      doc.evas = {};
      doc.traverses = {};
      doc.rexes = {};
      doc.reportCampaigns = remainingPoi
        ? {
            "83000000-0000-4000-8000-000000000001": {
              uuid: "83000000-0000-4000-8000-000000000001",
              name: "Empty campaign",
              description: null,
              memberEvaUuids: [],
              executionRexUuidByEvaUuid: null,
              createdAt: 1,
              updatedAt: null,
            },
          }
        : {};
      if (remainingPoi) doc.pois[second] = seedPoi({ uuid: second, name: "Surviving outcrop" });
    });
    const before = await mission.read();
    await mission.open(page);
    await page.getByLabel("reports Section", { exact: true }).click();
    await expect(page.getByText(/No STM objectives are configured/)).toBeVisible();
    await page.getByText("EVA Comparison", { exact: true }).click();
    await expect(cells(page, "Station count")).toHaveText(remainingPoi ? ["", ""] : []);
    await page.getByRole("button", { name: /^View/ }).click();
    const selector = page.getByRole("dialog", { name: "Visible report columns" });
    if (remainingPoi)
      await expect(selector.getByLabel("Show Empty campaign", { exact: true })).toBeChecked();
    else await expect(selector.getByText("No columns available.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close column selector" }).click();
    await page.getByText("Campaigns…", { exact: true }).click();
    const campaigns = page.locator("dialog[open]");
    if (remainingPoi) {
      await campaigns.getByRole("button", { name: "Empty campaign", exact: true }).click();
      await expect(
        campaigns.getByText("No as-planned EVAs are available.", { exact: true })
      ).toBeVisible();
      await expect(campaigns.getByText("0 of 0 executed", { exact: true })).toBeVisible();
    } else await expect(campaigns.getByText("No campaigns yet.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close campaigns" }).click();
    await page.getByText("POI Traceability", { exact: true }).click();
    await expect(page.getByRole("region", { name: "Reference POI action trace" })).toBeVisible();
    expect(await mission.read()).toEqual(before);
    const peer = await context.newPage();
    await mission.open(peer);
    await enablePlanningEditMode(peer);
    await selectPlanningPoi(peer, "Reference POI");
    await confirmPlanningDelete(peer, "deletePoi");
    await expect(page.getByRole("region", { name: "Reference POI action trace" })).toHaveCount(0);
    if (remainingPoi)
      await expect(
        page.getByRole("region", { name: "Surviving outcrop action trace" })
      ).toBeVisible();
    else {
      await expect(page.getByText("No POIs in this mission.", { exact: true })).toBeVisible();
      await expect(
        page.getByText("Choose a POI to trace its actions.", { exact: true })
      ).toBeVisible();
    }
    const after = await mission.read();
    expect(after.pois[mission.ids.poiA]).toBeUndefined();
    expect(after.evas).toEqual(before.evas);
    expect(after.traverses).toEqual(before.traverses);
    expect(after.rexes).toEqual(before.rexes);
    expect(after.reportCampaigns).toEqual(before.reportCampaigns);
    await page.getByText("EVA Comparison", { exact: true }).click();
    await expect(cells(page, "Station count")).toHaveText(remainingPoi ? ["", ""] : []);
    await page.getByText("POI Traceability", { exact: true }).click();
    expect(await mission.read()).toEqual(after);
  });
}
