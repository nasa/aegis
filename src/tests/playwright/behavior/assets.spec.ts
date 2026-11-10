import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { waitForPageReady } from "../helpers";
import { seedAsset } from "../fixtures/entitySeeds";

async function editAsset(page: Page, mission: BehavioralMission): Promise<void> {
  await mission.open(page);
  await waitForPageReady(page);
  await page.locator(".dv-tab").filter({ hasText: "Assets" }).click();
  await page
    .getByTestId("asset-row-shared-cache")
    .getByRole("button", { name: "Asset actions", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Edit Asset", exact: true }).click();
}

test("saving a stale asset editor preserves another client's changes to untouched fields", async ({
  page,
  mission,
}) => {
  await mission.change((m) => {
    m.assets["shared-cache"] = seedAsset({
      uuid: "shared-cache",
      name: "Surface cache",
      location: { lat: 0, lng: 0 },
      uncertaintyMeters: 15,
      notes: "Original notes",
    });
  });
  await editAsset(page, mission);
  const editor = page.getByTestId("asset-editor");
  await editor.getByTestId("asset-editor-name").fill("Renamed by first client");
  const peer = await page.context().newPage();
  await editAsset(peer, mission);
  const peerEditor = peer.getByTestId("asset-editor");
  await peerEditor.getByTestId("asset-editor-uncertainty").fill("40");
  await peerEditor.getByTestId("asset-editor-notes").fill("Updated by second client");
  await peerEditor.getByLabel("Save", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).assets["shared-cache"])
    .toMatchObject({
      name: "Surface cache",
      uncertaintyMeters: 40,
      notes: "Updated by second client",
    });
  await expect(editor.getByTestId("asset-editor-name")).toHaveValue("Renamed by first client");
  await editor.getByLabel("Save", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).assets["shared-cache"])
    .toMatchObject({
      name: "Renamed by first client",
      uncertaintyMeters: 40,
      notes: "Updated by second client",
      location: { lat: 0, lng: 0 },
    });
  await expect(peer.getByTestId("asset-row-shared-cache")).toContainText("Renamed by first client");
  await expect(peerEditor.getByLabel("Radius in meters", { exact: true })).toHaveText("40");
  await expect(editor.getByLabel("Radius in meters", { exact: true })).toHaveText("40");
});
