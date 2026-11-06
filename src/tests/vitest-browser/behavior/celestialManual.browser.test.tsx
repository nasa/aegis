import { isVisible } from "./browserAssertions";
import { commands } from "vitest/browser";
import { test, expect } from "./missionHarness";
import { enablePlanningEditMode, openPlanningField, selectPlanningEva } from "./planningHelpers";
import { expectAngles, showDirections } from "./celestialHelpers";

test("manual EVA directions validate drafts and retain independent saved values across presets and remount", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.planetRadius = 1737400;
    doc.evas[mission.ids.evaA].sunAzimuth = 17;
    doc.evas[mission.ids.evaA].earthAzimuth = 263;
    doc.evas[mission.ids.evaB].sunAzimuth = 211;
  });
  const original = await mission.read();
  await mission.open();
  await selectPlanningEva(page, "Survey Alpha");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await showDirections(page);
  await expectAngles(page, 17, 263);
  await expect
    .poll(() => page.getByRole("radiogroup", { name: "Sun/Earth direction mode" }).length)
    .toBe(0);
  await enablePlanningEditMode(page);
  for (const value of ["", "-1", "361", "invalid"]) {
    const dialog = await openPlanningField(page, "Sun azimuth");
    await dialog.getByLabelText("Sun azimuth", { exact: true }).fill(value);
    await expect.element(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await dialog.getByText("Cancel", { exact: true }).click();
    expect((await mission.read()).evas[mission.ids.evaA].sunAzimuth).toBe(17);
  }
  const cancel = await openPlanningField(page, "Sun azimuth");
  await cancel.getByLabelText("Sun azimuth", { exact: true }).fill("75");
  await expectAngles(page, 17, 263);
  await cancel.getByText("Cancel", { exact: true }).click();
  for (const degrees of [0, 90, 359, 360]) {
    for (const label of ["Sun azimuth", "Earth azimuth"]) {
      const dialog = await openPlanningField(page, label);
      await dialog.getByLabelText(label, { exact: true }).fill(String(degrees));
      await dialog.getByText("Save", { exact: true }).click();
      await expect.poll(() => dialog.length).toBe(0);
    }
    await expectAngles(page, degrees % 360, degrees % 360);
    await expect
      .poll(async () => (await mission.read()).evas[mission.ids.evaA])
      .toMatchObject({ sunAzimuth: degrees % 360, earthAzimuth: degrees % 360 });
  }
  await page.getByLabelText("preset Section", { exact: true }).click();
  await commands.mapPointer("move", 0, 0);
  await expect.poll(() => isVisible(page.getBySelector("#aegis-tooltip"))).toBe(false);
  await page
    .getByLabelText("mapPreset", { exact: true })
    .filter({ hasText: "Detail" })
    .getByText("Detail", { exact: true })
    .click();
  await expectAngles(page, 0, 0);
  await selectPlanningEva(page, "Survey Bravo");
  await expectAngles(page, 211, 0);
  await selectPlanningEva(page, "Survey Alpha");
  await expectAngles(page, 0, 0);
  await mission.open();
  await selectPlanningEva(page, "Survey Alpha");
  await expectAngles(page, 0, 0);
  const saved = await mission.read();
  expect(saved.presets).toEqual(original.presets);
  expect(saved.evas[mission.ids.evaB]).toEqual(original.evas[mission.ids.evaB]);
}, 30_000);
