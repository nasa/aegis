import { exactText } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";
import {
  enablePlanningEditMode,
  openPlanningField,
  openPlanningSection,
  planningField,
  savePlanningField,
} from "./planningHelpers";

async function openPreferences(page: Page): Promise<void> {
  await openPlanningSection(page, "mission");
  await page.getByLabelText("prefs_panel", { exact: true }).click();
  await expect
    .element(page.getByLabelText("rightBodyTitle", { exact: true }))
    .toHaveTextContent(exactText("Mission Preferences"));
}

test.describe("Mission preference contracts", () => {
  test("mission text and numeric validation preserves saved values at rejected boundaries", async ({
    page,
    mission,
  }) => {
    await mission.open();
    await enablePlanningEditMode(page);
    await openPreferences(page);
    const before = await mission.read();
    for (const [label, value, error] of [
      ["Mission Name", "", "Required"],
      ["Mission Name", "N".repeat(51), "Must be at no more than 50 characters"],
      ["Mission Banner", "B".repeat(256), "Must be at no more than 255 characters"],
      ["Default EVA Duration", "-", "Not a valid number/float"],
      ["Default EVA Duration", "10000", "Must be at no more than 4 characters"],
      ["Average traverse rate", "-", "Not a valid number/float"],
      ["Average traverse rate", "123456789", "Must be at no more than 8 characters"],
      ["Default walkback rate", "-", "Not a valid number/float"],
      ["Default walkback rate", "123456789", "Must be at no more than 8 characters"],
    ]) {
      const dialog = await openPlanningField(page, label);
      await dialog.getByLabelText(label, { exact: true }).fill(value);
      await expect.element(dialog.getByText(error, { exact: true })).toBeVisible();
      await expect.element(dialog.getByText("Save", { exact: true })).toBeDisabled();
      await expect.element(dialog.getByLabelText(label, { exact: true })).toBeVisible();
      await dialog.getByText("Cancel", { exact: true }).click();
    }
    const after = await mission.read();
    for (const key of [
      "name",
      "missionBanner",
      "defaultEvaDuration",
      "traverseRate",
      "walkbackRate",
    ] as const) {
      expect(after[key]).toEqual(before[key]);
    }
    await savePlanningField(page, "Mission Name", "N".repeat(50));
    await savePlanningField(page, "Mission Banner", "B".repeat(255));
    const fractionalDuration = await openPlanningField(page, "Default EVA Duration");
    await fractionalDuration.getByLabelText("Default EVA Duration", { exact: true }).fill("1.5");
    await expect
      .element(fractionalDuration.getByLabelText("Default EVA Duration", { exact: true }))
      .toHaveValue("15");
    await fractionalDuration.getByText("Cancel", { exact: true }).click();
    // These optional fields accept signed/zero values; document the actual contract.
    for (const [label, key] of [
      ["Default EVA Duration", "defaultEvaDuration"],
      ["Average traverse rate", "traverseRate"],
      ["Default walkback rate", "walkbackRate"],
    ] as const) {
      for (const value of ["-2", "0", ""]) {
        const dialog = await openPlanningField(page, label);
        await dialog.getByLabelText(label, { exact: true }).fill(value);
        await dialog.getByText("Save", { exact: true }).click();
        await expect.poll(() => dialog.length).toBe(0);
        await expect
          .poll(async () => (await mission.read())[key])
          .toBe(value === "" ? null : Number(value));
      }
    }
    for (const label of ["Average traverse rate", "Default walkback rate"]) {
      await savePlanningField(page, label, "1.25");
    }
    await expect.poll(mission.read).toMatchObject({ traverseRate: 1.25, walkbackRate: 1.25 });
    await mission.open();
    await openPreferences(page);
    await expect
      .element(planningField(page, "Mission Name"))
      .toHaveTextContent(exactText("N".repeat(50)));
    await expect
      .element(planningField(page, "Mission Banner"))
      .toHaveTextContent(exactText("B".repeat(255)));
    await expect
      .element(planningField(page, "Average traverse rate"))
      .toHaveTextContent(exactText("1.25"));
    await expect
      .element(planningField(page, "Default walkback rate"))
      .toHaveTextContent(exactText("1.25"));
  });
});
