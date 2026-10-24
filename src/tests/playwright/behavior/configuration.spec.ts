import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  cancelPlanningField,
  enablePlanningEditMode,
  openPlanningField,
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
  test("saved mission preferences reach the header and a peer while canceled edits stay local", async ({
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

    const values = {
      name: "Polar survey",
      missionBanner: "Surface operations — α",
      defaultEvaDuration: 315,
      traverseRate: 3.5,
      walkbackRate: 1.25,
    };
    for (const [label, value] of [
      ["Mission Name", values.name],
      ["Mission Banner", values.missionBanner],
      ["Default EVA Duration", "315"],
      ["Average traverse rate", "3.5"],
      ["Default walkback rate", "1.25"],
    ]) {
      await savePlanningField(page, label, value);
      await expect(planningField(peer, label)).toHaveText(value);
      await cancelPlanningField(page, label, label.includes("rate") ? "9" : "Discarded");
      await expect(planningField(peer, label)).toHaveText(value);
    }
    await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(values.name);
    await expect(peer.getByLabel("missionNameHeader", { exact: true })).toHaveText(values.name);
    await expect(page.getByText(values.missionBanner, { exact: true }).first()).toBeVisible();
    await expect.poll(mission.read).toMatchObject(values);
    await mission.open(page);
    await openPreferences(page);
    for (const [label, value] of [
      ["Mission Name", values.name],
      ["Mission Banner", values.missionBanner],
      ["Default EVA Duration", "315"],
      ["Average traverse rate", "3.5"],
      ["Default walkback rate", "1.25"],
    ]) {
      await expect(planningField(page, label)).toHaveText(value);
    }
    await enablePlanningEditMode(page);
    await openPlanningSection(page, "evas");
    await page.getByLabel("addEva", { exact: true }).click();
    await expect.poll(async () => Object.keys((await mission.read()).evas).length).toBe(3);
    const created = Object.values((await mission.read()).evas).find(
      (eva) => ![mission.ids.evaA, mission.ids.evaB].includes(eva.uuid)
    );
    expect(created).toMatchObject({ duration: 315, traverseRate: 3.5 });
    await page.getByLabel("info_panel", { exact: true }).click();
    await expect(planningField(page, "Duration")).toHaveText("315");
    await expect(planningField(page, "Average Traverse Rate")).toHaveText("3.5");
  });

  test("mission text and numeric validation preserves saved values at rejected boundaries", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
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
      await dialog.getByLabel(label, { exact: true }).fill(value);
      await expect(dialog.getByText(error, { exact: true })).toBeVisible();
      await dialog.getByText("Save", { exact: true }).click();
      await expect(dialog.getByLabel(label, { exact: true })).toBeVisible();
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
    await fractionalDuration.getByLabel("Default EVA Duration", { exact: true }).fill("1.5");
    await expect(
      fractionalDuration.getByLabel("Default EVA Duration", { exact: true })
    ).toHaveValue("15");
    await fractionalDuration.getByText("Cancel", { exact: true }).click();
    // These optional fields accept signed/zero values; document the actual contract.
    for (const [label, key] of [
      ["Default EVA Duration", "defaultEvaDuration"],
      ["Average traverse rate", "traverseRate"],
      ["Default walkback rate", "walkbackRate"],
    ] as const) {
      for (const value of ["-2", "0", ""]) {
        const dialog = await openPlanningField(page, label);
        await dialog.getByLabel(label, { exact: true }).fill(value);
        await dialog.getByText("Save", { exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect
          .poll(async () => (await mission.read())[key])
          .toBe(value === "" ? null : Number(value));
      }
    }
    for (const label of ["Average traverse rate", "Default walkback rate"]) {
      await savePlanningField(page, label, "1.25");
    }
    await expect.poll(mission.read).toMatchObject({ traverseRate: 1.25, walkbackRate: 1.25 });
    await mission.open(page);
    await openPreferences(page);
    await expect(planningField(page, "Mission Name")).toHaveText("N".repeat(50));
    await expect(planningField(page, "Mission Banner")).toHaveText("B".repeat(255));
    await expect(planningField(page, "Average traverse rate")).toHaveText("1.25");
    await expect(planningField(page, "Default walkback rate")).toHaveText("1.25");
  });
});
