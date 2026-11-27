import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  openPlanningSection,
  planningField,
  savePlanningField,
} from "./planningHelpers";

async function openPreferences(page: Page): Promise<void> {
  await openPlanningSection(page, "mission");
  await page.getByLabel("prefs_panel", { exact: true }).click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toHaveText(
    "Mission Preferences"
  );
}

test.describe("Mission preference contracts", () => {
  test("saved mission name reaches a live peer header and survives reload", async ({
    page,
    context,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await openPreferences(page);
    const peer = await context.newPage();
    await mission.open(peer);
    await openPreferences(peer);

    await savePlanningField(page, "Mission Name", "Polar survey");
    await expect(peer.getByLabel("missionNameHeader", { exact: true })).toHaveText("Polar survey");
    await expect(planningField(peer, "Mission Name")).toHaveText("Polar survey");
    await peer.reload();
    await openPreferences(peer);
    await expect(planningField(peer, "Mission Name")).toHaveText("Polar survey");
    expect((await mission.read()).name).toBe("Polar survey");
  });
});
