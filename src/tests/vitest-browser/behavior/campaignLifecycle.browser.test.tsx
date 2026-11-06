import { vi } from "vitest";
import type { BrowserPage } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { enablePlanningEditMode } from "./planningHelpers";
import { setChecked } from "./browserAssertions";
const test = base.extend({ scenario: "execution" as BehavioralScenario });
async function report(page: BrowserPage, title: string) {
  await page.getByLabelText("reports Section", { exact: true }).click();
  await page.getByText(title, { exact: true }).click();
}
for (const entry of ["EVA Comparison", "EVA STM Coverage"]) {
  test(`campaigns through ${entry} preserve ordered unique membership, independent identity and confirmation`, async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.actionSystemVersion = 2;
      doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
    });
    const before = await mission.read();
    await mission.open();
    await enablePlanningEditMode(page);
    await report(page, entry);
    await page.getByText("Campaigns\u2026", { exact: true }).click();
    const dialog = page.getBySelector("dialog[open]");
    await expect.element(dialog.getByText("No campaigns yet.", { exact: true })).toBeVisible();
    await dialog.getByText("New campaign", { exact: true }).click();
    await expect
      .poll(async () => Object.keys((await mission.read()).reportCampaigns).length)
      .toBe(1);
    const uuid = Object.keys((await mission.read()).reportCampaigns)[0];
    await dialog.getByLabelText("Campaign name", { exact: true }).fill("Surface campaign \u03b1");
    await dialog
      .getByLabelText("Description", { exact: true })
      .fill("Two surveys\nIndependent reporting membership");
    const alpha = dialog.getByRole("checkbox", { name: "Survey Alpha", exact: true });
    const bravo = dialog.getByRole("checkbox", { name: "Survey Bravo", exact: true });
    await expect.poll(() => dialog.getByRole("checkbox").length).toBe(2);
    await setChecked(alpha, true);
    await setChecked(bravo, true);
    await expect
      .poll(async () => (await mission.read()).reportCampaigns[uuid].memberEvaUuids)
      .toEqual([mission.ids.evaA, mission.ids.evaB]);
    await setChecked(alpha, false);
    await expect
      .poll(async () => (await mission.read()).reportCampaigns[uuid].memberEvaUuids)
      .toEqual([mission.ids.evaB]);
    await setChecked(alpha, true);
    await setChecked(alpha, true);
    await expect
      .poll(async () => (await mission.read()).reportCampaigns[uuid].memberEvaUuids)
      .toEqual([mission.ids.evaB, mission.ids.evaA]);
    await expect
      .poll(() => dialog.getByRole("checkbox", { name: "Stopped Alpha", exact: true }).length)
      .toBe(0);
    await expect.poll(() => dialog.getByRole("button", { name: /duplicate|copy/i }).length).toBe(0);
    const original = (await mission.read()).reportCampaigns[uuid];
    await dialog.getByText("New campaign", { exact: true }).click();
    await expect
      .poll(async () => Object.keys((await mission.read()).reportCampaigns).length)
      .toBe(2);
    const second = Object.keys((await mission.read()).reportCampaigns).find((key) => key !== uuid)!;
    expect((await mission.read()).reportCampaigns[second].memberEvaUuids).toEqual([]);
    await dialog
      .getByLabelText("Campaign name", { exact: true })
      .fill("Independent empty campaign");
    await expect
      .poll(async () => (await mission.read()).reportCampaigns[second].name)
      .toBe("Independent empty campaign");
    expect((await mission.read()).reportCampaigns[uuid]).toEqual(original);
    const beforeCancel = await mission.read();
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await dialog.getByRole("button", { name: "Delete Campaign", exact: true }).click();
    expect(await mission.read()).toEqual(beforeCancel);
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await dialog.getByRole("button", { name: "Delete Campaign", exact: true }).click();
    await expect.poll(async () => (await mission.read()).reportCampaigns[second]).toBeUndefined();
    await dialog.getByRole("button", { name: "Surface campaign \u03b1", exact: true }).click();
    await expect.element(alpha).toBeChecked();
    await expect.element(bravo).toBeChecked();
    await dialog.getByRole("button", { name: "Close campaigns", exact: true }).click();
    await report(page, "EVA Comparison");
    await page
      .getByRole("button", {
        name: "Surface campaign \u03b1: Planned set: Expand into member EVAs",
        exact: true,
      })
      .click();
    const members = page
      .getBySelector('[class*="columnGroup"]')
      .filter({
        has: page.getByRole("button", {
          name: "Surface campaign \u03b1: Planned set: Collapse EVAs",
          exact: true,
        }),
      })
      .getBySelector('[class*="stationHeaderCell"]');
    await expect
      .poll(() => members.elements().map((node) => node.textContent.trim()))
      .toEqual(["Survey Bravo", "Survey Alpha"]);
    const after = await mission.read();
    expect(after.reportCampaigns[uuid]).toEqual(original);
    for (const key of ["evas", "stations", "traverses", "actions", "pois", "rexes"] as const)
      expect(after[key]).toEqual(before[key]);
    await mission.open();
    await report(page, entry);
    await page.getByText("Campaigns\u2026", { exact: true }).click();
    await dialog.getByRole("button", { name: "Surface campaign \u03b1", exact: true }).click();
    await expect
      .element(dialog.getByLabelText("Description", { exact: true }))
      .toHaveValue(original.description);
    await expect.element(alpha).toBeChecked();
    await expect.element(bravo).toBeChecked();
    expect((await mission.read()).reportCampaigns[uuid].memberEvaUuids).toEqual([
      mission.ids.evaB,
      mission.ids.evaA,
    ]);
  });
}
