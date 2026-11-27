import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode } from "./planningHelpers";

test("campaign creation, ordered membership and deletion reach an open peer and survive a server reload", async ({
  page,
  context,
  mission,
}) => {
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
  });
  await mission.open(page);
  await enablePlanningEditMode(page);
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText("EVA Comparison", { exact: true }).click();
  const peer = await context.newPage();
  await mission.open(peer);
  await peer.getByLabel("reports Section", { exact: true }).click();
  await peer.getByText("EVA Comparison", { exact: true }).click();
  await page.getByText("Campaigns\u2026", { exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByText("New campaign", { exact: true }).click();
  await dialog.getByLabel("Campaign name", { exact: true }).fill("Persisted campaign");
  await dialog.getByRole("checkbox", { name: "Survey Bravo", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "Survey Alpha", exact: true }).check();
  await expect
    .poll(async () => Object.values((await mission.read()).reportCampaigns)[0]?.memberEvaUuids)
    .toEqual([mission.ids.evaB, mission.ids.evaA]);
  const uuid = Object.keys((await mission.read()).reportCampaigns)[0];
  const header = peer.getByRole("button", {
    name: "Persisted campaign: Planned set: Expand into member EVAs",
    exact: true,
  });
  await expect(header).toBeVisible();
  await header.click();
  const members = peer
    .locator('[class*="columnGroup"]')
    .filter({
      has: peer.getByRole("button", {
        name: "Persisted campaign: Planned set: Collapse EVAs",
        exact: true,
      }),
    })
    .locator('[class*="stationHeaderCell"]');
  await expect(members).toHaveText(["Survey Bravo", "Survey Alpha"]);
  await peer.reload();
  await peer.getByLabel("reports Section", { exact: true }).click();
  await peer.getByText("EVA Comparison", { exact: true }).click();
  await expect(header).toBeVisible();
  expect((await mission.read()).reportCampaigns[uuid].memberEvaUuids).toEqual([
    mission.ids.evaB,
    mission.ids.evaA,
  ]);
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "Delete Campaign", exact: true }).click();
  await expect(header).toHaveCount(0);
  await expect.poll(async () => (await mission.read()).reportCampaigns[uuid]).toBeUndefined();
});
