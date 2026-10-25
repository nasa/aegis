import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode } from "./planningHelpers";

test.use({ scenario: "execution" });

async function reports(page: Page, title: string) {
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText(title, { exact: true }).click();
}

for (const entry of ["EVA Comparison", "EVA STM Coverage"] as const) {
  test(`campaign lifecycle through ${entry} preserves unique ordered plan membership, confirmation and reload`, async ({
    page,
    context,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.actionSystemVersion = 2;
      doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
    });
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await reports(page, entry);
    const peer = await context.newPage();
    await mission.open(peer);
    await reports(peer, "EVA Comparison");
    await page.getByText("Campaigns…", { exact: true }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog.getByText("No campaigns yet.", { exact: true })).toBeVisible();
    await dialog.getByText("New campaign", { exact: true }).click();
    await expect
      .poll(async () => Object.keys((await mission.read()).reportCampaigns).length)
      .toBe(1);
    const uuid = Object.keys((await mission.read()).reportCampaigns)[0];
    await dialog.getByLabel("Campaign name", { exact: true }).fill("Surface campaign α");
    await dialog
      .getByLabel("Description", { exact: true })
      .fill("Two surveys\nIndependent reporting membership");
    const alpha = dialog.getByRole("checkbox", { name: "Survey Alpha", exact: true });
    const bravo = dialog.getByRole("checkbox", { name: "Survey Bravo", exact: true });
    await expect(dialog.getByRole("checkbox")).toHaveCount(2);
    await alpha.check();
    await bravo.check();
    await expect
      .poll(async () => (await mission.read()).reportCampaigns[uuid].memberEvaUuids)
      .toEqual([mission.ids.evaA, mission.ids.evaB]);
    await alpha.uncheck();
    await expect
      .poll(async () => (await mission.read()).reportCampaigns[uuid].memberEvaUuids)
      .toEqual([mission.ids.evaB]);
    await alpha.check();
    await alpha.check();
    await expect
      .poll(async () => (await mission.read()).reportCampaigns[uuid].memberEvaUuids)
      .toEqual([mission.ids.evaB, mission.ids.evaA]);
    await expect(dialog.getByRole("checkbox", { name: "Stopped Alpha", exact: true })).toHaveCount(
      0
    );
    // Campaigns have no duplicate or manual drag-order operation. Reinserted
    // members append once, and a second new campaign starts independently empty.
    await expect(dialog.getByRole("button", { name: /duplicate|copy/i })).toHaveCount(0);
    const original = (await mission.read()).reportCampaigns[uuid];
    await dialog.getByText("New campaign", { exact: true }).click();
    await expect
      .poll(async () => Object.keys((await mission.read()).reportCampaigns).length)
      .toBe(2);
    const second = Object.keys((await mission.read()).reportCampaigns).find((key) => key !== uuid)!;
    expect((await mission.read()).reportCampaigns[second].memberEvaUuids).toEqual([]);
    await dialog.getByLabel("Campaign name", { exact: true }).fill("Independent empty campaign");
    await expect
      .poll(async () => (await mission.read()).reportCampaigns[second].name)
      .toBe("Independent empty campaign");
    expect((await mission.read()).reportCampaigns[uuid]).toEqual(original);
    const beforeCancel = await mission.read();
    page.once("dialog", (confirmation) => confirmation.dismiss());
    await dialog.getByRole("button", { name: "Delete Campaign", exact: true }).click();
    expect(await mission.read()).toEqual(beforeCancel);
    page.once("dialog", (confirmation) => confirmation.accept());
    await dialog.getByRole("button", { name: "Delete Campaign", exact: true }).click();
    await expect.poll(async () => (await mission.read()).reportCampaigns[second]).toBeUndefined();
    await dialog.getByRole("button", { name: "Surface campaign α", exact: true }).click();
    await expect(alpha).toBeChecked();
    await expect(bravo).toBeChecked();
    await dialog.getByRole("button", { name: "Close campaigns", exact: true }).click();
    await expect(
      peer.getByRole("button", {
        name: "Surface campaign α: Planned set: Expand into member EVAs",
        exact: true,
      })
    ).toBeVisible();
    await peer
      .getByRole("button", {
        name: "Surface campaign α: Planned set: Expand into member EVAs",
        exact: true,
      })
      .click();
    const members = peer
      .locator('[class*="columnGroup"]')
      .filter({
        has: peer.getByRole("button", {
          name: "Surface campaign α: Planned set: Collapse EVAs",
          exact: true,
        }),
      })
      .locator('[class*="stationHeaderCell"]');
    await expect(members).toHaveText(["Survey Bravo", "Survey Alpha"]);
    const after = await mission.read();
    expect(after.reportCampaigns[uuid]).toEqual(original);
    for (const key of ["evas", "stations", "traverses", "actions", "pois", "rexes"] as const)
      expect(after[key]).toEqual(before[key]);
    await mission.open(page);
    await reports(page, entry);
    await page.getByText("Campaigns…", { exact: true }).click();
    await dialog.getByRole("button", { name: "Surface campaign α", exact: true }).click();
    await expect(dialog.getByLabel("Description", { exact: true })).toHaveValue(
      original.description
    );
    await expect(alpha).toBeChecked();
    await expect(bravo).toBeChecked();
    expect((await mission.read()).reportCampaigns[uuid].memberEvaUuids).toEqual([
      mission.ids.evaB,
      mission.ids.evaA,
    ]);
  });
}
