import { exactText } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";
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
  await page.getByLabelText("prefs_panel", { exact: true }).click();
  await expect
    .element(page.getByLabelText("rightBodyTitle", { exact: true }))
    .toMatchTextContent(exactText("Mission Preferences"));
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
      .toMatchTextContent(exactText("N".repeat(50)));
    await expect
      .element(planningField(page, "Mission Banner"))
      .toMatchTextContent(exactText("B".repeat(255)));
    await expect
      .element(planningField(page, "Average traverse rate"))
      .toMatchTextContent(exactText("1.25"));
    await expect
      .element(planningField(page, "Default walkback rate"))
      .toMatchTextContent(exactText("1.25"));
  });
});

test("saved mission preferences update headers and new EVA defaults while canceled drafts preserve the document", async ({
  page,
  mission,
}) => {
  await mission.open();
  await enablePlanningEditMode(page);
  await openPreferences(page);
  const values = {
    name: "Polar survey",
    missionBanner: "Surface operations \u2014 \u03b1",
    defaultEvaDuration: 315,
    traverseRate: 3.5,
    walkbackRate: 1.25,
  };
  const fields = [
    ["Mission Name", values.name],
    ["Mission Banner", values.missionBanner],
    ["Default EVA Duration", "315"],
    ["Average traverse rate", "3.5"],
    ["Default walkback rate", "1.25"],
  ];
  for (const [label, value] of fields) {
    await savePlanningField(page, label, value);
    const saved = await mission.read();
    await cancelPlanningField(page, label, label.includes("rate") ? "9" : "Discarded");
    expect(await mission.read()).toEqual(saved);
  }
  await expect
    .element(page.getByLabelText("missionNameHeader", { exact: true }))
    .toMatchTextContent(values.name);
  await expect.element(page.getByText(values.missionBanner, { exact: true }).first()).toBeVisible();
  expect(await mission.read()).toMatchObject(values);
  await mission.open();
  await openPreferences(page);
  for (const [label, value] of fields)
    await expect.element(planningField(page, label)).toMatchTextContent(exactText(value));
  await enablePlanningEditMode(page);
  await openPlanningSection(page, "evas");
  await page.getByLabelText("addEva", { exact: true }).click();
  await expect.poll(async () => Object.keys((await mission.read()).evas).length).toBe(3);
  const created = Object.values((await mission.read()).evas).find(
    (eva) => ![mission.ids.evaA, mission.ids.evaB].includes(eva.uuid)
  );
  expect(created).toMatchObject({ duration: 315, traverseRate: 3.5 });
  await page.getByLabelText("info_panel", { exact: true }).click();
  await expect.element(planningField(page, "Duration")).toMatchTextContent("315");
  await expect.element(planningField(page, "Average Traverse Rate")).toMatchTextContent("3.5");
});
