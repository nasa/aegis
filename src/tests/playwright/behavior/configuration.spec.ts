import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  cancelPlanningField,
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
});
