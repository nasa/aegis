import { readFile } from "node:fs/promises";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode, openPlanningSection } from "./planningHelpers";

test.describe("ACCESS-004 cross-browser editing and downloads", () => {
  test("keyboard text edit persists and mission export downloads valid JSON", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await openPlanningSection(page, "mission");
    const trigger = page.getByRole("button", { name: "Mission Banner edit", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.locator("dialog[open]");
    await expect(dialog.getByLabel("Mission Banner", { exact: true })).toBeVisible();
    await dialog
      .getByLabel("Mission Banner", { exact: true })
      .fill("Keyboard updated surface plan");
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(trigger.locator('div[aria-label="Mission Banner"]')).toHaveText(
      "Keyboard updated surface plan"
    );
    await expect
      .poll(async () => (await mission.read()).missionBanner)
      .toBe("Keyboard updated surface plan");

    await page.getByLabel("export_panel", { exact: true }).click();
    await page.locator("#export-mission").setChecked(true);
    const pending = page.waitForEvent("download");
    await page.getByLabel("Export JSON File", { exact: true }).click();
    const download = await pending;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toContain("_export.json");
    const data = JSON.parse(await readFile(await download.path(), "utf8")) as {
      exportMission?: { missionBanner?: string };
    };
    expect(data.exportMission?.missionBanner).toBe("Keyboard updated surface plan");
  });
});
