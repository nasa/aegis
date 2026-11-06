import type { BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";
import { seedPoi } from "tests/playwright/fixtures/entitySeeds";

function cells(page: Page, label: string) {
  return page
    .getBySelector(`div[data-tooltip-html="${label}"]`)
    .getBySelector("..")
    .getBySelector('[class*="tableRowCells"] > [data-tooltip-id="aegis-tooltip"]');
}

for (const remainingPoi of [false, true]) {
  test(`empty reports and external document deletion recover ${remainingPoi ? "to another POI" : "to an explicit empty state"} without incidental mutations`, async ({
    page,
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
    await mission.open();
    await page.getByLabelText("reports Section", { exact: true }).click();
    await expect.element(page.getByText(/No STM objectives are configured/)).toBeVisible();
    await page.getByText("EVA Comparison", { exact: true }).click();
    await expect
      .poll(() =>
        cells(page, "Station count")
          .elements()
          .map((element) => element.textContent.trim())
      )
      .toEqual(remainingPoi ? ["", ""] : []);
    await page.getByRole("button", { name: /^View/ }).click();
    const selector = page.getByRole("dialog", { name: "Visible report columns" });
    if (remainingPoi)
      await expect
        .element(selector.getByLabelText("Show Empty campaign", { exact: true }))
        .toBeChecked();
    else
      await expect
        .element(selector.getByText("No columns available.", { exact: true }))
        .toBeVisible();
    await page.getByRole("button", { name: "Close column selector" }).click();
    await page.getByText("Campaigns…", { exact: true }).click();
    const campaigns = page.getBySelector("dialog[open]");
    if (remainingPoi) {
      await campaigns.getByRole("button", { name: "Empty campaign", exact: true }).click();
      await expect
        .element(campaigns.getByText("No as-planned EVAs are available.", { exact: true }))
        .toBeVisible();
      await expect.element(campaigns.getByText("0 of 0 executed", { exact: true })).toBeVisible();
    } else
      await expect.element(campaigns.getByText("No campaigns yet.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close campaigns" }).click();
    await page.getByText("POI Traceability", { exact: true }).click();
    await expect
      .element(page.getByRole("region", { name: "Reference POI action trace" }))
      .toBeVisible();
    expect(await mission.read()).toEqual(before);
    await mission.change((doc) => {
      delete doc.pois[mission.ids.poiA];
      for (const station of Object.values(doc.stations))
        station.poiUuids = station.poiUuids.filter((uuid) => uuid !== mission.ids.poiA);
    });
    await expect
      .poll(() => page.getByRole("region", { name: "Reference POI action trace" }).length)
      .toBe(0);
    if (remainingPoi)
      await expect
        .element(page.getByRole("region", { name: "Surviving outcrop action trace" }))
        .toBeVisible();
    else {
      await expect
        .element(page.getByText("No POIs in this mission.", { exact: true }))
        .toBeVisible();
      await expect
        .element(page.getByText("Choose a POI to trace its actions.", { exact: true }))
        .toBeVisible();
    }
    const after = await mission.read();
    expect(after.pois[mission.ids.poiA]).toBeUndefined();
    expect(after.evas).toEqual(before.evas);
    expect(after.traverses).toEqual(before.traverses);
    expect(after.rexes).toEqual(before.rexes);
    expect(after.reportCampaigns).toEqual(before.reportCampaigns);
    await page.getByText("EVA Comparison", { exact: true }).click();
    await expect
      .poll(() =>
        cells(page, "Station count")
          .elements()
          .map((element) => element.textContent.trim())
      )
      .toEqual(remainingPoi ? ["", ""] : []);
    await page.getByText("POI Traceability", { exact: true }).click();
    expect(await mission.read()).toEqual(after);
  });
}
